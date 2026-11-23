"""Connected YouTube channels. Each has its own OAuth token and its own voice, language and category."""
from __future__ import annotations

import re
import uuid
from pathlib import Path

from . import config

FIELDS = {"name": str, "voice_id": str, "language": str, "category_id": str}
DEFAULTS = {"voice_id": "", "language": "English", "category_id": "2"}


class ChannelError(RuntimeError):
    pass


def _file() -> Path:
    return config.DATA / "channels.json"


def list_channels() -> list[dict]:
    return config.read_json(_file(), [])


def get(channel_id: str) -> dict:
    for c in list_channels():
        if c["id"] == channel_id:
            return c
    raise ChannelError("Kanal tapılmadı. Ayarlar → Kanallar bölməsində kanalı qoşun.")


def token_path(channel_id: str) -> Path:
    if not re.fullmatch(r"[a-f0-9]{10}", channel_id):
        raise ChannelError("Yanlış kanal")
    return config.DATA / "channels" / channel_id / "token.json"


def add(name: str, youtube_id: str = "", **fields) -> dict:
    """Called after a successful Google sign-in. Re-connecting the same YouTube channel updates it."""
    chans = list_channels()
    existing = next((c for c in chans if youtube_id and c.get("youtube_id") == youtube_id), None)
    if existing:
        existing["name"] = name or existing["name"]
        config.write_json(_file(), chans)
        return existing
    ch = {"id": uuid.uuid4().hex[:10], "name": name or "Kanal", "youtube_id": youtube_id, **DEFAULTS}
    ch.update({k: FIELDS[k](v) for k, v in fields.items() if k in FIELDS})
    chans.append(ch)
    config.write_json(_file(), chans)
    return ch


def update(channel_id: str, patch: dict) -> dict:
    chans = list_channels()
    for c in chans:
        if c["id"] == channel_id:
            for k, v in patch.items():
                if k in FIELDS and (k != "name" or str(v).strip()):
                    c[k] = str(v).strip()
            config.write_json(_file(), chans)
            return c
    raise ChannelError("Kanal tapılmadı")


def remove(channel_id: str) -> None:
    import shutil
    config.write_json(_file(), [c for c in list_channels() if c["id"] != channel_id])
    shutil.rmtree(token_path(channel_id).parent, ignore_errors=True)
