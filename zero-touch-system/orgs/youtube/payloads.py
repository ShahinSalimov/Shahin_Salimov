"""Payload builders for YouTube pipeline steps (see orgs/studio/payloads.py for the signature)."""
from __future__ import annotations

import re
import unicodedata
from datetime import datetime, timezone
from typing import Any

AGENT_META_KEYS = {"status", "errors", "confidence"}


def _clean(d: dict[str, Any]) -> dict[str, Any]:
    return {k: v for k, v in d.items() if k not in AGENT_META_KEYS}


def slugify(text: str) -> str:
    text = text.replace("ə", "e").replace("Ə", "E").replace("ı", "i").replace("İ", "I")
    norm = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", norm.lower()).strip("-")


def _gate(outs) -> dict[str, Any]:
    return outs["tools.gate"]


def _idea(outs) -> dict[str, Any]:
    ts = outs["trend_scout"]
    return next(i for i in ts["ideas"] if i["idea_id"] == ts["selected_idea_id"])


def for_collect(out, state, outs):
    return [{"channel_profile": out["channel_profile"], "keywords": out["keywords"]}]


def for_trend_scout(out, state, outs):
    return [{"channel_profile": out["channel_profile"], "raw_signals": out["raw_signals"],
             "history_titles": out["history_titles"]}]


def for_script_writer(out, state, outs):
    profile = _gate(outs)["channel_profile"]
    return [{"channel_profile": profile, "idea": _idea(outs),
             "target_duration_s": 45 if profile["format"] == "shorts" else 480, "revision_notes": None}]


def for_media_plan(out, state, outs):
    g = _gate(outs)
    return [{"channel_profile": g["channel_profile"], "script": _clean(out),
             "available_providers": g["available_providers"], "qc_report": None}]


def for_render(out, state, outs):
    return [{"plan": _clean(outs["media_producer.plan"]), "script": _clean(outs["script_writer"]),
             "channel_profile": _gate(outs)["channel_profile"], "fixes": state.get("qc_fixes")}]


def for_qc_measure(out, state, outs):
    return [{"video_path": out["video_path"], "output": outs["media_producer.plan"]["output"],
             "format": _gate(outs)["channel_profile"]["format"]}]


def for_media_qc(out, state, outs):
    g = _gate(outs)
    return [{"channel_profile": g["channel_profile"], "script": None,
             "available_providers": g["available_providers"], "qc_report": out["qc_report"]}]


def for_seo(out, state, outs):
    g, r = _gate(outs), outs["tools.render"]
    return [{"channel_profile": g["channel_profile"], "script": _clean(outs["script_writer"]),
             "render_result": {k: r[k] for k in ("video_path", "thumbnail_path", "duration_s", "ai_disclosure_required")},
             "channel_analytics": {"best_publish_hours_utc": g["publish_hours_utc"], "top_search_terms": g["keywords"],
                                   "now_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")}}]


def for_upload(out, state, outs):
    return [{"seo": _clean(out), "render_result": outs["tools.render"], "topic_key": slugify(_idea(outs)["working_title"]),
             "format": _gate(outs)["channel_profile"]["format"]}]


def for_notify(out, state, outs):
    lines = [f"Yeni video planlaşdırıldı: {out['title']}", f"Dərc vaxtı (UTC): {out['publish_at']}",
             f"Link: {out['url']}", f"AI məzmun bildirişi (containsSyntheticMedia): "
             f"{'bəli' if out['contains_synthetic_media'] else 'xeyr'}"]
    if not out.get("thumbnail_set"):
        lines.append("Thumbnail qoyulmadı (kanal təsdiqi lazım ola bilər).")
    if out.get("pinned_comment"):
        lines.append(f"Pin ediləcək şərh (əl ilə): {out['pinned_comment']}")
    lines.append("Qeyd: auditdən keçməmiş API layihəsində video private qalır.")
    return [{"text": "\n".join(lines)}]


def for_notify_failure(out, state, outs):
    problems = state.get("qc_hard_failures") or [f["problem"] for f in out.get("fixes", [])] or ["QC fail"]
    return [{"text": "Video yüklənmədi: media QC-dən keçmədi (2 render cəhdi).\nSəbəb: " + "; ".join(problems)[:700]}]


def for_growth_banker(out, state, outs):
    return [{"channel_profile": out["channel_profile"], "analytics": out["analytics"], "costs": out["costs"]}]


def for_apply_growth(out, state, outs):
    return [_clean(out)]


def for_send_report(out, state, outs):
    return [{"whatsapp_message": out["whatsapp_message"]}]
