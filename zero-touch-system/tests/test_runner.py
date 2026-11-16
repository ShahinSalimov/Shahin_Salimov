"""Tests for core.runner (offline: fake agents and tools)."""
from __future__ import annotations

from datetime import timedelta
from typing import Any

import pytest
from freezegun import freeze_time

from core.agents import AgentOutputError, AgentResult
from core.db import JobStore
from core.guards import BudgetGuard, KillSwitch
from core.llm import LLMRefusal
from core.pipeline import Pipeline, Step
from core.runner import KillSwitchActive, Runner
from core.tools import ToolRegistry
from core.tools.whatsapp import ConsoleWhatsApp

OK = {"status": "ok"}
_OPEN: list = []


@pytest.fixture(autouse=True)
def _close_stores():
    yield
    while _OPEN:
        try:
            _OPEN.pop().close()
        except Exception:
            pass


class FakeAgents:
    """agent -> list of outputs (dict or Exception) or callable(payload) -> dict."""

    def __init__(self, script: dict[str, Any], cost: float = 0.1):
        self.script, self.cost = script, cost
        self.calls: list[tuple[str, str | None, dict, dict]] = []

    def call(self, agent, mode, payload, context):
        self.calls.append((agent, mode, payload, context))
        entry = self.script[agent]
        item = entry(payload) if callable(entry) else entry.pop(0)
        if isinstance(item, Exception):
            raise item
        return AgentResult(output=item, meta={"cost_usd": self.cost, "model": "fake"})


class Harness:
    def __init__(self, path, pipelines, agents=None, tools=None, budget_usd=100.0, org="studio",
                 allowed_when_killed=()):
        self.store = JobStore(path, org=org)
        _OPEN.append(self.store)
        self.agents = agents or FakeAgents({})
        self.tools = tools or ToolRegistry()
        self.notifier = ConsoleWhatsApp(org=org)
        self.budget = BudgetGuard(self.store, budget_usd)
        self.kill = KillSwitch(self.store)
        self.runner = Runner(org=org, pipelines=pipelines, store=self.store, agents=self.agents,
                             tools=self.tools, budget=self.budget, kill=self.kill,
                             notifier=self.notifier, allowed_when_killed=allowed_when_killed)

    def drain(self, limit=100):
        n = 0
        while self.runner.tick():
            n += 1
            assert n < limit, "runner did not settle"
        return n


def _three_step():
    return {"toy": Pipeline(name="toy", start="plan", steps={
        "plan": Step(agent="ceo", mode="plan", next=lambda o, s: "work"),
        "work": Step(tool="worker", next=lambda o, s: "report"),
        "report": Step(tool="notify", next=lambda o, s: None),
    })}


def _tools(**fns):
    reg = ToolRegistry()
    for name, fn in fns.items():
        reg.register(name, fn)
    return reg


# --- happy path --------------------------------------------------------------------------------

def test_three_step_pipeline_runs_to_done(tmp_path):
    seen = []
    agents = FakeAgents({"ceo": [{"status": "ok", "plan": "A"}]})
    tools = _tools(worker=lambda p, c: (seen.append(("worker", p)) or {"status": "ok", "made": p["plan"]}),
                   notify=lambda p, c: (seen.append(("notify", p)) or OK))
    h = Harness(tmp_path / "r.db", _three_step(), agents, tools)
    run_id = h.runner.start_run("toy", {"date": "2026-11-16"}, context={"market_language": "en"})
    assert h.drain() == 3
    run = h.store.get_run(run_id)
    assert run.status == "done"
    assert agents.calls[0][:3] == ("ceo", "plan", {"date": "2026-11-16"})
    assert agents.calls[0][3] == {"market_language": "en"}
    assert seen == [("worker", {"status": "ok", "plan": "A"}),
                    ("notify", {"status": "ok", "made": "A"})]
    jobs = h.store.jobs_of(run_id)
    assert [j.envelope.from_agent for j in jobs] == ["scheduler", "ceo", "worker"]
    assert all(j.envelope.context == {"market_language": "en"} for j in jobs)
    assert h.runner.tick() is False


def test_cost_is_recorded_in_budget(tmp_path):
    agents = FakeAgents({"ceo": [{"status": "ok", "plan": "A"}]}, cost=0.25)
    tools = _tools(worker=lambda p, c: ({"status": "ok", "plan": "x"}, {"cost_usd": 0.05}),
                   notify=lambda p, c: OK)
    h = Harness(tmp_path / "r.db", _three_step(), agents, tools)
    h.runner.start_run("toy", {})
    h.drain()
    assert h.budget.spent_today("studio") == pytest.approx(0.30)


def test_unknown_pipeline_raises(tmp_path):
    h = Harness(tmp_path / "r.db", _three_step())
    with pytest.raises(KeyError):
        h.runner.start_run("nope", {})


# --- retries -------------------------------------------------------------------------------------

def test_retry_backoff_then_fail_with_notification(tmp_path):
    calls = []

    def flaky(p, c):
        calls.append(1)
        raise ConnectionError("gumroad down")

    pipes = {"p": Pipeline(name="p", start="a", steps={"a": Step(tool="flaky", next=lambda o, s: None)})}
    with freeze_time("2026-11-16 06:00:00") as clock:
        h = Harness(tmp_path / "r.db", pipes, tools=_tools(flaky=flaky))
        run_id = h.runner.start_run("p", {})
        for delay in (60, 240, 960):
            assert h.runner.tick() is True
            clock.tick(timedelta(seconds=delay - 1))
            assert h.runner.tick() is False          # not yet due
            clock.tick(timedelta(seconds=2))
        assert h.runner.tick() is True               # 4th attempt fails for good
    assert len(calls) == 4
    run = h.store.get_run(run_id)
    assert run.status == "failed"
    assert "gumroad down" in str(run.reason)
    assert any("uğursuz" in m and "gumroad down" in m for m in h.notifier.sent)


def test_transient_error_then_success(tmp_path):
    attempts = []

    def once_broken(p, c):
        attempts.append(1)
        if len(attempts) == 1:
            raise TimeoutError("slow")
        return OK

    pipes = {"p": Pipeline(name="p", start="a", steps={"a": Step(tool="t", next=lambda o, s: None)})}
    with freeze_time("2026-11-16 06:00:00") as clock:
        h = Harness(tmp_path / "r.db", pipes, tools=_tools(t=once_broken))
        run_id = h.runner.start_run("p", {})
        h.runner.tick()
        clock.tick(timedelta(seconds=61))
        h.drain()
    assert h.store.get_run(run_id).status == "done"
    assert h.store.jobs_of(run_id)[0].attempt == 2


def test_agent_status_retry_and_needs_input_are_retried(tmp_path):
    agents = FakeAgents({"ceo": [{"status": "retry", "errors": ["busy"]},
                                 {"status": "needs_input", "errors": ["no signals"]},
                                 {"status": "ok"}]})
    pipes = {"p": Pipeline(name="p", start="a", steps={"a": Step(agent="ceo", next=lambda o, s: None)})}
    with freeze_time("2026-11-16 06:00:00") as clock:
        h = Harness(tmp_path / "r.db", pipes, agents)
        run_id = h.runner.start_run("p", {})
        h.runner.tick()
        clock.tick(timedelta(seconds=61))
        h.runner.tick()
        clock.tick(timedelta(seconds=241))
        h.drain()
    assert h.store.get_run(run_id).status == "done"
    assert len(agents.calls) == 3


def test_agent_output_error_cost_is_recorded_and_retried(tmp_path):
    agents = FakeAgents({"ceo": [AgentOutputError("bad json", {"cost_usd": 0.4}), {"status": "ok"}]})
    pipes = {"p": Pipeline(name="p", start="a", steps={"a": Step(agent="ceo", next=lambda o, s: None)})}
    with freeze_time("2026-11-16 06:00:00") as clock:
        h = Harness(tmp_path / "r.db", pipes, agents)
        h.runner.start_run("p", {})
        h.runner.tick()
        assert h.budget.spent_today("studio") == pytest.approx(0.4)
        clock.tick(timedelta(seconds=61))
        h.drain()
        assert h.budget.spent_today("studio") == pytest.approx(0.5)


def test_refusal_is_not_retried_and_rejects_run(tmp_path):
    agents = FakeAgents({"ceo": [LLMRefusal("declined", category="cyber", cost_usd=0.02)]})
    pipes = {"p": Pipeline(name="p", start="a", steps={"a": Step(agent="ceo", next=lambda o, s: None)})}
    h = Harness(tmp_path / "r.db", pipes, agents)
    run_id = h.runner.start_run("p", {})
    h.drain()
    run = h.store.get_run(run_id)
    assert run.status == "rejected"
    assert "refusal" in str(run.reason) and "cyber" in str(run.reason)
    assert len(agents.calls) == 1
    assert h.notifier.sent


# --- rejection, routing errors --------------------------------------------------------------------

def test_rejected_status_ends_run(tmp_path):
    later = []
    agents = FakeAgents({"ceo": [{"status": "rejected", "errors": ["budget"]}]})
    tools = _tools(worker=lambda p, c: later.append(1) or OK, notify=lambda p, c: OK)
    h = Harness(tmp_path / "r.db", _three_step(), agents, tools)
    run_id = h.runner.start_run("toy", {})
    h.drain()
    run = h.store.get_run(run_id)
    assert run.status == "rejected" and run.reason == ["budget"]
    assert later == []
    assert any("dayandırıldı" in m for m in h.notifier.sent)


def test_routing_to_unknown_step_fails_run_without_retry(tmp_path):
    pipes = {"p": Pipeline(name="p", start="a",
                           steps={"a": Step(tool="t", next=lambda o, s: "ghost")})}
    h = Harness(tmp_path / "r.db", pipes, tools=_tools(t=lambda p, c: OK))
    run_id = h.runner.start_run("p", {})
    h.drain()
    assert h.store.get_run(run_id).status == "failed"
    assert h.store.queue_depth("studio") == 0


def test_job_of_finished_run_is_not_executed(tmp_path):
    executed = []
    pipes = {"p": Pipeline(name="p", start="a", steps={"a": Step(tool="t", next=lambda o, s: None)})}
    h = Harness(tmp_path / "r.db", pipes, tools=_tools(t=lambda p, c: executed.append(1) or OK))
    run_id = h.runner.start_run("p", {})
    h.store.finish_run(run_id, "rejected", reason="manual")
    h.drain()
    assert executed == []


def test_notifier_failure_does_not_crash_runner(tmp_path):
    class Broken:
        def send(self, text):
            raise RuntimeError("twilio down")

    agents = FakeAgents({"ceo": [{"status": "rejected", "errors": ["x"]}]})
    pipes = {"p": Pipeline(name="p", start="a", steps={"a": Step(agent="ceo", next=lambda o, s: None)})}
    h = Harness(tmp_path / "r.db", pipes, agents)
    h.runner.notifier = Broken()
    run_id = h.runner.start_run("p", {})
    h.drain()
    assert h.store.get_run(run_id).status == "rejected"


# --- fan-out / revision rounds ---------------------------------------------------------------------

def test_fan_out_joins_into_exactly_one_next_job(tmp_path):
    collected = []
    pipes = {"p": Pipeline(
        name="p", start="spec",
        steps={
            "spec": Step(tool="spec", next=lambda o, s: "section"),
            "section": Step(tool="section", fan_out=True, next=lambda o, s: "build"),
            "build": Step(tool="build", next=lambda o, s: None),
        },
        payload_builders={
            "section": lambda out, st, outs: [{"i": i} for i in range(out["n"])],
            "build": lambda out, st, outs: [{"count": len(outs.all("section")),
                                             "latest_spec_n": outs["spec"]["n"]}],
        })}
    tools = _tools(spec=lambda p, c: {"status": "ok", "n": 4},
                   section=lambda p, c: {"status": "ok", "i": p["i"]},
                   build=lambda p, c: collected.append(p) or OK)
    h = Harness(tmp_path / "r.db", pipes, tools=tools)
    run_id = h.runner.start_run("p", {})
    h.drain()
    assert collected == [{"count": 4, "latest_spec_n": 4}]
    assert h.store.get_run(run_id).status == "done"
    assert [j.step for j in h.store.jobs_of(run_id)].count("build") == 1


def test_revision_round_reenqueues_step_with_new_keys(tmp_path):
    def after_review(out, state):
        if out["decision"] == "revise" and state.get("revision_round", 0) < 2:
            state["revision_round"] = state.get("revision_round", 0) + 1
            return "write"
        return None

    pipes = {"p": Pipeline(name="p", start="write", steps={
        "write": Step(tool="write", next=lambda o, s: "review"),
        "review": Step(agent="philosopher", next=after_review),
    })}
    agents = FakeAgents({"philosopher": [{"status": "ok", "decision": "revise"},
                                         {"status": "ok", "decision": "approve"}]})
    writes = []
    h = Harness(tmp_path / "r.db", pipes, agents, _tools(write=lambda p, c: writes.append(c.idempotency_key) or OK))
    run_id = h.runner.start_run("p", {})
    h.drain()
    run = h.store.get_run(run_id)
    assert run.status == "done"
    assert run.state["revision_round"] == 1
    assert writes == [f"{run_id}:write:0", f"{run_id}:write:r1:0"]


# --- idempotency ---------------------------------------------------------------------------------

def test_idempotent_step_records_effect_and_skips_when_present(tmp_path):
    published = []
    pipes = {"p": Pipeline(name="p", start="publish",
                           steps={"publish": Step(tool="publish", idempotent=True, next=lambda o, s: None)})}
    h = Harness(tmp_path / "r.db", pipes,
                tools=_tools(publish=lambda p, c: published.append(1) or {"status": "ok", "url": "u1"}))
    run_id = h.runner.start_run("p", {})
    key = h.store.jobs_of(run_id)[0].idempotency_key
    h.drain()
    assert published == [1]
    assert h.store.get_effect(key) == {"status": "ok", "url": "u1"}

    # Crash after the side effect but before completion: job is re-run, tool is not called again.
    run2 = h.runner.start_run("p", {})
    key2 = h.store.jobs_of(run2)[0].idempotency_key
    h.store.record_effect(key2, {"status": "ok", "url": "already"})
    h.drain()
    assert published == [1]
    assert h.store.outputs_of(run2)["publish"] == {"status": "ok", "url": "already"}


# --- guards --------------------------------------------------------------------------------------

def test_budget_exceeded_rejects_run_before_agent_call(tmp_path):
    agents = FakeAgents({"ceo": [{"status": "ok", "plan": "A"}]})
    h = Harness(tmp_path / "r.db", _three_step(), agents, budget_usd=0.01)
    h.budget.record("studio", 0.01)
    run_id = h.runner.start_run("toy", {})
    h.drain()
    run = h.store.get_run(run_id)
    assert run.status == "rejected"
    assert "budget" in str(run.reason)
    assert agents.calls == []
    assert any("büdcə" in m.lower() for m in h.notifier.sent)


def test_kill_switch_cancels_jobs_and_blocks_new_runs(tmp_path):
    executed = []
    h = Harness(tmp_path / "r.db", _three_step(), FakeAgents({"ceo": [OK]}),
                _tools(worker=lambda p, c: executed.append(1) or OK, notify=lambda p, c: OK))
    run_id = h.runner.start_run("toy", {})
    h.kill.activate("studio", reason="manual")
    h.drain()
    assert h.store.get_run(run_id).status == "rejected"
    assert "kill_switch" in str(h.store.get_run(run_id).reason)
    assert executed == [] and h.agents.calls == []
    with pytest.raises(KillSwitchActive):
        h.runner.start_run("toy", {})


def test_kill_switch_lets_report_pipelines_run(tmp_path):
    pipes = {**_three_step(),
             "report": Pipeline(name="report", start="r", steps={"r": Step(tool="notify", next=lambda o, s: None)})}
    h = Harness(tmp_path / "r.db", pipes, tools=_tools(notify=lambda p, c: OK, worker=lambda p, c: OK),
                allowed_when_killed={"report"})
    h.kill.activate("studio", reason="manual")
    run_id = h.runner.start_run("report", {})
    h.drain()
    assert h.store.get_run(run_id).status == "done"


def test_critical_alert_trips_kill_switch_but_run_completes(tmp_path):
    agents = FakeAgents({"banker": [{"status": "ok", "alert_level": "critical"}]})
    pipes = {"p": Pipeline(name="p", start="a", steps={"a": Step(agent="banker", next=lambda o, s: None)})}
    h = Harness(tmp_path / "r.db", pipes, agents)
    run_id = h.runner.start_run("p", {})
    h.drain()
    assert h.store.get_run(run_id).status == "done"
    assert h.kill.is_active("studio")
    assert "critical" in h.kill.status("studio")["reason"]


def test_failed_runs_trip_kill_switch(tmp_path):
    pipes = {"p": Pipeline(name="p", start="a", steps={"a": Step(tool="t", next=lambda o, s: "ghost")})}
    h = Harness(tmp_path / "r.db", pipes, tools=_tools(t=lambda p, c: OK))
    h.runner.kill = KillSwitch(h.store, max_failed_runs=2)
    for _ in range(2):
        h.runner.start_run("p", {})
        h.drain()
    assert h.runner.kill.is_active("studio")
    assert any("Kill switch" in m for m in h.notifier.sent)


def test_tool_can_mutate_run_state(tmp_path):
    def t(p, c):
        c.state["product_id"] = "abc"
        return OK

    pipes = {"p": Pipeline(name="p", start="a", steps={"a": Step(tool="t", next=lambda o, s: None)})}
    h = Harness(tmp_path / "r.db", pipes, tools=_tools(t=t))
    run_id = h.runner.start_run("p", {})
    h.drain()
    assert h.store.get_run(run_id).state["product_id"] == "abc"


# --- restart ----------------------------------------------------------------------------------------

def test_restart_continues_run_from_same_db(tmp_path):
    path = tmp_path / "restart.db"
    calls = []
    tools = _tools(worker=lambda p, c: calls.append("worker") or OK,
                   notify=lambda p, c: calls.append("notify") or OK)
    h1 = Harness(path, _three_step(), FakeAgents({"ceo": [OK]}), tools)
    run_id = h1.runner.start_run("toy", {})
    h1.runner.tick()
    h1.runner.tick()
    # simulate a crash while the last job is being processed
    h1.store.claim_next("studio")
    h1.store.close()

    h2 = Harness(path, _three_step(), FakeAgents({}), tools)
    assert h2.runner.recover() == 1
    h2.drain()
    assert h2.store.get_run(run_id).status == "done"
    assert calls == ["worker", "notify"]
