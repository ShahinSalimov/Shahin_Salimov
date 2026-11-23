"""Split a finished script into scenes (one image + one voice clip each)."""
from __future__ import annotations

import re

MAX_SENTENCES = 3
MAX_CHARS = 225              # ≈15 s of narration at ~15 chars/s
FIRST_SINGLE = 8             # opening scenes change fast to hold attention
CHARS_PER_SECOND = 15

_SENT = re.compile(r"(?<=[.!?…])[\"')\]]*\s+(?=[\"'(\[]?[A-ZÀ-ÖØ-ÞƏÜÖĞIİŞÇА-ЯЁ0-9(\[])")


def split_sentences(paragraph: str) -> list[str]:
    return [x.strip() for x in _SENT.split(paragraph.strip()) if x.strip()]


def split_scenes(script: str) -> list[dict]:
    """Paragraph-aware: a scene never spans two paragraphs."""
    groups: list[list[str]] = []
    for para in re.split(r"\n\s*\n", script.strip()):
        cur: list[str] = []
        for sent in split_sentences(para):
            limit = 1 if len(groups) < FIRST_SINGLE else MAX_SENTENCES
            if cur and (len(cur) >= limit or len(" ".join(cur + [sent])) > MAX_CHARS):
                groups.append(cur)
                cur = []
            cur.append(sent)
        if cur:
            groups.append(cur)
    return [{"id": f"s{i + 1:03d}", "text": " ".join(g)} for i, g in enumerate(groups)]


def speech_seconds(text: str) -> float:
    return len(text) / CHARS_PER_SECOND
