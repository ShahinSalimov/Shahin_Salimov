"""Storage for research runs, channels and their activity (JSON files under data/salimoff)."""
from __future__ import annotations

import time
import uuid

from .. import store

ROOT = store.DATA / "salimoff"
_lock = store._lock


def _dir(kind: str):
    return ROOT / kind


def new_id() -> str:
    return uuid.uuid4().hex[:10]


def _safe(item_id: str) -> str:
    if not item_id or not item_id.isalnum():
        raise KeyError(item_id)
    return item_id


# ---------- research ----------
def save_research(r: dict) -> dict:
    with _lock:
        r["updated"] = time.time()
        store._write(_dir("research") / f"{_safe(r['id'])}.json", r)
        return r


def get_research(rid: str) -> dict:
    path = _dir("research") / f"{_safe(rid)}.json"
    if not path.exists():
        raise KeyError(rid)
    return store._read(path, {})


def list_research() -> list[dict]:
    d = _dir("research")
    if not d.exists():
        return []
    out = [store._read(f, {}) for f in d.glob("*.json")]
    return sorted(({"id": r["id"], "created": r["created"], "status": r.get("status"),
                    "decision": (r.get("decision") or {}).get("niche", ""), "input": r.get("input", {})}
                   for r in out), key=lambda x: -x["created"])


# ---------- channels ----------
DEFAULT_AUTOPILOT = {
    "enabled": False,
    "mode": "approve",          # approve: only approved ideas are produced; full: system decides everything
    "long_per_week": 2,
    "shorts_per_week": 7,
    "publish_hour_long": 18,
    "publish_hour_short": 13,
    "timezone": "Asia/Baku",
    "buffer_long": 2,           # ready-to-publish videos kept ahead
    "buffer_short": 4,
    "max_parallel": 1,
    "daily_budget_usd": 10.0,
    "report_every_days": 3,
    "auto_upload": True,
    "privacy": "public",        # final visibility after publishAt
}


def create_channel(data: dict) -> dict:
    ch = {
        "id": new_id(), "created": time.time(), "updated": time.time(),
        "name": "", "niche": "", "language": "English", "research_id": "",
        "status": "draft",       # draft → ready → active
        "blueprint": {}, "profiles": {"long": "", "short": ""}, "style_id": "",
        "assets": {"logo": "", "banner": ""},
        "autopilot": dict(DEFAULT_AUTOPILOT),
        "youtube": {"connected": False, "channel_id": "", "title": "", "branding_synced": False},
        "ideas": [], "reports": [], "learnings": [], "pillar_weights": {}, "log": [],
        "last_report_at": 0.0,
    }
    ch.update(data)
    return save_channel(ch)


def save_channel(ch: dict) -> dict:
    with _lock:
        ch["updated"] = time.time()
        ch["log"] = ch.get("log", [])[-300:]
        store._write(_dir("channels") / f"{_safe(ch['id'])}.json", ch)
        return ch


def get_channel(cid: str) -> dict:
    path = _dir("channels") / f"{_safe(cid)}.json"
    if not path.exists():
        raise KeyError(cid)
    ch = store._read(path, {})
    ch["autopilot"] = {**DEFAULT_AUTOPILOT, **ch.get("autopilot", {})}
    return ch


def update_channel(cid: str, fn) -> dict:
    with _lock:
        ch = get_channel(cid)
        fn(ch)
        return save_channel(ch)


def list_channels() -> list[dict]:
    d = _dir("channels")
    if not d.exists():
        return []
    out = []
    for f in d.glob("*.json"):
        ch = get_channel(f.stem)
        out.append(ch)
    return sorted(out, key=lambda c: c["created"])


def delete_channel(cid: str) -> None:
    with _lock:
        (_dir("channels") / f"{_safe(cid)}.json").unlink(missing_ok=True)
        (_dir("tokens") / f"{_safe(cid)}.json").unlink(missing_ok=True)


def log(cid: str, msg: str, level: str = "info") -> None:
    try:
        update_channel(cid, lambda c: c["log"].append({"t": time.time(), "level": level, "msg": msg}))
    except KeyError:
        pass


# ---------- OAuth tokens (kept apart from channel JSON that the UI reads) ----------
def get_token(cid: str) -> dict:
    return store._read(_dir("tokens") / f"{_safe(cid)}.json", {})


def save_token(cid: str, tok: dict) -> None:
    with _lock:
        store._write(_dir("tokens") / f"{_safe(cid)}.json", tok)


# ---------- system-wide settings ----------
DEFAULT_SYSTEM = {"scheduler_enabled": True, "tick_seconds": 60, "oauth_redirect": "http://127.0.0.1:8765/api/salimoff/oauth/callback"}


def get_system() -> dict:
    return {**DEFAULT_SYSTEM, **store._read(ROOT / "system.json", {})}


def save_system(new: dict) -> dict:
    with _lock:
        s = {**get_system(), **{k: v for k, v in new.items() if k in DEFAULT_SYSTEM}}
        store._write(ROOT / "system.json", s)
        return s
