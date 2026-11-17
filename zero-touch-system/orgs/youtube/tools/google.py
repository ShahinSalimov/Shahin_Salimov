"""Google OAuth (refresh-token flow) and YouTube Data API quota tracking.

The refresh token comes from scripts/youtube_oauth.py (run once on your computer). Quota is tracked
per UTC day in the ``control`` table; Google resets quota at midnight Pacific time, so a UTC day is a
conservative approximation. Quota costs are configurable because Google's own pages disagree on the
cost of ``videos.insert`` (100 vs 1600 units).
"""
from __future__ import annotations

import time
from datetime import datetime, timezone
from typing import Any

import requests

from core.db import JobStore
from core.tools import NonRetryable

TOKEN_URL = "https://oauth2.googleapis.com/token"
SCOPES = [
    "https://www.googleapis.com/auth/youtube.upload",
    "https://www.googleapis.com/auth/youtube.readonly",
    "https://www.googleapis.com/auth/yt-analytics.readonly",
    "https://www.googleapis.com/auth/yt-analytics-monetary.readonly",
]


class QuotaExceeded(NonRetryable):
    """Daily YouTube quota would be exceeded; retrying today is pointless."""


class GoogleApiError(Exception):
    """Retryable Google API failure (429, 5xx, network)."""


class GoogleAuth:
    def __init__(self, client_id: str, client_secret: str, refresh_token: str, timeout: float = 20.0):
        self._client_id, self._client_secret, self._refresh = client_id, client_secret, refresh_token
        self.timeout = timeout
        self._token: str | None = None
        self._expires = 0.0

    def __repr__(self) -> str:
        return "GoogleAuth(<secrets hidden>)"

    def token(self) -> str:
        if self._token and time.monotonic() < self._expires - 60:
            return self._token
        try:
            res = requests.post(TOKEN_URL, data={"client_id": self._client_id, "client_secret": self._client_secret,
                                                 "refresh_token": self._refresh, "grant_type": "refresh_token"},
                                timeout=self.timeout)
        except requests.RequestException as e:
            raise GoogleApiError(f"oauth token refresh failed: {type(e).__name__}") from None
        if res.status_code >= 500:
            raise GoogleApiError(f"oauth token refresh: HTTP {res.status_code}")
        body = res.json() if res.content else {}
        if res.status_code >= 400 or "access_token" not in body:
            raise NonRetryable(f"oauth refresh rejected ({body.get('error', res.status_code)}); "
                               "run scripts/youtube_oauth.py again and update YT_REFRESH_TOKEN")
        self._token = body["access_token"]
        self._expires = time.monotonic() + int(body.get("expires_in", 3600))
        return self._token

    def headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self.token()}"}


def check_response(res: requests.Response, what: str) -> dict[str, Any]:
    if res.status_code == 429 or res.status_code >= 500:
        raise GoogleApiError(f"{what}: HTTP {res.status_code}")
    try:
        body = res.json() if res.content else {}
    except ValueError:
        body = {}
    if res.status_code >= 400:
        reason = (body.get("error") or {}).get("message", "") if isinstance(body.get("error"), dict) else body.get("error")
        raise NonRetryable(f"{what}: HTTP {res.status_code} {reason or ''}".strip())
    return body


def _today() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


class QuotaTracker:
    def __init__(self, store: JobStore, daily_limit: int, org: str = "youtube"):
        self.store, self.daily_limit, self.org = store, daily_limit, org

    def _key(self) -> str:
        return f"yt_quota:{_today()}"

    def used(self) -> int:
        return int(self.store.get_control(self._key()) or 0)

    def remaining(self) -> int:
        return max(0, self.daily_limit - self.used())

    def charge(self, units: int) -> None:
        used = self.used()
        if used + units > self.daily_limit:
            raise QuotaExceeded(f"YouTube quota: need {units} units, {self.daily_limit - used} left today")
        self.store.set_control(self._key(), used + units)
