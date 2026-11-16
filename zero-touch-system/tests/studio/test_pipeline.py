"""Tests for studio pipelines, webhook and dry run (offline: FakeLLM, fake signals, draft publisher)."""
import json
import subprocess
import sys

import pytest
import responses

from core.bootstrap import build_runtime
from core.config import Settings
from core.testing import FakeLLM
from core.tools.whatsapp import ConsoleWhatsApp
from orgs.studio import pipeline as studio_pipeline
from orgs.studio.fakes import fake_llm_script
from orgs.studio.pipeline import route_after_review
from orgs.studio.schedule import SCHEDULE
from orgs.studio.tools.gumroad import API_BASE
from orgs.studio.webhooks import handle_gumroad_ping
from tests.conftest import ROOT, load_fixture

PING = {"sale_id": "S1", "product_id": "P1", "product_name": "Client Portal Kit", "price": "1900",
        "sale_timestamp": "2026-11-16T10:00:00Z"}


def _settings(tmp_path, **kw):
    return Settings(_env_file=None, org="studio", data_dir=str(tmp_path / "data"), signal_sources="fake",
                    gumroad_publish_mode="draft", daily_budget_usd=5.0, **kw)


@pytest.fixture
def make_rt(tmp_path):
    made = []

    def _make(script_overrides=None, **settings_kw):
        script = fake_llm_script()
        script.update(script_overrides or {})
        llm = FakeLLM(script)
        rt = build_runtime("studio", _settings(tmp_path, **settings_kw), llm=llm,
                           notifier=ConsoleWhatsApp(org="studio"), db_path=tmp_path / "studio.db")
        made.append(rt)
        return rt, llm

    yield _make
    for rt in made:
        rt.stop()


def _drain(rt, limit=200):
    n = 0
    while rt.runner.tick():
        n += 1
        assert n < limit
    return n


def _agent_calls(llm):
    out = []
    for c in llm.calls:
        payload = json.loads(c["messages"][0]["content"])["payload"]
        out.append(f"{c['tag']}.{payload['mode']}" if "mode" in payload else c["tag"])
    return out


# --- routing ---------------------------------------------------------------------------------------

def test_route_after_review_approve_revise_reject():
    assert route_after_review({"decision": "approve"}, {}) == "banker.pricing"
    st = {"revision_round": 0, "section_cursor": 3}
    assert route_after_review({"decision": "revise", "revision_notes": ["fix"]}, st) == "content.listing"
    assert st["revision_round"] == 1 and st["revision_notes"] == ["fix"] and st["section_cursor"] == 0
    st["revision_round"] = 2
    assert route_after_review({"decision": "revise", "revision_notes": ["again"]}, st) == "tools.notify_rejection"
    assert route_after_review({"decision": "reject", "blocking_issues": ["x"]}, {}) == "tools.notify_rejection"


def test_schedule_and_kill_switch_config():
    names = {e.pipeline for e in SCHEDULE}
    assert names == {"studio_daily", "studio_sales_report", "studio_weekly_reflect"}
    assert studio_pipeline.ALLOWED_WHEN_KILLED == {"studio_sales_report"}


# --- studio_daily ---------------------------------------------------------------------------------

def test_daily_pipeline_end_to_end(make_rt, tmp_path):
    rt, llm = make_rt()
    run_id = rt.runner.start_run("studio_daily", {})
    _drain(rt)
    run = rt.store.get_run(run_id)
    assert run.status == "done", run.reason
    assert _agent_calls(llm) == ["ceo.plan", "research", "ceo.decide", "content.listing",
                                 "content.section", "content.section", "content.section",
                                 "philosopher.review", "banker.pricing"]
    sections = [json.loads(c["messages"][0]["content"])["payload"] for c in llm.calls if c["tag"] == "content"][1:]
    assert [s["section_index"] for s in sections] == [0, 1, 2]
    assert sections[2]["previous_sections_summary"]            # sequential sections see earlier summaries
    product = rt.store.products()[0]
    assert product["status"] == "draft_ready" and product["topic_key"] == "freelance-client-portal-kit"
    draft = tmp_path / "data" / "drafts" / "client-portal-kit"
    assert (draft / "listing.json").exists() and (draft / "client-portal-kit.zip").exists()
    assert any("Freelance Client Portal Kit" in m for m in rt.notifier.sent)
    review_payload = json.loads(next(c for c in llm.calls if c["tag"] == "philosopher")["messages"][0]["content"])
    assert {f["file_name"] for f in review_payload["payload"]["assets_manifest"]} == {"guide.pdf", "portal.csv"}
    assert rt.budget.spent_today("studio") > 0


def test_daily_pipeline_revise_then_approve(make_rt):
    revise = {**load_fixture("studio", "philosopher.review"), "decision": "revise",
              "revision_notes": ["Section 1: add a real example"]}
    rt, llm = make_rt({"philosopher": [revise, load_fixture("studio", "philosopher.review")]})
    run_id = rt.runner.start_run("studio_daily", {})
    _drain(rt)
    assert rt.store.get_run(run_id).status == "done"
    calls = _agent_calls(llm)
    assert calls.count("content.listing") == 2 and calls.count("content.section") == 6
    listing_payloads = [json.loads(c["messages"][0]["content"])["payload"] for c in llm.calls
                        if c["tag"] == "content" and "listing" in c["messages"][0]["content"][:400]]
    second_listing = [json.loads(c["messages"][0]["content"])["payload"] for c in llm.calls if c["tag"] == "content"][4]
    assert second_listing["revision_notes"] == ["Section 1: add a real example"]
    assert len(rt.store.products()) == 1


def test_daily_pipeline_reject_notifies_without_publishing(make_rt):
    reject = {**load_fixture("studio", "philosopher.review"), "decision": "reject",
              "scores": {**load_fixture("studio", "philosopher.review")["scores"], "policy_risk": 3},
              "blocking_issues": ["Uses a trademarked brand name"]}
    rt, llm = make_rt({"philosopher": [reject]})
    run_id = rt.runner.start_run("studio_daily", {})
    _drain(rt)
    run = rt.store.get_run(run_id)
    assert run.status == "done" and run.state["outcome"] == "rejected_by_philosopher"
    assert rt.store.products() == []
    assert any("trademarked" in m for m in rt.notifier.sent)
    assert "banker" not in [c["tag"] for c in llm.calls]


def test_max_products_per_day_stops_before_llm(make_rt):
    rt, llm = make_rt()
    rt.store.insert_product(id="p0", run_id="r0", name="Today", topic_key="today", price_usd=9,
                            gumroad_url=None, status="draft_ready")
    run_id = rt.runner.start_run("studio_daily", {})
    _drain(rt)
    assert rt.store.get_run(run_id).status == "rejected"
    assert llm.calls == []


# --- sales report + webhook --------------------------------------------------------------------------

def test_webhook_records_sale_and_notifies_once(make_rt):
    rt, _ = make_rt()
    assert handle_gumroad_ping(dict(PING), rt) == {"accepted": True, "duplicate": False, "verified": False}
    assert handle_gumroad_ping(dict(PING), rt)["duplicate"] is True
    sale_msgs = [m for m in rt.notifier.sent if "Yeni satış" in m]
    assert len(sale_msgs) == 1 and "19.00" in sale_msgs[0]


def test_webhook_ignores_invalid_and_test_pings(make_rt):
    rt, _ = make_rt()
    assert handle_gumroad_ping({"foo": "bar"}, rt)["accepted"] is False
    assert handle_gumroad_ping({**PING, "test": "true"}, rt) == {"accepted": True, "test": True}
    assert rt.store.ledger_total() == 0


@responses.activate
def test_webhook_verifies_sale_with_api_when_token_set(make_rt):
    rt, _ = make_rt(gumroad_access_token="tok")
    responses.get(f"{API_BASE}/sales/S1", json={"success": False, "message": "not found"}, status=404)
    assert handle_gumroad_ping(dict(PING), rt) == {"accepted": False, "reason": "sale not found in Gumroad"}
    responses.replace(responses.GET, f"{API_BASE}/sales/S1", json={"success": True, "sale": {"id": "S1"}})
    assert handle_gumroad_ping(dict(PING), rt)["verified"] is True


def test_sales_report_pipeline(make_rt):
    rt, llm = make_rt()
    handle_gumroad_ping(dict(PING), rt)
    run_id = rt.runner.start_run("studio_sales_report", {})
    _drain(rt)
    assert rt.store.get_run(run_id).status == "done"
    banker = json.loads(next(c for c in llm.calls if c["tag"] == "banker")["messages"][0]["content"])
    assert banker["payload"]["mode"] == "report"
    assert banker["payload"]["ledger"]["gross_sales_usd"] >= 0
    assert any("hesabat" in m.lower() for m in rt.notifier.sent)


def test_sales_report_runs_while_kill_switch_active(make_rt):
    rt, _ = make_rt()
    rt.kill.activate("studio", reason="test")
    run_id = rt.runner.start_run("studio_sales_report", {})
    _drain(rt)
    assert rt.store.get_run(run_id).status == "done"


# --- weekly reflect -> directives -> context ------------------------------------------------------------

def test_weekly_reflect_saves_directives_used_by_next_ceo_call(make_rt):
    rt, llm = make_rt()
    run_id = rt.runner.start_run("studio_weekly_reflect", {})
    _drain(rt)
    assert rt.store.get_run(run_id).status == "done"
    assert rt.store.active_directives("studio", "ceo")
    rt.runner.start_run("studio_daily", {})
    _drain(rt)
    ceo_call = next(c for c in llm.calls if c["tag"] == "ceo")
    ctx = json.loads(ceo_call["messages"][0]["content"])["context"]
    assert ctx["market_language"] == "en"
    assert any("Bundles raise AOV" in d for d in ctx["learned_directives"])


# --- dry run ------------------------------------------------------------------------------------------

def test_dry_run_script_exits_zero(tmp_path):
    res = subprocess.run([sys.executable, "scripts/dry_run.py", "--org", "studio", "--data-dir", str(tmp_path)],
                         cwd=ROOT, capture_output=True, text=True, timeout=120)
    assert res.returncode == 0, res.stdout + res.stderr
    assert "studio_daily: done" in res.stdout
    assert "studio_sales_report: done" in res.stdout
