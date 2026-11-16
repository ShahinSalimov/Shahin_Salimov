"""Payload builders that assemble each step's input from previous outputs and run state.

Signature: ``builder(output_of_previous_step, run_state, outputs) -> list[payload]`` where
``outputs[step]`` is the latest output of a step and ``outputs.all(step)`` every output in order.
Each builder passes on only what the next agent needs (no status/errors/confidence noise).
"""
from __future__ import annotations

from typing import Any

from orgs.studio.tools.build_assets import latest_sections

AGENT_META_KEYS = {"status", "errors", "confidence"}


def _clean(d: dict[str, Any]) -> dict[str, Any]:
    return {k: v for k, v in d.items() if k not in AGENT_META_KEYS}


def _spec(outs) -> dict[str, Any]:
    return outs["ceo.decide"]["product_spec"]


def _current_sections(outs, state) -> list[dict[str, Any]]:
    """Sections of the current revision round (the last N outputs of content.section)."""
    n = int(state.get("section_cursor", 0))
    all_sections = outs.all("content.section")
    return latest_sections(all_sections[-n:]) if n else []


def for_ceo_plan(out, state, outs):
    return [{"date": out["date"], "portfolio": out["portfolio"], "history_topics": out["history_topics"],
             "budget": out["budget"], "research_report": None}]


def for_collect_signals(out, state, outs):
    return [{"research_brief": out["research_brief"]}]


def for_research(out, state, outs):
    return [{"research_brief": out["research_brief"], "raw_signals": out["raw_signals"],
             "history_topics": out["history_topics"]}]


def for_ceo_decide(out, state, outs):
    snap = outs["tools.portfolio"]
    return [{"date": snap["date"], "portfolio": snap["portfolio"], "history_topics": snap["history_topics"],
             "budget": snap["budget"], "research_report": _clean(out)}]


def for_content_listing(out, state, outs):
    return [{"product_spec": _spec(outs), "build_step": "listing", "section_index": None,
             "previous_sections_summary": "", "revision_notes": state.get("revision_notes")}]


def for_content_section(out, state, outs):
    cursor = int(state.get("section_cursor", 0))
    done = _current_sections(outs, state)
    summary = "\n".join(f"[{s['section_index']}] {s['section_title']}: {s['section_summary']}" for s in done)
    return [{"product_spec": _spec(outs), "build_step": "section", "section_index": cursor,
             "previous_sections_summary": summary, "revision_notes": state.get("revision_notes")}]


def for_build_assets(out, state, outs):
    return [{"product_spec": _spec(outs), "listing": outs["content.listing"]["listing"],
             "sections": _current_sections(outs, state)}]


def for_philosopher_review(out, state, outs):
    return [{"product_spec": _spec(outs), "listing": outs["content.listing"]["listing"],
             "assets_manifest": out["assets_manifest"], "missing_deliverables": out["missing_deliverables"],
             "revision_round": int(state.get("revision_round", 0)), "weekly_metrics": None}]


def for_banker_pricing(out, state, outs):
    decide = outs["ceo.decide"]
    selected = decide["selected_opportunity_id"]
    opp = next((o for o in outs["research"]["opportunities"] if o["opportunity_id"] == selected), None)
    return [{"product_spec": decide["product_spec"], "price_band": (opp or {}).get("price_band"), "ledger": None}]


def for_publish(out, state, outs):
    return [{"product_spec": _spec(outs), "listing": outs["content.listing"]["listing"], "pricing": _clean(out),
             "bundle": {k: outs["tools.build_assets"][k] for k in ("bundle_path", "files")}}]


def for_notify_published(out, state, outs):
    where = out.get("url") or out.get("draft_path")
    lines = [f"Yeni məhsul hazırdır: {out['name']}", f"Qiymət: {out['price_usd']:.2f} USD",
             f"Status: {out['publish_status']}", f"Yer: {where}"]
    if out.get("offer_code"):
        oc = out["offer_code"]
        lines.append(f"Endirim kodu: {oc['code']} ({oc['percent_off']:g}%)"
                     + ("" if out.get("offer_code_created") else " - Gumroad-da əl ilə yarat"))
    if out.get("publish_status") != "published":
        lines.append("Qeyd: faylları Gumroad-a əl ilə yükləmək lazımdır (draft rejimi).")
    return [{"text": "\n".join(lines)}]


def for_notify_rejection(out, state, outs):
    issues = out.get("blocking_issues") or out.get("revision_notes") or ["keyfiyyət həddi keçilmədi"]
    title = outs.get("ceo.decide", {}).get("product_spec", {}).get("working_title", "məhsul")
    return [{"text": f"Məhsul dərc edilmədi: {title}\nSəbəb: " + "; ".join(issues)[:700]}]


def for_banker_report(out, state, outs):
    return [{"ledger": out["ledger"], "product_spec": None, "price_band": None}]


def for_send_report(out, state, outs):
    return [{"whatsapp_message": out["whatsapp_message"]}]


def for_philosopher_reflect(out, state, outs):
    return [{"weekly_metrics": out["weekly_metrics"], "product_spec": None, "listing": None,
             "assets_manifest": [], "revision_round": 0}]


def for_save_directives(out, state, outs):
    return [_clean(out)]


def for_notify_reflection(out, state, outs):
    return [{"text": f"Həftəlik refleksiya: {out['critique'][:600]}\nYeni direktiv sayı: {out['saved']}"}]
