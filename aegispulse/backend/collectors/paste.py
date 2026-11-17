"""Paste-site collector using the Pastebin Scraping API.

Pastebin only serves ``scrape.pastebin.com`` to whitelisted IPs on a Pastebin
PRO account; any other caller gets a plain-text refusal, which is surfaced as
the collector's error. ``PASTE_SCRAPE_URL`` can point at a compatible mirror
or an internal proxy exposing the same two endpoints:

    GET {base}/api_scraping.php?limit=100        -> JSON list of recent pastes
    GET {base}/api_scrape_item.php?i=<key>       -> raw paste text
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from backend.collectors.base import CollectedItem, Collector, CollectorError, is_security_relevant
from backend.models import ThreatSource


class PasteCollector(Collector):
    name = "paste"
    source = ThreatSource.PASTE_SITE

    @property
    def interval_s(self) -> int:
        return self.settings.paste_interval_s

    def configured(self) -> tuple[bool, str | None]:
        if not self.settings.paste_scrape_url.startswith("https://"):
            return False, "PASTE_SCRAPE_URL must be HTTPS"
        return True, None

    async def collect(self, state: dict[str, Any]) -> tuple[list[CollectedItem], dict[str, Any]]:
        base = self.settings.paste_scrape_url.rstrip("/")
        listing = await self._get(f"{base}/api_scraping.php", params={"limit": 100})
        try:
            pastes = listing.json()
        except ValueError as exc:
            # Pastebin answers non-whitelisted IPs with a plain-text message.
            raise CollectorError(f"paste: scraping API refused access: {listing.text[:160].strip()}") from exc
        if not isinstance(pastes, list):
            raise CollectorError("paste: unexpected listing format")

        last_date = int(state.get("last_date") or 0)
        newest = last_date
        items: list[CollectedItem] = []
        for paste in sorted(pastes, key=lambda p: int(p.get("date") or 0)):
            date = int(paste.get("date") or 0)
            newest = max(newest, date)
            if date <= last_date or int(paste.get("size") or 0) > self.settings.paste_max_bytes:
                continue
            key = str(paste.get("key") or "")
            if not key.isalnum():
                continue
            body = await self._get(f"{base}/api_scrape_item.php", params={"i": key})
            text = body.text[: self.settings.paste_max_bytes]
            if not is_security_relevant(text):
                continue
            title = paste.get("title") or "untitled"
            items.append(
                CollectedItem(
                    source_ref=paste.get("full_url") or f"https://pastebin.com/{key}",
                    text=f"Paste '{title}' ({paste.get('syntax', 'text')}, {paste.get('size')} bytes):\n{text}",
                    published_at=datetime.fromtimestamp(date, UTC) if date else None,
                )
            )
        return items, {"last_date": newest}
