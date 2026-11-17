"""Optional Claude pass that rewrites titles, the description hook and the pinned comment.

The template output from metadata.py is always the fallback: anything Claude returns goes through
the same validation (length, banned phrases), and on any error the template metadata is kept.
"""
from __future__ import annotations

import json
import logging

from .metadata import MetadataError, TITLE_MAX, check_text, validate
from .planner import VideoPlan

log = logging.getLogger(__name__)

SYSTEM = """You write YouTube metadata for a channel that publishes AI-generated crash simulations of
luxury cars, supercars and hypercars hitting concrete walls. Goal: maximum click-through and
subscriber growth while staying honest.

Rules:
- English. Titles at most 70 characters, curiosity-driven, concrete (car names, speeds, prices).
- Never claim or imply the footage is real: no "real footage", "caught on camera", "dashcam", news framing.
- No people, deaths or injuries. No ALL-CAPS titles (one capitalised word is fine). No emojis.
- The hook is one or two sentences that will be the first lines of the description.
- The pinned comment asks a question that is easy to answer and invites the viewer to pick the next car."""

SCHEMA = {
    "type": "object",
    "properties": {
        "titles": {"type": "array", "items": {"type": "string"}},
        "hook": {"type": "string"},
        "pinned_comment": {"type": "string"},
    },
    "required": ["titles", "hook", "pinned_comment"],
    "additionalProperties": False,
}


def _brief(plan: VideoPlan, meta: dict, production: dict) -> str:
    cars = ", ".join(f"{c.name} (~{c.price_label})" for c in plan.cars)
    return (f"Video type: {'long-form ' + production['duration'] if plan.kind == 'long' else 'YouTube Short'}\n"
            f"Format: {plan.format_key}\nCars: {cars}\nSpeeds km/h: {plan.speeds}\n"
            f"Template titles: {[meta['title'], *meta['title_alternatives']]}\n"
            "Return 3 title options (best first), the hook and the pinned comment.")


def polish(plan: VideoPlan, meta: dict, production: dict, model: str = "claude-opus-5-5", client=None) -> dict:
    try:
        if client is None:
            import anthropic
            client = anthropic.Anthropic()
        response = client.beta.messages.create(
            model=model,
            max_tokens=4000,
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
            output_config={"effort": "low", "format": {"type": "json_schema", "schema": SCHEMA}},
            system=SYSTEM,
            messages=[{"role": "user", "content": _brief(plan, meta, production)}],
        )
        if response.stop_reason in ("refusal", "max_tokens"):
            log.warning("claude polish skipped: stop_reason=%s", response.stop_reason)
            return meta
        text = next(b.text for b in response.content if b.type == "text")
        data = json.loads(text)
        return merge(meta, data)
    except Exception as e:   # the template metadata is a complete, valid fallback
        log.warning("claude polish failed, using template metadata: %s", type(e).__name__)
        return meta


def merge(meta: dict, data: dict) -> dict:
    titles = []
    for t in data.get("titles", []):
        t = t.strip()
        try:
            check_text(t, "title")
        except MetadataError:
            continue
        if 0 < len(t) <= TITLE_MAX:
            titles.append(t)
    if not titles:
        return meta
    out = dict(meta)
    out["title"] = titles[0]
    out["title_alternatives"] = titles[1:] + [meta["title"], *meta["title_alternatives"]][:3]
    hook = data.get("hook", "").strip()
    first, rest = meta["description"].split("\n", 1)
    if hook:
        try:
            check_text(hook, "hook")
            first = hook
        except MetadataError:
            pass
    out["description"] = first + "\n" + rest
    pinned = data.get("pinned_comment", "").strip()
    if pinned:
        try:
            check_text(pinned, "pinned comment")
            out["pinned_comment"] = pinned
        except MetadataError:
            pass
    out["llm_polished"] = True
    try:
        validate(out)
    except MetadataError:
        return meta
    return out
