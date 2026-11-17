"""YouTube metadata: title, description (with chapters and AI disclosure), tags, pinned comment.

Limits enforced here follow YouTube's documented limits: title 100 characters, description 5000
bytes, tags 500 characters in total (a tag containing a space counts its surrounding quotes).
"""
from __future__ import annotations

import re

from .catalog import BANNED_PHRASES, BASE_TAGS
from .planner import VideoPlan
from .prompts import fill

TITLE_MAX = 100
DESC_MAX = 5000
TAGS_MAX = 500
CATEGORY_AUTOS = "2"      # YouTube category "Autos & Vehicles"

DISCLOSURE = ("All crashes in this video are AI-generated simulations (CGI). No real vehicles were destroyed "
              "and no people were involved or harmed. This is not real footage.")
TRADEMARK = ("Brand and model names are used only to identify the cars shown. This channel is not affiliated "
             "with, sponsored or endorsed by any car manufacturer.")


class MetadataError(ValueError):
    pass


def tags_length(tags: list[str]) -> int:
    return sum(len(t) + (2 if " " in t else 0) for t in tags) + max(0, len(tags) - 1)


def fit_tags(tags: list[str], limit: int = TAGS_MAX) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    for t in tags:
        t = re.sub(r"[<>,]", "", t).strip().lower()
        if not t or t in seen or len(t) > 100:
            continue
        if tags_length(out + [t]) > limit:
            continue
        out.append(t)
        seen.add(t)
    return out


def check_text(text: str, where: str) -> None:
    low = text.lower()
    for phrase in BANNED_PHRASES:
        if re.search(rf"\b{re.escape(phrase)}\b", low):
            raise MetadataError(f"{where} contains a banned phrase: {phrase!r}")
    if "<" in text or ">" in text:
        raise MetadataError(f"{where} may not contain < or >")


def titles_for(plan: VideoPlan) -> list[str]:
    f = fill(plan)
    out = []
    for tpl in plan.fmt.titles:
        title = tpl.format(**f)
        if len(title) <= TITLE_MAX:
            out.append(title)
    first = plan.title_index % len(out)
    return out[first:] + out[:first]


def build_tags(plan: VideoPlan) -> list[str]:
    # most specific first: fit_tags drops whatever no longer fits in 500 characters
    cars = plan.cars
    tags = [f"{c.name} crash" for c in cars]
    if len(cars) >= 2:
        tags.append(f"{cars[0].model} vs {cars[1].model}")
    tags += BASE_TAGS[:6]
    tags += [c.name for c in cars] + [f"{c.model} crash test" for c in cars]
    tags += [f"{c.brand} crash" for c in cars] + [f"{s} km/h crash" for s in plan.speeds[:2]]
    if plan.kind == "short":
        tags += ["shorts", "car shorts"]
    tags += BASE_TAGS[6:] + [c.brand for c in cars]
    return fit_tags(tags)


def build_hashtags(plan: VideoPlan) -> list[str]:
    brands = []
    for c in plan.cars:
        h = "#" + re.sub(r"[^A-Za-z0-9]", "", c.brand).lower()
        if h not in brands:
            brands.append(h)
    base = ["#supercar", "#carcrash", "#crashtest"]
    lead = ["#shorts"] if plan.kind == "short" else []
    return (lead + brands[:2] + base)[:5]


def chapters(production: dict) -> str:
    lines = []
    for seg in production["segments"]:
        s = seg["start"]
        lines.append(f"{s // 60}:{s % 60:02d} {seg['label']}")
    return "\n".join(lines)


def build_description(plan: VideoPlan, production: dict, title: str, long_url: str | None = None,
                      channel_handle: str = "") -> str:
    f = fill(plan)
    question = plan.fmt.hook_question.format(**f)
    cars_line = " | ".join(f"{c.name} (~{c.price_label})" for c in plan.cars)
    hashtags = " ".join(build_hashtags(plan))
    sub = f"https://www.youtube.com/{channel_handle}?sub_confirmation=1" if channel_handle else ""
    parts = [
        f"{title}. {question}",
        "",
        (f"In this crash simulation {'the ' + plan.cars[0].name if len(plan.cars) == 1 else 'every car'} hits a concrete "
         f"wall at {' / '.join(map(str, plan.speeds))} km/h, filmed from every angle in extreme slow motion. Watch how "
         "carbon fiber, aluminium and steel behave when they meet a wall that does not move."),
        "",
        f"Cars: {cars_line}",
        "Prices are approximate original prices.",
    ]
    if plan.kind == "long":
        parts += ["", "Chapters:", chapters(production)]
    if long_url:
        parts += ["", f"Full crash test: {long_url}"]
    parts += ["", "New supercar crash test every day. Comment which car should hit the wall next - the most "
              "liked comment gets picked."]
    if sub:
        parts.append(f"Subscribe: {sub}")
    parts += ["", DISCLOSURE, TRADEMARK, "", hashtags]
    desc = "\n".join(parts)
    if len(desc.encode()) > DESC_MAX:
        raise MetadataError("description longer than 5000 bytes")
    return desc


def pinned_comment(plan: VideoPlan) -> str:
    f = fill(plan)
    return (f"{plan.fmt.hook_question.format(**f)} Reply with the car you want to see hit the wall next - "
            "I build the next video from the top reply.")


def build_metadata(plan: VideoPlan, production: dict, long_url: str | None = None, channel_handle: str = "",
                   language: str = "en") -> dict:
    titles = titles_for(plan)
    title = titles[0]
    meta = {
        "title": title,
        "title_alternatives": titles[1:],
        "description": build_description(plan, production, title, long_url, channel_handle),
        "tags": build_tags(plan),
        "hashtags": build_hashtags(plan),
        "pinned_comment": pinned_comment(plan),
        "category_id": CATEGORY_AUTOS,
        "playlist": plan.fmt.playlist,
        "language": language,
        "contains_synthetic_media": True,
        "made_for_kids": False,
    }
    validate(meta)
    return meta


def validate(meta: dict) -> None:
    if not meta["title"] or len(meta["title"]) > TITLE_MAX:
        raise MetadataError(f"title must be 1-{TITLE_MAX} characters")
    check_text(meta["title"], "title")
    # the disclosure itself says "not real footage", so it is excluded from the phrase check
    check_text(meta["description"].replace(DISCLOSURE, ""), "description")
    if DISCLOSURE not in meta["description"]:
        raise MetadataError("description is missing the AI disclosure")
    if tags_length(meta["tags"]) > TAGS_MAX:
        raise MetadataError("tags exceed 500 characters")
