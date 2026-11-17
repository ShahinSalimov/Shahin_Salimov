"""Pipelines: youtube_daily, youtube_weekly_growth.

youtube_daily:
  tools.gate -> tools.collect_signals -> trend_scout -> script_writer -> media_producer.plan
  -> tools.render -> tools.qc_measure -> media_producer.qc
     -> [agent pass AND no hard failures] seo_upload -> tools.youtube_upload (idempotent) -> tools.notify
     -> [otherwise, first time] tools.render (re-render with fixes) -> ...
     -> [otherwise, second time] tools.notify_failure (nothing is uploaded)
youtube_weekly_growth:
  tools.weekly_analytics -> growth_banker -> tools.apply_growth (directives, throttle) -> tools.send_report
"""
from __future__ import annotations

from typing import Any, Callable

from core.pipeline import Pipeline, Step
from orgs.youtube import payloads as P

MAX_RERENDERS = 1


def _to(name: str) -> Callable[[dict, dict], str]:
    return lambda out, state: name


def _end(out: dict, state: dict) -> None:
    return None


def route_after_qc(out: dict[str, Any], state: dict[str, Any]) -> str:
    """The QC gate. Code-level hard failures override an LLM 'pass'."""
    hard = state.get("qc_hard_failures") or []
    if out["verdict"] == "pass" and not hard:
        state["outcome"] = "qc_passed"
        return "seo_upload"
    if int(state.get("render_round", 0)) < MAX_RERENDERS:
        state["render_round"] = int(state.get("render_round", 0)) + 1
        state["qc_fixes"] = out.get("fixes") or []
        return "tools.render"
    state["outcome"] = "qc_failed"
    return "tools.notify_failure"


def route_after_upload(out: dict[str, Any], state: dict[str, Any]) -> str:
    state["outcome"] = "scheduled"
    return "tools.notify"


YOUTUBE_DAILY = Pipeline(
    name="youtube_daily",
    start="tools.gate",
    steps={
        "tools.gate": Step(tool="yt_gate", next=_to("tools.collect_signals")),
        "tools.collect_signals": Step(tool="collect_yt_signals", next=_to("trend_scout")),
        "trend_scout": Step(agent="trend_scout", next=_to("script_writer")),
        "script_writer": Step(agent="script_writer", next=_to("media_producer.plan")),
        "media_producer.plan": Step(agent="media_producer", mode="plan", next=_to("tools.render")),
        "tools.render": Step(tool="render_video", next=_to("tools.qc_measure")),
        "tools.qc_measure": Step(tool="qc_measure", next=_to("media_producer.qc")),
        "media_producer.qc": Step(agent="media_producer", mode="qc", next=route_after_qc),
        "seo_upload": Step(agent="seo_upload", next=_to("tools.youtube_upload")),
        "tools.youtube_upload": Step(tool="youtube_upload", idempotent=True, next=route_after_upload),
        "tools.notify": Step(tool="whatsapp_send", next=_end),
        "tools.notify_failure": Step(tool="whatsapp_send", next=_end),
    },
    payload_builders={
        "tools.collect_signals": P.for_collect,
        "trend_scout": P.for_trend_scout,
        "script_writer": P.for_script_writer,
        "media_producer.plan": P.for_media_plan,
        "tools.render": P.for_render,
        "tools.qc_measure": P.for_qc_measure,
        "media_producer.qc": P.for_media_qc,
        "seo_upload": P.for_seo,
        "tools.youtube_upload": P.for_upload,
        "tools.notify": P.for_notify,
        "tools.notify_failure": P.for_notify_failure,
    },
)

YOUTUBE_WEEKLY_GROWTH = Pipeline(
    name="youtube_weekly_growth",
    start="tools.weekly_analytics",
    steps={
        "tools.weekly_analytics": Step(tool="weekly_analytics", next=_to("growth_banker")),
        "growth_banker": Step(agent="growth_banker", next=_to("tools.apply_growth")),
        "tools.apply_growth": Step(tool="apply_growth", next=_to("tools.send_report")),
        "tools.send_report": Step(tool="whatsapp_send", next=_end),
    },
    payload_builders={"growth_banker": P.for_growth_banker, "tools.apply_growth": P.for_apply_growth,
                      "tools.send_report": P.for_send_report},
)

PIPELINES: dict[str, Pipeline] = {p.name: p for p in (YOUTUBE_DAILY, YOUTUBE_WEEKLY_GROWTH)}
ALLOWED_WHEN_KILLED: set[str] = {"youtube_weekly_growth"}

DIRECTIVE_TARGETS = ("trend_scout", "script_writer", "media_producer")


def build_context_provider(store, settings):
    def provide(pipeline_name: str) -> dict[str, Any]:
        directives = [f"[{t}] {d}" for t in DIRECTIVE_TARGETS for d in store.active_directives("youtube", t)]
        return {"market_language": settings.yt_language, "learned_directives": directives}

    return provide
