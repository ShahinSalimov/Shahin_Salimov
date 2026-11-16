"""Pipelines: studio_daily, studio_sales_report, studio_weekly_reflect.

studio_daily:
  tools.portfolio -> ceo.plan -> tools.collect_signals -> research -> ceo.decide -> content.listing
  -> content.section (sequential, one per outline item, each sees earlier summaries) -> tools.build_assets
  -> philosopher.review -> [approve] banker.pricing -> tools.publish (idempotent) -> tools.notify
                        -> [revise, max 2 rounds] content.listing ... (all sections rewritten with notes)
                        -> [reject / rounds exhausted] tools.notify_rejection
studio_sales_report: tools.compute_ledger -> banker.report -> tools.send_report
studio_weekly_reflect: tools.weekly_metrics -> philosopher.reflect -> tools.save_directives -> tools.notify
"""
from __future__ import annotations

from typing import Any, Callable

from core.pipeline import Pipeline, Step
from orgs.studio import payloads as P

MAX_REVISION_ROUNDS = 2


def _to(name: str) -> Callable[[dict, dict], str]:
    return lambda out, state: name


def _end(out: dict, state: dict) -> None:
    return None


def route_after_decide(out: dict[str, Any], state: dict[str, Any]) -> str:
    state["section_total"] = len(out["product_spec"]["outline"])
    state["section_cursor"] = 0
    state.setdefault("revision_round", 0)
    return "content.listing"


def route_after_section(out: dict[str, Any], state: dict[str, Any]) -> str:
    state["section_cursor"] = int(state.get("section_cursor", 0)) + 1
    return "content.section" if state["section_cursor"] < int(state["section_total"]) else "tools.build_assets"


def route_after_review(out: dict[str, Any], state: dict[str, Any]) -> str:
    decision = out["decision"]
    if decision == "approve":
        return "banker.pricing"
    if decision == "revise" and int(state.get("revision_round", 0)) < MAX_REVISION_ROUNDS:
        state["revision_round"] = int(state.get("revision_round", 0)) + 1
        state["revision_notes"] = out.get("revision_notes", [])
        state["section_cursor"] = 0
        return "content.listing"
    state["outcome"] = "rejected_by_philosopher"
    return "tools.notify_rejection"


def route_after_publish(out: dict[str, Any], state: dict[str, Any]) -> str:
    state["outcome"] = out.get("publish_status")
    return "tools.notify"


STUDIO_DAILY = Pipeline(
    name="studio_daily",
    start="tools.portfolio",
    steps={
        "tools.portfolio": Step(tool="studio_portfolio", next=_to("ceo.plan")),
        "ceo.plan": Step(agent="ceo", mode="plan", next=_to("tools.collect_signals")),
        "tools.collect_signals": Step(tool="collect_market_signals", next=_to("research")),
        "research": Step(agent="research", next=_to("ceo.decide")),
        "ceo.decide": Step(agent="ceo", mode="decide", next=route_after_decide),
        "content.listing": Step(agent="content", mode="listing", next=_to("content.section")),
        "content.section": Step(agent="content", mode="section", next=route_after_section),
        "tools.build_assets": Step(tool="build_product_files", next=_to("philosopher.review")),
        "philosopher.review": Step(agent="philosopher", mode="review", next=route_after_review),
        "banker.pricing": Step(agent="banker", mode="pricing", next=_to("tools.publish")),
        "tools.publish": Step(tool="gumroad_publish", idempotent=True, next=route_after_publish),
        "tools.notify": Step(tool="whatsapp_send", next=_end),
        "tools.notify_rejection": Step(tool="whatsapp_send", next=_end),
    },
    payload_builders={
        "ceo.plan": P.for_ceo_plan,
        "tools.collect_signals": P.for_collect_signals,
        "research": P.for_research,
        "ceo.decide": P.for_ceo_decide,
        "content.listing": P.for_content_listing,
        "content.section": P.for_content_section,
        "tools.build_assets": P.for_build_assets,
        "philosopher.review": P.for_philosopher_review,
        "banker.pricing": P.for_banker_pricing,
        "tools.publish": P.for_publish,
        "tools.notify": P.for_notify_published,
        "tools.notify_rejection": P.for_notify_rejection,
    },
)

STUDIO_SALES_REPORT = Pipeline(
    name="studio_sales_report",
    start="tools.compute_ledger",
    steps={
        "tools.compute_ledger": Step(tool="compute_ledger", next=_to("banker.report")),
        "banker.report": Step(agent="banker", mode="report", next=_to("tools.send_report")),
        "tools.send_report": Step(tool="whatsapp_send", next=_end),
    },
    payload_builders={"banker.report": P.for_banker_report, "tools.send_report": P.for_send_report},
)

STUDIO_WEEKLY_REFLECT = Pipeline(
    name="studio_weekly_reflect",
    start="tools.weekly_metrics",
    steps={
        "tools.weekly_metrics": Step(tool="weekly_metrics", next=_to("philosopher.reflect")),
        "philosopher.reflect": Step(agent="philosopher", mode="reflect", next=_to("tools.save_directives")),
        "tools.save_directives": Step(tool="save_directives", next=_to("tools.notify")),
        "tools.notify": Step(tool="whatsapp_send", next=_end),
    },
    payload_builders={"philosopher.reflect": P.for_philosopher_reflect,
                      "tools.save_directives": P.for_save_directives,
                      "tools.notify": P.for_notify_reflection},
)

PIPELINES: dict[str, Pipeline] = {p.name: p for p in (STUDIO_DAILY, STUDIO_SALES_REPORT, STUDIO_WEEKLY_REFLECT)}
ALLOWED_WHEN_KILLED: set[str] = {"studio_sales_report"}


def build_context_provider(store, settings):
    """Every run's context: market language and the CEO's active learned directives."""

    def provide(pipeline_name: str) -> dict[str, Any]:
        return {"market_language": settings.market_language,
                "learned_directives": store.active_directives("studio", "ceo")}

    return provide
