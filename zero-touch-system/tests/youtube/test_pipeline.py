"""Tests for YouTube pipelines (offline: FakeLLM, fake signals/TTS/images/uploader/analytics, real ffmpeg)."""
import json
import subprocess
import sys

import pytest
from freezegun import freeze_time

from core.bootstrap import build_runtime
from core.config import Settings
from core.testing import FakeLLM
from core.tools.whatsapp import ConsoleWhatsApp
from orgs.youtube import pipeline as yt_pipeline
from orgs.youtube.fakes import fake_llm_script
from orgs.youtube.pipeline import route_after_qc
from orgs.youtube.schedule import SCHEDULE
from tests.conftest import ROOT, load_fixture

FAKE = dict(yt_signal_mode="fake", yt_upload_mode="fake", yt_analytics_mode="fake", tts_provider="fake",
            media_provider="fake")


def _settings(tmp_path, **kw):
    base = dict(org="youtube", data_dir=str(tmp_path / "data"), yt_niche="personal finance explained",
                yt_seed_keywords="budget mistakes,saving money", yt_format="shorts", daily_budget_usd=5.0, **FAKE)
    base.update(kw)
    return Settings(_env_file=None, **base)


@pytest.fixture
def make_rt(tmp_path):
    made = []

    def _make(script_overrides=None, **kw):
        script = fake_llm_script()
        script.update(script_overrides or {})
        llm = FakeLLM(script)
        rt = build_runtime("youtube", _settings(tmp_path, **kw), llm=llm, notifier=ConsoleWhatsApp(org="youtube"),
                           db_path=tmp_path / "youtube.db")
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


def _tags(llm):
    out = []
    for c in llm.calls:
        p = json.loads(c["messages"][0]["content"])["payload"]
        out.append(f"{c['tag']}.{p['mode']}" if "mode" in p else c["tag"])
    return out


# --- routing & config -----------------------------------------------------------------------------

def test_route_after_qc_gate_cannot_be_bypassed():
    assert route_after_qc({"verdict": "pass"}, {"qc_hard_failures": []}) == "seo_upload"
    st = {"qc_hard_failures": ["black frames"], "render_round": 0}
    assert route_after_qc({"verdict": "pass", "fixes": []}, st) == "tools.render"   # LLM said pass, code says no
    assert st["render_round"] == 1
    assert route_after_qc({"verdict": "pass"}, st) == "tools.notify_failure"        # second failure: stop
    st2 = {"qc_hard_failures": [], "render_round": 0}
    assert route_after_qc({"verdict": "fail", "fixes": [{"scene_index": 1, "problem": "p", "action": "a"}]},
                          st2) == "tools.render"
    assert st2["qc_fixes"][0]["scene_index"] == 1


def test_schedule_and_kill_switch_config():
    assert {e.pipeline for e in SCHEDULE} == {"youtube_daily", "youtube_weekly_growth"}
    assert yt_pipeline.ALLOWED_WHEN_KILLED == {"youtube_weekly_growth"}


# --- gate -----------------------------------------------------------------------------------------------

def test_missing_niche_fails_without_llm(make_rt):
    rt, llm = make_rt(yt_niche=None)
    run_id = rt.runner.start_run("youtube_daily", {})
    _drain(rt)
    run = rt.store.get_run(run_id)
    assert run.status == "failed" and "YT_NICHE" in str(run.reason)
    assert llm.calls == []


def test_videos_per_day_cap(make_rt):
    rt, llm = make_rt()
    rt.store.insert_video(id="v0", run_id="r0", title="t", topic_key="t", youtube_video_id="y",
                          publish_at=None, status="scheduled")
    run_id = rt.runner.start_run("youtube_daily", {})
    _drain(rt)
    assert rt.store.get_run(run_id).status == "rejected" and llm.calls == []


def test_throttle_runs_every_other_day(make_rt):
    rt, llm = make_rt()
    rt.store.set_control("throttle:youtube", True)
    with freeze_time("2026-11-17 08:00:00"):          # day-of-year 321 (odd) -> skipped
        run_id = rt.runner.start_run("youtube_daily", {})
        _drain(rt)
    assert rt.store.get_run(run_id).status == "rejected"
    assert "throttle" in str(rt.store.get_run(run_id).reason)


def test_quota_too_low_rejects(make_rt):
    rt, llm = make_rt(yt_daily_quota_units=500)
    run_id = rt.runner.start_run("youtube_daily", {})
    _drain(rt)
    assert rt.store.get_run(run_id).status == "rejected"
    assert "quota" in str(rt.store.get_run(run_id).reason)


# --- youtube_daily end to end -------------------------------------------------------------------------------

def test_daily_pipeline_end_to_end(make_rt, tmp_path):
    rt, llm = make_rt()
    run_id = rt.runner.start_run("youtube_daily", {})
    _drain(rt)
    run = rt.store.get_run(run_id)
    assert run.status == "done", run.reason
    assert _tags(llm) == ["trend_scout", "script_writer", "media_producer.plan", "media_producer.qc", "seo_upload"]
    video = rt.store.videos()[0]
    assert video["status"] == "scheduled" and video["youtube_video_id"].startswith("fake-")
    render = rt.store.outputs_of(run_id)["tools.render"]
    assert render["video_path"].endswith(".mp4")
    qc_payload = json.loads(next(c for c in llm.calls if c["tag"] == "media_producer"
                                 and '"mode":"qc"' in c["messages"][0]["content"])["messages"][0]["content"])
    assert qc_payload["payload"]["qc_report"]["width"] == 1080
    assert any("Yeni video planlaşdırıldı" in m for m in rt.notifier.sent)
    assert rt.budget.spent_today("youtube") > 0
    ctx = json.loads(llm.calls[0]["messages"][0]["content"])["context"]
    assert ctx["market_language"] == "en"


def test_qc_fail_rerenders_once_then_passes(make_rt):
    fail = {**load_fixture("youtube", "media_producer.qc"), "verdict": "fail",
            "fixes": [{"scene_index": 0, "problem": "too dark", "action": "regenerate"}]}
    ok = {**load_fixture("youtube", "media_producer.qc"), "verdict": "pass", "fixes": []}
    rt, llm = make_rt({"media_producer": _mp_with_qc([fail, ok])})
    run_id = rt.runner.start_run("youtube_daily", {})
    _drain(rt)
    assert rt.store.get_run(run_id).status == "done"
    steps = [j.step for j in rt.store.jobs_of(run_id)]
    assert steps.count("tools.render") == 2 and steps.count("tools.youtube_upload") == 1


def test_qc_fail_twice_notifies_and_does_not_upload(make_rt):
    fail = {**load_fixture("youtube", "media_producer.qc"), "verdict": "fail",
            "fixes": [{"scene_index": 0, "problem": "too dark", "action": "regenerate"}]}
    rt, llm = make_rt({"media_producer": _mp_with_qc([fail, fail])})
    run_id = rt.runner.start_run("youtube_daily", {})
    _drain(rt)
    run = rt.store.get_run(run_id)
    assert run.status == "done" and run.state["outcome"] == "qc_failed"
    assert rt.store.videos() == []
    assert any("QC" in m for m in rt.notifier.sent)


def _mp_with_qc(qc_outputs):
    base = fake_llm_script()["media_producer"]
    queue = list(qc_outputs)

    def mp(system, messages):
        if '"mode":"qc"' in messages[0]["content"]:
            return queue.pop(0)
        return base(system, messages)

    return mp


# --- weekly growth -------------------------------------------------------------------------------------------

def test_weekly_growth_sets_throttle_and_directives(make_rt):
    gb = {**load_fixture("youtube", "growth_banker"), "throttle": True}
    rt, llm = make_rt({"growth_banker": [gb]})
    run_id = rt.runner.start_run("youtube_weekly_growth", {})
    _drain(rt)
    assert rt.store.get_run(run_id).status == "done"
    assert rt.store.get_control("throttle:youtube") is True
    assert rt.store.active_directives("youtube", "script_writer") == ["Open with the payoff"]
    assert any("Həftəlik YouTube hesabatı" in m for m in rt.notifier.sent)
    payload = json.loads(llm.calls[0]["messages"][0]["content"])["payload"]
    assert set(payload) >= {"analytics", "costs", "channel_profile"}


def test_weekly_growth_runs_while_killed_and_directives_reach_context(make_rt):
    rt, llm = make_rt()
    rt.kill.activate("youtube", reason="test")
    run_id = rt.runner.start_run("youtube_weekly_growth", {})
    _drain(rt)
    assert rt.store.get_run(run_id).status == "done"
    rt.kill.reset("youtube")
    rt.runner.start_run("youtube_daily", {})
    _drain(rt)
    ts_ctx = json.loads(next(c for c in llm.calls if c["tag"] == "trend_scout")["messages"][0]["content"])["context"]
    assert any("money-mistake" in d for d in ts_ctx["learned_directives"])


# --- dry run -------------------------------------------------------------------------------------------------

def test_dry_run_youtube_produces_real_mp4(tmp_path):
    res = subprocess.run([sys.executable, "scripts/dry_run.py", "--org", "youtube", "--data-dir", str(tmp_path)],
                         cwd=ROOT, capture_output=True, text=True, timeout=300)
    assert res.returncode == 0, res.stdout[-3000:] + res.stderr[-3000:]
    assert "youtube_daily: done" in res.stdout and "youtube_weekly_growth: done" in res.stdout
    mp4s = list(tmp_path.rglob("final.mp4"))
    assert mp4s and mp4s[0].stat().st_size > 10_000
