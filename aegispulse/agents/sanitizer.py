"""Input sanitisation and prompt-injection defence for untrusted threat intel.

Dark-web posts, Telegram dumps and paste-site content are attacker-authored.
Before any of it reaches a model we:

1. Normalise Unicode (NFKC) so homoglyph / full-width tricks collapse.
2. Strip control characters, zero-width characters and bidi overrides that
   can hide instructions from a human reviewer.
3. Enforce a hard length budget.
4. Detect common injection phrasing and record *signals* (we do not delete
   the text: analysts need the evidence, and deletion is trivially evaded).
5. Wrap the content in a per-request nonce-tagged envelope and neutralise any
   attempt to forge the closing tag, so the model can always tell where
   untrusted data ends.

These are defence-in-depth layers. The structural defences live in the
pipeline: schema-constrained outputs, IoC grounding against the source text,
read-only tools, mandatory human approval for scripts, and alert dispatch
that is decided by code, never by a model.
"""

from __future__ import annotations

import hashlib
import re
import secrets
import unicodedata
from dataclasses import dataclass, field

MAX_INPUT_CHARS = 50_000

# Zero-width, bidi embedding/override/isolate characters, BOM, soft hyphen.
_INVISIBLE = re.compile(
    "[­​-‏‪-‮⁠-⁤⁦-⁩﻿]"
)
# C0/C1 control characters except tab, newline, carriage return.
_CONTROL = re.compile("[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]")

_INJECTION_PATTERNS: dict[str, re.Pattern[str]] = {
    "override_instructions": re.compile(
        r"\b(ignore|disregard|forget|override)\b[^.\n]{0,40}\b(previous|prior|above|all|earlier|system)\b[^.\n]{0,20}\b(instructions?|prompts?|rules?|directives?)",
        re.I,
    ),
    "role_reassignment": re.compile(r"\byou are now\b|\bact as (an?|the)\b|\bnew persona\b", re.I),
    "fake_role_marker": re.compile(r"^\s*(system|assistant|developer)\s*:", re.I | re.M),
    "chat_template_token": re.compile(r"<\|?(im_start|im_end|system|endoftext)\|?>", re.I),
    "envelope_forgery": re.compile(r"</?\s*untrusted_threat_intel", re.I),
    "severity_manipulation": re.compile(
        r"\b(set|rate|mark|classify|score)\b[^.\n]{0,30}\b(severity|priority|score|risk)\b[^.\n]{0,20}\b(0|zero|low|benign|safe|none|info)",
        re.I,
    ),
    "exfiltration_request": re.compile(
        r"\b(reveal|print|output|repeat|show)\b[^.\n]{0,30}\b(system prompt|instructions|api key|secret)",
        re.I,
    ),
    "tool_coercion": re.compile(r"\b(call|invoke|execute|run)\b[^.\n]{0,20}\b(tool|function|command)\b", re.I),
}


@dataclass(slots=True)
class SanitizedInput:
    text: str
    original_chars: int
    truncated: bool
    removed_control_chars: int
    injection_signals: list[str] = field(default_factory=list)

    @property
    def content_hash(self) -> str:
        return content_hash(self.text)


def normalize_for_hash(text: str) -> str:
    """Whitespace/case-insensitive canonical form used for deduplication."""
    return re.sub(r"\s+", " ", text).strip().lower()


def content_hash(text: str) -> str:
    return hashlib.sha256(normalize_for_hash(text).encode("utf-8")).hexdigest()


def sanitize_threat_text(raw: str, max_chars: int = MAX_INPUT_CHARS) -> SanitizedInput:
    """Normalise and inspect untrusted intel text. Never raises on content."""
    original_chars = len(raw)
    text = unicodedata.normalize("NFKC", raw)
    invisible_removed = len(_INVISIBLE.findall(text))
    text = _INVISIBLE.sub("", text)
    control_removed = len(_CONTROL.findall(text))
    text = _CONTROL.sub("", text)
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"\n{4,}", "\n\n\n", text).strip()

    truncated = len(text) > max_chars
    if truncated:
        text = text[:max_chars]

    signals = [name for name, pattern in _INJECTION_PATTERNS.items() if pattern.search(text)]
    if invisible_removed:
        signals.append("hidden_unicode_characters")

    return SanitizedInput(
        text=text,
        original_chars=original_chars,
        truncated=truncated,
        removed_control_chars=control_removed + invisible_removed,
        injection_signals=signals,
    )


def wrap_untrusted(text: str, *, source: str) -> tuple[str, str]:
    """Wrap untrusted text in a nonce-tagged envelope.

    Returns ``(envelope, nonce)``. Any attempt inside ``text`` to open or close
    the envelope tag is defanged so the boundary cannot be forged.
    """
    nonce = secrets.token_hex(8)
    safe = re.sub(
        r"<(/?)\s*untrusted_threat_intel",
        lambda m: f"&lt;{m.group(1)}untrusted_threat_intel",
        text,
        flags=re.I,
    )
    safe_source = re.sub(r"[^a-zA-Z0-9_. -]", "", source)[:64] or "unknown"
    envelope = (
        f'<untrusted_threat_intel nonce="{nonce}" source="{safe_source}">\n'
        f"{safe}\n"
        f'</untrusted_threat_intel nonce="{nonce}">'
    )
    return envelope, nonce
