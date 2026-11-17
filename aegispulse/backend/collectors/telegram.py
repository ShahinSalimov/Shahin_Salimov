"""Public Telegram channel collector (web preview, no account or API token).

Reads ``https://t.me/s/<channel>``, the public read-only preview Telegram
serves for public channels. Only channels the operator lists in
``TELEGRAM_CHANNELS`` are read; private channels/groups are never accessed.
Messages are pre-filtered for security relevance before ingestion.
"""

from __future__ import annotations

import re
from datetime import datetime
from html.parser import HTMLParser
from typing import Any

from backend.collectors.base import CollectedItem, Collector, is_security_relevant
from backend.models import ThreatSource

_CHANNEL_RE = re.compile(r"^[A-Za-z][A-Za-z0-9_]{3,31}$")
FIRST_RUN_LIMIT = 10


class _PreviewParser(HTMLParser):
    """Extract (post_id, text, datetime) from a t.me/s/ page."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.messages: list[dict[str, Any]] = []
        self._current: dict[str, Any] | None = None
        self._text_depth = 0
        self._depth = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        a = dict(attrs)
        classes = (a.get("class") or "").split()
        if tag == "div" and "tgme_widget_message" in classes and a.get("data-post"):
            self._current = {"post": a["data-post"], "text": [], "datetime": None}
            self.messages.append(self._current)
        if self._current is None:
            return
        if tag == "div" and "tgme_widget_message_text" in classes and self._text_depth == 0:
            self._text_depth = 1
            self._depth = 0
            return
        if self._text_depth:
            if tag == "br":
                self._current["text"].append("\n")
            elif tag not in ("img", "br"):
                self._depth += 1
        if tag == "time" and a.get("datetime") and self._current["datetime"] is None:
            self._current["datetime"] = a["datetime"]

    def handle_endtag(self, tag: str) -> None:
        if not self._text_depth or tag in ("br", "img"):
            return
        if self._depth == 0 and tag == "div":
            self._text_depth = 0
        else:
            self._depth = max(0, self._depth - 1)

    def handle_data(self, data: str) -> None:
        if self._text_depth and self._current is not None:
            self._current["text"].append(data)


def parse_preview(html: str) -> list[dict[str, Any]]:
    parser = _PreviewParser()
    parser.feed(html)
    out = []
    for m in parser.messages:
        try:
            post_id = int(str(m["post"]).rsplit("/", 1)[1])
        except (IndexError, ValueError):
            continue
        text = re.sub(r"[ \t]+\n", "\n", "".join(m["text"])).strip()
        if text:
            out.append({"post": m["post"], "id": post_id, "text": text, "datetime": m["datetime"]})
    return out


class TelegramCollector(Collector):
    name = "telegram"
    source = ThreatSource.TELEGRAM

    @property
    def interval_s(self) -> int:
        return self.settings.telegram_interval_s

    def channels(self) -> list[str]:
        return [c.lstrip("@") for c in self.settings.telegram_channels if _CHANNEL_RE.match(c.lstrip("@"))]

    def configured(self) -> tuple[bool, str | None]:
        if not self.channels():
            return False, "TELEGRAM_CHANNELS is empty"
        return True, None

    async def collect(self, state: dict[str, Any]) -> tuple[list[CollectedItem], dict[str, Any]]:
        last_ids: dict[str, int] = dict(state.get("last_ids") or {})
        items: list[CollectedItem] = []
        base = self.settings.telegram_base_url.rstrip("/")
        for channel in self.channels():
            response = await self._get(f"{base}/s/{channel}")
            messages = sorted(parse_preview(response.text), key=lambda m: m["id"])
            seen = last_ids.get(channel)
            fresh = [m for m in messages if seen is None or m["id"] > seen]
            if seen is None:
                fresh = fresh[-FIRST_RUN_LIMIT:]  # do not backfill a whole channel on first run
            for m in fresh:
                if not is_security_relevant(m["text"]):
                    continue
                published = None
                if m["datetime"]:
                    try:
                        published = datetime.fromisoformat(m["datetime"])
                    except ValueError:
                        published = None
                items.append(
                    CollectedItem(
                        source_ref=f"https://t.me/{m['post']}",
                        text=f"Telegram channel @{channel} (post {m['id']}):\n{m['text']}",
                        published_at=published,
                    )
                )
            if messages:
                last_ids[channel] = max(seen or 0, messages[-1]["id"])
        return items, {"last_ids": last_ids}
