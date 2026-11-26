"""SALIMOFFF GARAGE publishing plan and markdown metadata parser.

The plan (which video goes out when) lives here. Titles, descriptions and tags
are read from the episode markdown files, so the package stays the single
source of truth for metadata.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field, asdict
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

PACKAGE_DIR = Path(__file__).resolve().parent.parent

# Slot times in UTC. Chosen for the Europe + North America overlap:
#   14:00 UTC = 15:00 CET / 09:00 ET / 06:00 PT
#   16:00 UTC = 17:00 CET / 11:00 ET / 08:00 PT   (long video)
#   18:00 UTC = 19:00 CET / 13:00 ET / 10:00 PT   (main episode)
#   23:00 UTC = 00:00 CET / 18:00 ET / 15:00 PT
SLOT_EARLY, SLOT_LONG, SLOT_MAIN, SLOT_LATE = "14:00", "16:00", "18:00", "23:00"

# Day offsets relative to the start date and what is published in each slot.
# Days 0 and 1: 1 long video + 3 Shorts per day.
# From day 3 on, every other day: Macro Moment + main episode + Prompt Reveal.
LAUNCH_DAYS = [
    {SLOT_EARLY: "EP002", SLOT_LONG: "L01", SLOT_MAIN: "EP001", SLOT_LATE: "EP003"},
    {SLOT_EARLY: "EP005", SLOT_LONG: "L02", SLOT_MAIN: "EP004", SLOT_LATE: "EP006"},
]
MAIN_SEQUENCE = [
    "EP007", "EP008", "EP009", "EP010", "EP011", "EP012", "EP013",
    "EP014", "EP016", "EP017", "EP018", "EP019", "EP015",
]
DEFAULT_START = date(2026, 11, 27)

CATEGORY_AUTOS = "2"
MAX_TITLE, MAX_DESC, MAX_TAGS_CHARS = 100, 5000, 500


@dataclass
class Item:
    id: str
    kind: str  # "short" or "long"
    series: str
    publish_at: str  # ISO 8601 UTC, e.g. 2026-11-27T18:00:00Z
    title: str
    description: str
    tags: list[str] = field(default_factory=list)
    video_file: str = ""
    thumbnail_file: str = ""

    def to_dict(self) -> dict:
        return asdict(self)


# ---------- markdown parsing ----------

_TITLE_RE = re.compile(r"^\*\*Title:\*\*\s*`([^`]+)`", re.M)
_TAGS_RE = re.compile(r"^\*\*Tags:\*\*\s*`([^`]+)`", re.M)
_DESC_RE = re.compile(r"^\*\*Description\*\*\s*\n```[a-z]*\n(.*?)\n```", re.M | re.S)
_SERIES_RE = re.compile(r"^#\s+\S+\s+—\s+([^:\n]+?)(?::|\s+—|$)", re.M)


def parse_metadata(md: str) -> dict:
    """Extract title, description, tags and series from one markdown section."""
    title = _TITLE_RE.search(md)
    desc = _DESC_RE.search(md)
    tags = _TAGS_RE.search(md)
    if not (title and desc and tags):
        missing = [n for n, m in (("Title", title), ("Description", desc), ("Tags", tags)) if not m]
        raise ValueError(f"metadata missing: {', '.join(missing)}")
    series = _SERIES_RE.search(md)
    return {
        "title": title.group(1).strip(),
        "description": desc.group(1).strip(),
        "tags": [t.strip() for t in tags.group(1).split(",") if t.strip()],
        "series": re.sub(r"\s*#\d+$", "", series.group(1).strip()) if series else "",
    }


def _find_file(pattern: str) -> Path:
    hits = sorted(PACKAGE_DIR.glob(pattern))
    if not hits:
        raise FileNotFoundError(pattern)
    return hits[0]


def load_episode(ep_id: str) -> dict:
    folder = "13_Uzun_Videolar" if ep_id.startswith("L") else "10_Epizodlar"
    meta = parse_metadata(_find_file(f"{folder}/{ep_id}_*.md").read_text(encoding="utf-8"))
    if ep_id.startswith("L"):
        meta["series"] = meta["series"].split(":")[0]
    return meta


def load_macro_moments() -> dict[str, dict]:
    text = (PACKAGE_DIR / "14_Macro_Moments.md").read_text(encoding="utf-8")
    out = {}
    for chunk in re.split(r"^## (?=MM\d\d)", text, flags=re.M)[1:]:
        mm_id = chunk[:4]
        meta = parse_metadata(chunk)
        meta["series"] = "Macro Moments"
        out[mm_id] = meta
    return out


def prompt_reveal_meta(n: int, episode: dict) -> dict:
    ep_title = episode["title"]
    prefix, suffix = 'The Exact AI Prompt Behind "', '"'
    room = MAX_TITLE - len(prefix) - len(suffix)
    short = ep_title if len(ep_title) <= room else ep_title[: room - 3].rstrip() + "..."
    return {
        "title": f"{prefix}{short}{suffix}",
        "description": (
            f'This is the exact prompt I used for "{ep_title}". Full prompt in the pinned comment.\n'
            "Tools: Kling (video), Suno (music), CapCut (edit).\n\n"
            "Made with AI tools. Synthetic content. author: SALIMOFFF\n"
            "#AIPrompt #AIVideo #Kling #PromptEngineering #AICars #Shorts"
        ),
        "tags": ["ai prompt", "ai video prompt", "kling prompt", "prompt engineering",
                 "how to make ai video", "ai cars", "salimofff"],
        "series": "Prompt Reveal",
    }


# ---------- schedule ----------

def _iso(day: date, hhmm: str) -> str:
    h, m = map(int, hhmm.split(":"))
    return datetime(day.year, day.month, day.day, h, m, tzinfo=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def validate(item: Item) -> list[str]:
    errors = []
    if len(item.title) > MAX_TITLE:
        errors.append(f"{item.id}: title longer than {MAX_TITLE} chars")
    if len(item.description) > MAX_DESC:
        errors.append(f"{item.id}: description longer than {MAX_DESC} chars")
    if any(ch in item.title + item.description for ch in "<>"):
        errors.append(f"{item.id}: '<' or '>' is not allowed in title/description")
    if sum(len(t) + 1 for t in item.tags) > MAX_TAGS_CHARS:
        errors.append(f"{item.id}: tags exceed {MAX_TAGS_CHARS} chars")
    return errors


def build_schedule(start: date = DEFAULT_START) -> list[Item]:
    items: list[Item] = []
    mm = load_macro_moments()

    def add(item_id: str, day: date, slot: str, meta: dict, kind: str = "short"):
        items.append(Item(
            id=item_id, kind=kind, series=meta["series"], publish_at=_iso(day, slot),
            title=meta["title"], description=meta["description"], tags=meta["tags"],
            video_file=f"videos/{item_id}.mp4",
            thumbnail_file=f"thumbnails/{item_id}.jpg" if kind == "long" else "",
        ))

    for offset, slots in enumerate(LAUNCH_DAYS):
        day = start + timedelta(days=offset)
        for slot, vid in sorted(slots.items()):
            add(vid, day, slot, load_episode(vid), "long" if vid.startswith("L") else "short")

    first_regular = start + timedelta(days=len(LAUNCH_DAYS) + 1)
    for n, ep in enumerate(MAIN_SEQUENCE, start=1):
        day = first_regular + timedelta(days=2 * (n - 1))
        episode = load_episode(ep)
        add(f"MM{n:02d}", day, SLOT_EARLY, mm[f"MM{n:02d}"])
        add(ep, day, SLOT_MAIN, episode)
        add(f"PR{n:02d}", day, SLOT_LATE, prompt_reveal_meta(n, episode))

    items.sort(key=lambda i: i.publish_at)
    problems = [e for it in items for e in validate(it)]
    if problems:
        raise ValueError("\n".join(problems))
    return items
