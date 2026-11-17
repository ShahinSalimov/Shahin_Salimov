"""YouTube Analytics API reports used by the Growth Banker, plus the weekly cost breakdown.

``estimatedRevenue`` needs the ``yt-analytics-monetary.readonly`` scope and a monetized channel; on 403
the report is retried without it and revenue becomes null. Thumbnail CTR
(``videoThumbnailImpressionsClickRate``) is documented for content-owner reports; its availability for
channel reports is not confirmed, so it is not requested and ``ctr_pct`` is null. The Growth Banker
then classifies on retention and views. Costs come from code: total spend from the budget table,
TTS and media costs from the ledger, LLM = total - TTS - media.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Any, Protocol

import requests

from core.tools import NonRetryable, ToolContext
from orgs.youtube.tools.google import GoogleApiError, GoogleAuth, check_response

ANALYTICS_URL = "https://youtubeanalytics.googleapis.com/v2/reports"
DATA_VIDEOS_URL = "https://www.googleapis.com/youtube/v3/videos"
BASE_METRICS = ["views", "estimatedMinutesWatched", "averageViewPercentage", "subscribersGained"]
FIELD_MAP = {"views": "views", "estimatedMinutesWatched": "watch_minutes", "averageViewPercentage": "avg_view_pct",
             "subscribersGained": "subs_gained", "estimatedRevenue": "estimated_revenue_usd"}


class AnalyticsSource(Protocol):
    def video_report(self, start: str, end: str) -> list[dict[str, Any]]: ...

    def titles(self, ids: list[str]) -> dict[str, str]: ...


class AnalyticsClient:
    def __init__(self, auth: GoogleAuth, timeout: float = 30.0):
        self.auth, self.timeout = auth, timeout

    def _query(self, start: str, end: str, metrics: list[str]) -> dict[str, Any]:
        params = {"ids": "channel==MINE", "startDate": start, "endDate": end, "metrics": ",".join(metrics),
                  "dimensions": "video", "sort": "-views", "maxResults": 50}
        try:
            res = requests.get(ANALYTICS_URL, params=params, headers=self.auth.headers(), timeout=self.timeout)
        except requests.RequestException as e:
            raise GoogleApiError(f"youtube analytics: {type(e).__name__}") from None
        return check_response(res, "youtube analytics")

    def video_report(self, start: str, end: str) -> list[dict[str, Any]]:
        try:
            body = self._query(start, end, BASE_METRICS + ["estimatedRevenue"])
        except NonRetryable:   # usually 403: no monetary scope or channel not monetized
            body = self._query(start, end, BASE_METRICS)
        names = [h["name"] for h in body.get("columnHeaders", [])]
        rows = []
        for r in body.get("rows", []) or []:
            rec = dict(zip(names, r))
            out = {"video_id": rec["video"]}
            for api_name, field in FIELD_MAP.items():
                out[field] = rec.get(api_name)
            out["ctr_pct"] = None
            rows.append(out)
        return rows

    def titles(self, ids: list[str]) -> dict[str, str]:
        if not ids:
            return {}
        res = requests.get(DATA_VIDEOS_URL, params={"part": "snippet", "id": ",".join(ids[:50])},
                           headers=self.auth.headers(), timeout=self.timeout)
        body = check_response(res, "youtube videos.list")
        return {v["id"]: v["snippet"]["title"] for v in body.get("items", [])}


def last_full_week(today: date) -> tuple[str, str]:
    """Monday..Sunday of the previous week."""
    start = today - timedelta(days=today.weekday() + 7)
    return start.isoformat(), (start + timedelta(days=6)).isoformat()


def _round(v: Decimal) -> float:
    return float(v.quantize(Decimal("0.01")))


def weekly_analytics_tool(source: AnalyticsSource):
    def weekly(payload: dict[str, Any], ctx: ToolContext) -> dict[str, Any]:
        start, end = last_full_week(datetime.now(timezone.utc).date())
        rows = source.video_report(start, end)
        titles = source.titles([r["video_id"] for r in rows])
        videos = [{**r, "title": titles.get(r["video_id"])} for r in rows]
        revenue = [r["estimated_revenue_usd"] for r in rows if r.get("estimated_revenue_usd") is not None]
        totals = {"views": sum(int(r.get("views") or 0) for r in rows),
                  "watch_hours": round(sum(float(r.get("watch_minutes") or 0) for r in rows) / 60, 1),
                  "subs_gained": sum(int(r.get("subs_gained") or 0) for r in rows),
                  "estimated_revenue_usd": round(sum(revenue), 2) if revenue else None,
                  "ypp_eligible": None}

        since, until = f"{start}T00:00:00.000000Z", f"{date.fromisoformat(end) + timedelta(days=1)}T00:00:00.000000Z"
        ledger = ctx.store.ledger_rows(since, until)
        tts = -sum((Decimal(str(r["amount_usd"])) for r in ledger if r["kind"] == "tts_cost"), Decimal("0"))
        media = -sum((Decimal(str(r["amount_usd"])) for r in ledger if r["kind"] == "media_cost"), Decimal("0"))
        spend = ctx.store.spend_by_day(ctx.org, start)
        total = sum((Decimal(str(v)) for d, v in spend.items() if d <= end), Decimal("0"))
        llm = max(Decimal("0"), total - tts - media)
        return {"status": "ok",
                "analytics": {"period": f"{start}..{end}", "videos": videos, "channel_totals": totals},
                "costs": {"llm_usd": _round(llm), "tts_usd": _round(tts), "media_gen_usd": _round(media),
                          "total_usd": _round(total)}}

    return weekly
