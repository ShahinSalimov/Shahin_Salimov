"""Development-only fakes for the youtube org: scripted agents, signals and analytics.

Used by scripts/dry_run.py and the test suite together with FakeTTS, FakeImageGen and FakeUploader
(selected via YT_*_MODE=fake, TTS_PROVIDER=fake, MEDIA_PROVIDER=fake). Agent answers are derived from
the request and the validated fixtures in tests/fixtures/youtube/, so they pass the real schemas.
"""
from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Callable

FIXTURES = Path(__file__).resolve().parents[2] / "tests" / "fixtures" / "youtube"


def _fx(name: str) -> dict[str, Any]:
    return json.loads((FIXTURES / f"{name}.json").read_text(encoding="utf-8"))


def _payload(messages: list[dict[str, Any]]) -> dict[str, Any]:
    obj, _ = json.JSONDecoder().raw_decode(messages[0]["content"])
    return obj["payload"]


OK = {"status": "ok", "errors": [], "confidence": 0.85}

SCENES = [
    ("Your budget is not failing because of you.", "It's not you",
     "Close-up of a crumpled receipt on a wooden desk, 50mm lens, soft window light", "ai_image_kenburns"),
    ("It fails because of irregular expenses nobody plans for.", "Irregular expenses",
     "Top-down shot of a calendar with scattered sticky notes, natural light", "ai_image_kenburns"),
    ("Add them up for a year, divide by twelve, and save that every month.", "Divide by 12",
     "Hands writing numbers in a notebook next to a calculator, shallow depth of field", "text_card"),
]


def _script(payload: dict[str, Any]) -> dict[str, Any]:
    scenes, t = [], 0.0
    for i, (vo, text, prompt, vtype) in enumerate(SCENES):
        dur = round(len(vo.split()) * 0.4, 1)
        scenes.append({"scene_index": i, "start_s": t, "end_s": round(t + dur, 1), "voiceover": vo,
                       "on_screen_text": text, "visual_prompt": prompt, "visual_type": vtype, "sfx": None})
        t = round(t + dur, 1)
    words = sum(len(s[0].split()) for s in SCENES)
    return {**OK, "title_draft": payload["idea"]["working_title"], "total_duration_s": t, "word_count": words,
            "scenes": scenes, "fact_checks": [], "revision_log": []}


def _plan(payload: dict[str, Any]) -> dict[str, Any]:
    profile, script, prov = payload["channel_profile"], payload["script"], payload["available_providers"]
    w, h = (1080, 1920) if profile.get("format") == "shorts" else (1920, 1080)
    motions = ["kenburns_in", "pan_left", "kenburns_out"]
    library = prov.get("music_library") or []
    return {**OK, "mode": "plan", "output": {"width": w, "height": h, "fps": 30, "container": "mp4", "codec": "h264"},
            "voice": {"provider": prov["tts"][0], "voice_id": profile["voice_id"], "speed": 1.0},
            "scenes": [{"scene_index": s["scene_index"], "start_s": s["start_s"], "end_s": s["end_s"],
                        "asset_provider": prov["image"][0], "asset_prompt": s["visual_prompt"],
                        "motion": motions[s["scene_index"] % 3], "overlay_text": s["on_screen_text"],
                        "transition_in": "cut"} for s in script["scenes"]],
            "music": {"track": library[0], "gain_db": -18} if library else None,
            "subtitles": {"style": "word_highlight", "max_words_per_line": 3,
                          "position": "lower_third" if h > w else "bottom"},
            "thumbnail_prompt": "Bold flat card with a calendar icon, high contrast",
            "ai_disclosure_required": False}


def _qc(payload: dict[str, Any]) -> dict[str, Any]:
    failures = payload["qc_report"].get("hard_failures") or []
    if failures:
        return {**OK, "mode": "qc", "verdict": "fail",
                "fixes": [{"scene_index": 0, "problem": "; ".join(failures), "action": "re-render"}]}
    return {**OK, "mode": "qc", "verdict": "pass", "fixes": []}


def _seo(payload: dict[str, Any]) -> dict[str, Any]:
    seo = _fx("seo_upload")
    publish = (datetime.now(timezone.utc) + timedelta(hours=3)).strftime("%Y-%m-%dT%H:00:00Z")
    seo["status_block"] = {**seo["status_block"], "publishAt": publish,
                           "containsSyntheticMedia": bool(payload["render_result"].get("ai_disclosure_required"))}
    return seo


def fake_llm_script() -> dict[str, Callable[[str, list[dict[str, Any]]], dict[str, Any]]]:
    def media_producer(system, messages):
        p = _payload(messages)
        return _plan(p) if p["mode"] == "plan" else _qc(p)

    return {
        "trend_scout": lambda s, m: _fx("trend_scout"),
        "script_writer": lambda s, m: _script(_payload(m)),
        "media_producer": media_producer,
        "seo_upload": lambda s, m: _seo(_payload(m)),
        "growth_banker": lambda s, m: _fx("growth_banker"),
    }


class FakeSignalClient:
    def signals(self, keyword: str, shorts: bool, max_results: int = 15) -> list[dict[str, Any]]:
        return [{"source": "youtube", "keyword": keyword, "video_id": f"{keyword[:8]}-{i}",
                 "title": f"{keyword.title()} mistake #{i}", "channel_subs": 12000 // (i + 1),
                 "views": 480000 // (i + 1), "published_at": "2026-11-01T00:00:00Z", "duration_s": 42,
                 "outlier_ratio": round((480000 // (i + 1)) / max(12000 // (i + 1), 1000), 2)} for i in range(3)]


class FakeAnalytics:
    def video_report(self, start: str, end: str) -> list[dict[str, Any]]:
        return [{"video_id": "v1", "views": 12000, "watch_minutes": 3000, "avg_view_pct": 71.0, "subs_gained": 40,
                 "estimated_revenue_usd": 3.2, "ctr_pct": None},
                {"video_id": "v2", "views": 800, "watch_minutes": 100, "avg_view_pct": 35.0, "subs_gained": 1,
                 "estimated_revenue_usd": 0.1, "ctr_pct": None}]

    def titles(self, ids: list[str]) -> dict[str, str]:
        return {i: f"Video {i}" for i in ids}
