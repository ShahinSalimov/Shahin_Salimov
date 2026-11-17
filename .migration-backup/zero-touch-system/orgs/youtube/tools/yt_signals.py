"""YouTube Data API signal collection and outlier ratio computation with quota tracking.

For each seed keyword: ``search.list`` (100 units) for the most viewed recent videos, then
``videos.list`` and ``channels.list`` (1 unit each) for views, duration and subscriber counts.
``outlier_ratio = views / max(subscribers, 1000)`` is computed in code (hidden subscriber counts use
the 1000 floor). The Trend Scout only interprets these numbers.
"""
from __future__ import annotations

import logging
import re
from datetime import datetime, timedelta, timezone
from typing import Any, Protocol

import requests

from core.tools import ToolContext
from orgs.youtube.tools.google import GoogleAuth, QuotaTracker, check_response, GoogleApiError

log = logging.getLogger(__name__)
DATA_API = "https://www.googleapis.com/youtube/v3"
SEARCH_COST, LIST_COST = 100, 1
SUBS_FLOOR = 1000


def parse_iso_duration(value: str) -> int:
    m = re.fullmatch(r"P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?", value or "")
    if not m:
        return 0
    d, h, mi, s = (int(x) if x else 0 for x in m.groups())
    return d * 86400 + h * 3600 + mi * 60 + s


class SignalClient(Protocol):
    def signals(self, keyword: str, shorts: bool, max_results: int) -> list[dict[str, Any]]: ...


class YouTubeDataClient:
    def __init__(self, auth: GoogleAuth, quota: QuotaTracker, timeout: float = 20.0):
        self.auth, self.quota, self.timeout = auth, quota, timeout

    def _get(self, path: str, params: dict[str, Any], cost: int) -> dict[str, Any]:
        self.quota.charge(cost)
        try:
            res = requests.get(f"{DATA_API}/{path}", params=params, headers=self.auth.headers(), timeout=self.timeout)
        except requests.RequestException as e:
            raise GoogleApiError(f"youtube {path}: {type(e).__name__}") from None
        return check_response(res, f"youtube {path}")

    def signals(self, keyword: str, shorts: bool, max_results: int = 15) -> list[dict[str, Any]]:
        after = (datetime.now(timezone.utc) - timedelta(days=30)).strftime("%Y-%m-%dT%H:%M:%SZ")
        params = {"part": "snippet", "q": keyword, "type": "video", "order": "viewCount",
                  "publishedAfter": after, "maxResults": max_results}
        if shorts:
            params["videoDuration"] = "short"
        found = self._get("search", params, SEARCH_COST).get("items", [])
        ids = [it["id"]["videoId"] for it in found if it.get("id", {}).get("videoId")]
        if not ids:
            return []
        videos = self._get("videos", {"part": "snippet,statistics,contentDetails", "id": ",".join(ids)},
                           LIST_COST).get("items", [])
        channel_ids = sorted({v["snippet"]["channelId"] for v in videos})
        channels = self._get("channels", {"part": "statistics", "id": ",".join(channel_ids)}, LIST_COST).get("items", [])
        subs = {}
        for c in channels:
            st = c.get("statistics", {})
            subs[c["id"]] = None if st.get("hiddenSubscriberCount") else int(st.get("subscriberCount", 0))
        out = []
        for v in videos:
            views = int(v.get("statistics", {}).get("viewCount", 0))
            ch_subs = subs.get(v["snippet"]["channelId"])
            out.append({"source": "youtube", "keyword": keyword, "video_id": v["id"], "title": v["snippet"]["title"],
                        "channel_subs": ch_subs, "views": views, "published_at": v["snippet"].get("publishedAt"),
                        "duration_s": parse_iso_duration(v.get("contentDetails", {}).get("duration", "")),
                        "outlier_ratio": round(views / max(ch_subs or 0, SUBS_FLOOR), 2)})
        return out


def collect_yt_signals_tool(client: SignalClient, max_results: int = 15):
    def collect(payload: dict[str, Any], ctx: ToolContext) -> dict[str, Any]:
        profile = payload["channel_profile"]
        shorts = profile.get("format") == "shorts"
        signals, errors, seen = [], {}, set()
        for kw in payload["keywords"]:
            try:
                for s in client.signals(kw, shorts, max_results):
                    if s["video_id"] not in seen:
                        seen.add(s["video_id"])
                        signals.append(s)
            except Exception as e:
                errors[kw] = f"{type(e).__name__}: {e}"[:300]
                log.warning("youtube signals for %r failed: %s", kw, e)
        if not signals and errors:
            raise ConnectionError(f"all youtube signal queries failed: {errors}")
        signals.sort(key=lambda s: -(s.get("outlier_ratio") or 0))
        return {"status": "ok", "channel_profile": profile, "raw_signals": signals,
                "history_titles": [v["title"] for v in ctx.store.videos()], "source_errors": errors}

    return collect
