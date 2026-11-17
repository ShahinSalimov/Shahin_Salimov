"""Tests for scripts/replay.py, the /admin/backup endpoint and the WSGI entry point."""
import importlib.util
import sqlite3
import subprocess
import sys

import pytest

from core.bootstrap import build_runtime
from core.config import Settings
from core.pipeline import Pipeline, Step
from core.testing import FakeLLM
from core.tools.whatsapp import ConsoleWhatsApp
from tests.conftest import ROOT

TOKEN = "admin-secret-xyz"


def _load_replay():
    spec = importlib.util.spec_from_file_location("replay", ROOT / "scripts" / "replay.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


@pytest.fixture
def finished_run(tmp_path):
    pipes = {"p": Pipeline(name="p", start="a", steps={
        "a": Step(tool="whatsapp_send", next=lambda o, s: "b"),
        "b": Step(tool="whatsapp_send", next=lambda o, s: None)},
        payload_builders={"b": lambda out, st, outs: [{"text": "second"}]})}
    rt = build_runtime("studio", Settings(_env_file=None, admin_token=TOKEN), llm=FakeLLM({}),
                       notifier=ConsoleWhatsApp(org="studio"), db_path=tmp_path / "studio.db", pipelines=pipes,
                       schedule=[])
    run_id = rt.runner.start_run("p", {"text": "first-secret-value"})
    while rt.runner.tick():
        pass
    yield rt, run_id, tmp_path / "studio.db"
    rt.stop()


def test_replay_renders_every_step(finished_run):
    rt, run_id, db = finished_run
    text = _load_replay().render_run(rt.store, run_id, full=True)
    assert f"run {run_id}" in text and "pipeline=p" in text and "status=done" in text
    assert text.index("a ") < text.index("b ")
    assert '"text": "first-secret-value"' in text and '"text": "second"' in text


def test_replay_lists_recent_runs(finished_run):
    rt, run_id, db = finished_run
    assert run_id in _load_replay().render_list(rt.store, "studio", limit=5)


def test_replay_cli(finished_run):
    rt, run_id, db = finished_run
    res = subprocess.run([sys.executable, "scripts/replay.py", "--db", str(db), "--org", "studio", run_id],
                         cwd=ROOT, capture_output=True, text=True)
    assert res.returncode == 0, res.stderr
    assert "status=done" in res.stdout
    res = subprocess.run([sys.executable, "scripts/replay.py", "--db", str(db), "--org", "studio", "missing"],
                         cwd=ROOT, capture_output=True, text=True)
    assert res.returncode == 1


def test_replay_masks_secrets_in_payloads(finished_run):
    rt, run_id, db = finished_run
    text = _load_replay().render_run(rt.store, run_id, full=True, secrets=["first-secret-value"])
    assert '"text": "***"' in text


def test_admin_backup_returns_consistent_sqlite_copy(finished_run, tmp_path):
    from app import create_app
    rt, run_id, db = finished_run
    client = create_app(rt).test_client()
    assert client.get("/admin/backup").status_code == 401
    res = client.get("/admin/backup", headers={"X-Admin-Token": TOKEN})
    assert res.status_code == 200
    assert res.headers["Content-Disposition"].startswith("attachment; filename=studio-")
    out = tmp_path / "copy.db"
    out.write_bytes(res.data)
    conn = sqlite3.connect(out)
    try:
        assert conn.execute("SELECT COUNT(*) FROM runs WHERE id=?", (run_id,)).fetchone()[0] == 1
    finally:
        conn.close()


def test_wsgi_app_builds_without_background_threads(tmp_path, monkeypatch):
    monkeypatch.setenv("ORG", "studio")
    monkeypatch.setenv("DB_PATH", str(tmp_path / "w.db"))
    monkeypatch.setenv("WHATSAPP_PROVIDER", "console")
    spec = importlib.util.spec_from_file_location("wsgi_test", ROOT / "wsgi.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    assert mod.runtime.scheduler is None and mod.runtime._worker is None
    assert mod.app.test_client().get("/health").get_json()["org"] == "studio"
    mod.runtime.stop()
