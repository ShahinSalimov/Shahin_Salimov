"""Dark-web intelligence feed collector (licensed vendor / partner feed).

AegisPulse does not crawl Tor itself: direct crawling of criminal forums
carries legal and operational risk that an enterprise buyer will diligence.
Instead this collector consumes an HTTPS JSON feed from a licensed dark-web
intelligence provider or an in-house, legally reviewed crawler.

Expected response (either form):

    {"items": [{"id": "...", "text": "...", "url": "...", "published_at": "ISO-8601"}], "next_since": "ISO-8601"}
    [{"id": "...", "text": "...", ...}]

``since`` is passed as a query parameter on every call so the provider can
return only new items.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from backend.collectors.base import CollectedItem, Collector, CollectorError
from backend.models import ThreatSource


class DarkwebFeedCollector(Collector):
    name = "darkweb_feed"
    source = ThreatSource.DARK_WEB

    @property
    def interval_s(self) -> int:
        return self.settings.darkweb_feed_interval_s

    def configured(self) -> tuple[bool, str | None]:
        url = self.settings.darkweb_feed_url
        if not url:
            return False, "DARKWEB_FEED_URL is not set"
        if not url.startswith("https://"):
            return False, "DARKWEB_FEED_URL must be HTTPS"
        return True, None

    async def collect(self, state: dict[str, Any]) -> tuple[list[CollectedItem], dict[str, Any]]:
        assert self.settings.darkweb_feed_url
        headers = {}
        if self.settings.darkweb_feed_token:
            headers["Authorization"] = f"Bearer {self.settings.darkweb_feed_token.get_secret_value()}"
        params = {"since": state["since"]} if state.get("since") else {}
        response = await self._get(self.settings.darkweb_feed_url, params=params, headers=headers)
        try:
            payload = response.json()
        except ValueError as exc:
            raise CollectorError("darkweb_feed: response was not JSON") from exc
        records = payload.get("items") if isinstance(payload, dict) else payload
        if not isinstance(records, list):
            raise CollectorError("darkweb_feed: expected a list of items")

        seen = set(state.get("recent_ids") or [])
        newest = state.get("since")
        items: list[CollectedItem] = []
        for rec in records:
            if not isinstance(rec, dict) or not isinstance(rec.get("text"), str) or not rec["text"].strip():
                continue
            rid = str(rec.get("id") or "")
            if rid and rid in seen:
                continue
            published = None
            if rec.get("published_at"):
                try:
                    published = datetime.fromisoformat(str(rec["published_at"]).replace("Z", "+00:00"))
                    published = (published if published.tzinfo else published.replace(tzinfo=UTC)).astimezone(UTC)
                except ValueError:
                    published = None
            # All timestamps are normalised to UTC so ISO strings compare correctly.
            if published and (newest is None or published.isoformat() > newest):
                newest = published.isoformat()
            items.append(
                CollectedItem(
                    source_ref=str(rec.get("url") or f"darkweb-feed://{rid or 'item'}")[:500],
                    text=rec["text"],
                    published_at=published,
                )
            )
            if rid:
                seen.add(rid)
        if isinstance(payload, dict) and payload.get("next_since"):
            newest = str(payload["next_since"])
        return items, {"since": newest, "recent_ids": list(seen)[-500:]}
