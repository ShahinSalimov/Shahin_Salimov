"""BudgetGuard, KillSwitch and RateLimiter: safety controls for unattended operation.

- BudgetGuard: daily spend limit per org (UTC day), persisted in ``budget_daily``.
- KillSwitch: persisted per org in the ``control`` table. Trips manually, on a critical financial
  alert, or when ``max_failed_runs`` runs failed within ``window_hours``. Only an explicit reset
  clears it; failures before the reset no longer count.
- RateLimiter: in-process token bucket per key (one per external API).
"""
from __future__ import annotations

import threading
import time
from datetime import datetime, timedelta, timezone
from typing import Any, Callable

from core.db import JobStore
from core.envelope import utc_now_iso


class BudgetExceeded(Exception):
    pass


def _today() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


class BudgetGuard:
    def __init__(self, store: JobStore, daily_limit_usd: float):
        self.store = store
        self.daily_limit_usd = float(daily_limit_usd)

    def spent_today(self, org: str) -> float:
        return self.store.get_spend(org, _today())

    def remaining(self, org: str) -> float:
        return max(0.0, self.daily_limit_usd - self.spent_today(org))

    def check(self, org: str) -> None:
        spent = self.spent_today(org)
        if spent >= self.daily_limit_usd:
            raise BudgetExceeded(f"daily budget {self.daily_limit_usd:.2f} USD reached (spent {spent:.2f})")

    def record(self, org: str, usd: float) -> None:
        if usd < 0:
            raise ValueError("cost cannot be negative")
        if usd:
            self.store.add_spend(org, _today(), usd)


class KillSwitch:
    def __init__(self, store: JobStore, max_failed_runs: int = 5, window_hours: int = 24):
        self.store = store
        self.max_failed_runs = max_failed_runs
        self.window_hours = window_hours

    @staticmethod
    def _key(org: str) -> str:
        return f"kill:{org}"

    def status(self, org: str) -> dict[str, Any]:
        return self.store.get_control(self._key(org)) or {"active": False}

    def is_active(self, org: str) -> bool:
        return bool(self.status(org).get("active"))

    def activate(self, org: str, reason: str) -> None:
        self.store.set_control(self._key(org), {"active": True, "reason": reason,
                                                "activated_at": utc_now_iso()})

    def reset(self, org: str) -> None:
        self.store.set_control(self._key(org), {"active": False, "reset_at": utc_now_iso()})

    def check_failures(self, org: str) -> bool:
        """Activate if too many runs failed in the window (since the last reset). Returns active state."""
        if self.is_active(org):
            return True
        since = datetime.now(timezone.utc) - timedelta(hours=self.window_hours)
        reset_at = self.status(org).get("reset_at")
        if reset_at:
            since = max(since, datetime.strptime(reset_at, "%Y-%m-%dT%H:%M:%S.%fZ").replace(tzinfo=timezone.utc))
        failed = self.store.count_failed_runs(org, since)
        if failed >= self.max_failed_runs:
            self.activate(org, reason=f"{failed} failed runs in {self.window_hours}h")
            return True
        return False


class RateLimiter:
    def __init__(self, rate_per_sec: float, burst: int = 1,
                 clock: Callable[[], float] = time.monotonic, sleep: Callable[[float], None] = time.sleep):
        self.rate, self.burst = float(rate_per_sec), float(burst)
        self.clock, self.sleep = clock, sleep
        self._buckets: dict[str, tuple[float, float]] = {}   # key -> (tokens, last_ts)
        self._lock = threading.Lock()

    def acquire(self, key: str) -> None:
        with self._lock:
            now = self.clock()
            tokens, last = self._buckets.get(key, (self.burst, now))
            tokens = min(self.burst, tokens + (now - last) * self.rate)
            wait = 0.0 if tokens >= 1 else (1 - tokens) / self.rate
            # reserve the token now; the caller sleeps for the deficit
            self._buckets[key] = (tokens - 1 + wait * self.rate, now + wait)
        if wait > 0:
            self.sleep(wait)
