"""Tests for BudgetGuard, KillSwitch and RateLimiter."""
import pytest
from freezegun import freeze_time

from core.db import JobStore
from core.guards import BudgetExceeded, BudgetGuard, KillSwitch, RateLimiter


@pytest.fixture
def store(tmp_path):
    s = JobStore(tmp_path / "g.db")
    yield s
    s.close()


# --- BudgetGuard -------------------------------------------------------------------------

def test_budget_allows_until_limit(store):
    with freeze_time("2026-11-16 10:00:00"):
        g = BudgetGuard(store, daily_limit_usd=1.0)
        g.check("studio")
        g.record("studio", 0.6)
        g.check("studio")
        assert g.remaining("studio") == pytest.approx(0.4)
        g.record("studio", 0.4)
        with pytest.raises(BudgetExceeded):
            g.check("studio")


def test_budget_is_per_org(store):
    with freeze_time("2026-11-16 10:00:00"):
        g = BudgetGuard(store, daily_limit_usd=1.0)
        g.record("studio", 5)
        g.check("youtube")


def test_budget_resets_at_utc_midnight(store):
    g = BudgetGuard(store, daily_limit_usd=1.0)
    with freeze_time("2026-11-16 23:59:00"):
        g.record("studio", 1.0)
        with pytest.raises(BudgetExceeded):
            g.check("studio")
    with freeze_time("2026-11-17 00:00:01"):
        g.check("studio")


def test_budget_ignores_zero_and_rejects_negative(store):
    g = BudgetGuard(store, daily_limit_usd=1.0)
    g.record("studio", 0)
    with pytest.raises(ValueError):
        g.record("studio", -1)


def test_budget_persists_across_store_instances(tmp_path):
    with freeze_time("2026-11-16 10:00:00"):
        s1 = JobStore(tmp_path / "b.db")
        BudgetGuard(s1, 1.0).record("studio", 1.0)
        s1.close()
        s2 = JobStore(tmp_path / "b.db")
        with pytest.raises(BudgetExceeded):
            BudgetGuard(s2, 1.0).check("studio")
        s2.close()


# --- KillSwitch --------------------------------------------------------------------------

def test_kill_switch_activate_and_reset(store):
    k = KillSwitch(store)
    assert not k.is_active("studio")
    k.activate("studio", reason="manual")
    assert k.is_active("studio")
    assert k.status("studio")["reason"] == "manual"
    assert not k.is_active("youtube")
    k.reset("studio")
    assert not k.is_active("studio")


def test_kill_switch_persists(tmp_path):
    s1 = JobStore(tmp_path / "k.db")
    KillSwitch(s1).activate("studio", reason="x")
    s1.close()
    s2 = JobStore(tmp_path / "k.db")
    assert KillSwitch(s2).is_active("studio")
    s2.close()


def test_kill_switch_trips_after_threshold_failed_runs_in_24h(store):
    k = KillSwitch(store, max_failed_runs=5, window_hours=24)
    with freeze_time("2026-11-15 08:00:00"):
        for _ in range(3):
            store.finish_run(store.create_run("studio", "p"), "failed")
    with freeze_time("2026-11-16 10:00:00"):
        for _ in range(4):
            store.finish_run(store.create_run("studio", "p"), "failed")
            assert k.check_failures("studio") is False   # only runs within 24h count
        store.finish_run(store.create_run("studio", "p"), "failed")
        assert k.check_failures("studio") is True
        assert k.is_active("studio")
        assert "5 failed runs" in k.status("studio")["reason"]


def test_reset_clears_failure_window(store):
    k = KillSwitch(store, max_failed_runs=2)
    with freeze_time("2026-11-16 10:00:00"):
        for _ in range(2):
            store.finish_run(store.create_run("studio", "p"), "failed")
        assert k.check_failures("studio")
    with freeze_time("2026-11-16 11:00:00"):
        k.reset("studio")
        assert k.check_failures("studio") is False   # old failures are before the reset
        assert not k.is_active("studio")


# --- RateLimiter ---------------------------------------------------------------------------

class FakeClock:
    def __init__(self):
        self.t = 0.0
        self.slept = []

    def now(self):
        return self.t

    def sleep(self, s):
        self.slept.append(s)
        self.t += s


def test_rate_limiter_allows_burst_then_waits():
    c = FakeClock()
    rl = RateLimiter(rate_per_sec=2, burst=2, clock=c.now, sleep=c.sleep)
    rl.acquire("gumroad")
    rl.acquire("gumroad")
    assert c.slept == []
    rl.acquire("gumroad")
    assert c.slept == [pytest.approx(0.5)]


def test_rate_limiter_refills_and_keys_are_independent():
    c = FakeClock()
    rl = RateLimiter(rate_per_sec=1, burst=1, clock=c.now, sleep=c.sleep)
    rl.acquire("a")
    rl.acquire("b")
    assert c.slept == []
    c.t += 1.0
    rl.acquire("a")
    assert c.slept == []
