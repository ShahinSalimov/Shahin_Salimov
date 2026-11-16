"""Tests for scheduler, bootstrap and the Flask app."""
import subprocess
import sys

import pytest

from core.bootstrap import Runtime, build_runtime
from core.config import Settings
from core.pipeline import Pipeline, Step
from core.scheduler import ScheduleEntry, build_scheduler, fire
from core.tools.whatsapp import ConsoleWhatsApp
from tests.conftest import ROOT, FakeLLM

TOKEN = "admin-secret-123"


def _pipes():
    return {"hello": Pipeline(name="hello", start="say",
                              steps={"say": Step(tool="whatsapp_send", next=lambda o, s: None)}),
            "report": Pipeline(name="report", start="say",
                               steps={"say": Step(tool="whatsapp_send", next=lambda o, s: None)})}


@pytest.fixture
def runtime(tmp_path):
    settings = Settings(_env_file=None, org="studio", admin_token=TOKEN, gumroad_ping_secret="ping-xyz")
    rt = build_runtime("studio", settings, llm=FakeLLM({}), notifier=ConsoleWhatsApp(org="studio"),
                       db_path=tmp_path / "app.db", pipelines=_pipes(), schedule=[],
                       allowed_when_killed={"report"})
    yield rt
    rt.stop()


@pytest.fixture
def client(runtime):
    from app import create_app
    return create_app(runtime).test_client()


# --- bootstrap -------------------------------------------------------------------------------

def test_build_runtime_wires_components(runtime):
    assert isinstance(runtime, Runtime)
    assert runtime.org == "studio"
    assert runtime.store.org == "studio"
    assert runtime.runner.org == "studio"
    assert "whatsapp_send" in runtime.tools
    assert runtime.agents.routing["ceo"] == ("claude-opus-5-5", "high")
    assert runtime.agents.routing["research"] == ("claude-sonnet-5-5", "medium")


def test_build_runtime_rejects_unknown_org(tmp_path):
    with pytest.raises(ValueError):
        build_runtime("marketing", Settings(_env_file=None), llm=FakeLLM({}), db_path=tmp_path / "x.db")


def test_runtime_runs_pipeline_end_to_end(runtime):
    runtime.runner.start_run("hello", {"text": "Salam"})
    while runtime.runner.tick():
        pass
    assert runtime.notifier.sent == ["[STUDIO] Salam"]


@pytest.mark.parametrize("org,other", [("studio", "youtube"), ("youtube", "studio")])
def test_bootstrap_does_not_import_other_org(tmp_path, org, other):
    code = (
        "import sys\n"
        "from core.bootstrap import build_runtime\n"
        "from core.config import Settings\n"
        "from core.tools.whatsapp import ConsoleWhatsApp\n"
        f"rt = build_runtime('{org}', Settings(_env_file=None), llm=object(), "
        f"notifier=ConsoleWhatsApp(org='{org}'), db_path=r'{tmp_path / 'iso.db'}')\n"
        f"bad = [m for m in sys.modules if m.startswith('orgs.{other}')]\n"
        "assert not bad, bad\n"
        "rt.stop()\n"
    )
    res = subprocess.run([sys.executable, "-c", code], cwd=ROOT, capture_output=True, text=True)
    assert res.returncode == 0, res.stderr


# --- scheduler ---------------------------------------------------------------------------------

def test_build_scheduler_registers_cron_jobs(runtime):
    entries = [ScheduleEntry(name="daily", pipeline="hello", cron="0 6 * * *", payload={"text": "x"}),
               ScheduleEntry(name="weekly", pipeline="report", cron="0 18 * * sun")]
    sched = build_scheduler(runtime.runner, entries)
    jobs = {j.id: j for j in sched.get_jobs()}
    assert set(jobs) == {"daily", "weekly"}
    assert "hour='6'" in str(jobs["daily"].trigger)
    assert str(jobs["daily"].trigger.timezone) == "UTC"


def test_fire_starts_run_and_swallows_kill_switch(runtime):
    entry = ScheduleEntry(name="daily", pipeline="hello", cron="0 6 * * *", payload={"text": "x"})
    assert fire(runtime.runner, entry) is not None
    runtime.kill.activate("studio", reason="manual")
    assert fire(runtime.runner, entry) is None      # logged, not raised


def test_invalid_cron_rejected(runtime):
    with pytest.raises(ValueError):
        build_scheduler(runtime.runner, [ScheduleEntry(name="x", pipeline="hello", cron="every day")])


def test_schedule_entry_must_reference_known_pipeline(runtime):
    with pytest.raises(KeyError):
        build_scheduler(runtime.runner, [ScheduleEntry(name="x", pipeline="nope", cron="0 6 * * *")])


# --- Flask app -----------------------------------------------------------------------------------

def test_health(client, runtime):
    res = client.get("/health")
    assert res.status_code == 200
    body = res.get_json()
    assert body["org"] == "studio"
    assert body["queue"] == 0
    assert body["kill_switch"] is False
    assert body["budget_remaining_usd"] == pytest.approx(5.0)


def test_admin_requires_token(client):
    assert client.post("/admin/run/hello", json={}).status_code == 401
    assert client.post("/admin/run/hello", json={}, headers={"X-Admin-Token": "wrong"}).status_code == 401


def test_admin_disabled_without_configured_token(tmp_path):
    from app import create_app
    rt = build_runtime("studio", Settings(_env_file=None), llm=FakeLLM({}),
                       notifier=ConsoleWhatsApp(org="studio"), db_path=tmp_path / "n.db",
                       pipelines=_pipes(), schedule=[])
    c = create_app(rt).test_client()
    assert c.post("/admin/run/hello", json={}, headers={"X-Admin-Token": ""}).status_code == 401
    rt.stop()


def test_admin_run_starts_pipeline(client, runtime):
    res = client.post("/admin/run/hello", json={"text": "Test"}, headers={"X-Admin-Token": TOKEN})
    assert res.status_code == 202
    run_id = res.get_json()["run_id"]
    assert runtime.store.get_run(run_id).pipeline == "hello"
    assert client.post("/admin/run/nope", json={}, headers={"X-Admin-Token": TOKEN}).status_code == 404


def test_admin_get_run(client, runtime):
    run_id = runtime.runner.start_run("hello", {"text": "x"})
    res = client.get(f"/admin/runs/{run_id}", headers={"X-Admin-Token": TOKEN})
    assert res.status_code == 200
    body = res.get_json()
    assert body["run"]["id"] == run_id
    assert body["jobs"][0]["step"] == "say"
    assert client.get("/admin/runs/missing", headers={"X-Admin-Token": TOKEN}).status_code == 404


def test_admin_kill_and_reset(client, runtime):
    h = {"X-Admin-Token": TOKEN}
    assert client.post("/admin/kill", json={"reason": "test"}, headers=h).status_code == 200
    assert runtime.kill.is_active("studio")
    assert client.post("/admin/run/hello", json={}, headers=h).status_code == 409
    assert client.post("/admin/run/report", json={"text": "r"}, headers=h).status_code == 202
    assert client.delete("/admin/kill", headers=h).status_code == 200
    assert not runtime.kill.is_active("studio")


def test_gumroad_webhook_hidden_without_valid_secret(client):
    assert client.post("/webhooks/gumroad/wrong", data={"sale_id": "1"}).status_code == 404


def test_gumroad_webhook_calls_org_hook(client, runtime):
    received = []
    runtime.webhooks["gumroad"] = lambda form, rt: received.append(form) or {"accepted": True}
    res = client.post("/webhooks/gumroad/ping-xyz", data={"sale_id": "S1"})
    assert res.status_code == 200
    assert received == [{"sale_id": "S1"}]


def test_gumroad_webhook_404_when_org_has_no_hook(client):
    assert client.post("/webhooks/gumroad/ping-xyz", data={"sale_id": "S1"}).status_code == 404
