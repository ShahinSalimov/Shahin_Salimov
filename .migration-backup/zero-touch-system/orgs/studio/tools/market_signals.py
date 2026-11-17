"""Collects raw market signals for the Research agent. The agent never browses; it only analyses these.

Sources (each optional, failures degrade gracefully and are reported in ``source_errors``):
- ``reddit``: public search JSON (www.reddit.com/search.json). Reddit may rate-limit or require OAuth
  for unauthenticated clients; failures are tolerated.
- ``hackernews``: Algolia HN Search API (hn.algolia.com), public and keyless.
- ``google_trends``: via the unofficial ``pytrends`` package if installed; otherwise unavailable.
- ``fake``: deterministic signals for tests and dry runs (orgs.studio.fakes).
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Protocol

import requests

from core.guards import RateLimiter
from core.tools import ToolContext

log = logging.getLogger(__name__)
USER_AGENT = "zero-touch-research/1.0"
MAX_KEYWORDS = 10


class SourceUnavailable(Exception):
    pass


class SignalSource(Protocol):
    name: str

    def fetch(self, keywords: list[str]) -> list[dict[str, Any]]: ...


def _iso(ts: float) -> str:
    return datetime.fromtimestamp(ts, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


class _HttpSource:
    def __init__(self, timeout: float = 15.0, limiter: RateLimiter | None = None):
        self.timeout = timeout
        self.limiter = limiter or RateLimiter(rate_per_sec=1, burst=2)

    def _get(self, url: str, params: dict[str, Any]) -> dict[str, Any]:
        self.limiter.acquire(self.name)  # type: ignore[attr-defined]
        res = requests.get(url, params=params, headers={"User-Agent": USER_AGENT}, timeout=self.timeout)
        res.raise_for_status()
        return res.json()


class RedditSource(_HttpSource):
    name = "reddit"

    def fetch(self, keywords: list[str]) -> list[dict[str, Any]]:
        out = []
        for kw in keywords:
            data = self._get("https://www.reddit.com/search.json",
                             {"q": kw, "sort": "top", "t": "month", "limit": 10})
            for child in data.get("data", {}).get("children", []):
                d = child.get("data", {})
                out.append({"source": "reddit", "keyword": kw, "subreddit": d.get("subreddit"),
                            "title": d.get("title"), "score": d.get("score"), "num_comments": d.get("num_comments"),
                            "url": f"https://www.reddit.com{d.get('permalink', '')}",
                            "created_utc": _iso(d["created_utc"]) if d.get("created_utc") else None})
        return out


class HackerNewsSource(_HttpSource):
    name = "hackernews"

    def fetch(self, keywords: list[str]) -> list[dict[str, Any]]:
        out = []
        for kw in keywords:
            data = self._get("https://hn.algolia.com/api/v1/search",
                             {"query": kw, "tags": "story", "hitsPerPage": 10})
            for h in data.get("hits", []):
                out.append({"source": "hackernews", "keyword": kw, "title": h.get("title"),
                            "score": h.get("points"), "num_comments": h.get("num_comments"),
                            "url": f"https://news.ycombinator.com/item?id={h.get('objectID')}",
                            "created_utc": h.get("created_at")})
        return out


class GoogleTrendsSource:
    name = "google_trends"

    def fetch(self, keywords: list[str]) -> list[dict[str, Any]]:
        try:
            from pytrends.request import TrendReq  # type: ignore[import-not-found]
        except ImportError:
            raise SourceUnavailable("pytrends not installed") from None
        out = []
        trends = TrendReq(hl="en-US", tz=0)
        for i in range(0, len(keywords), 5):
            batch = keywords[i:i + 5]
            trends.build_payload(batch, timeframe="today 12-m")
            df = trends.interest_over_time()
            for kw in batch:
                if df.empty or kw not in df:
                    continue
                series = [int(v) for v in df[kw].tolist()]
                recent, prior = series[-13:], series[-26:-13] or series[:13]
                base = (sum(prior) / len(prior)) or 1
                out.append({"source": "google_trends", "keyword": kw, "interest_12m": series,
                            "growth_pct_90d": round((sum(recent) / len(recent) - base) / base * 100, 1),
                            "url": f"https://trends.google.com/trends/explore?q={kw.replace(' ', '+')}"})
        return out


def build_sources(names: str) -> list[SignalSource]:
    registry = {"reddit": RedditSource, "hackernews": HackerNewsSource, "google_trends": GoogleTrendsSource}
    sources: list[SignalSource] = []
    for name in [n.strip() for n in names.split(",") if n.strip()]:
        if name == "fake":
            from orgs.studio.fakes import FakeSignalSource
            sources.append(FakeSignalSource())
        elif name in registry:
            sources.append(registry[name]())
        else:
            raise ValueError(f"unknown signal source {name!r}")
    return sources


def collect_market_signals_tool(sources: list[SignalSource], max_keywords: int = MAX_KEYWORDS):
    def collect(payload: dict[str, Any], ctx: ToolContext) -> dict[str, Any]:
        brief = payload["research_brief"]
        keywords: list[str] = []
        for d in brief:
            for kw in d.get("keywords", []):
                if kw not in keywords:
                    keywords.append(kw)
        keywords = keywords[:max_keywords]

        signals, errors, seen = [], {}, set()
        for src in sources:
            try:
                for s in src.fetch(keywords):
                    key = s.get("url") or (s.get("source"), s.get("keyword"), s.get("title"))
                    if key not in seen:
                        seen.add(key)
                        signals.append(s)
            except Exception as e:  # one broken source must not stop research
                errors[src.name] = f"{type(e).__name__}: {e}"[:300]
                log.warning("signal source %s failed: %s", src.name, e)
        if not signals and errors:
            raise ConnectionError(f"all signal sources failed: {errors}")

        history = sorted({p["topic_key"] for p in ctx.store.products()} | {p["name"] for p in ctx.store.products()})
        return {"status": "ok", "research_brief": brief, "raw_signals": signals, "history_topics": history,
                "source_errors": errors}

    return collect
