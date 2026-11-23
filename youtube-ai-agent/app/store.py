"""JSON-based local storage: settings, API keys, profiles, library, projects."""
from __future__ import annotations

import copy
import json
import os
import threading
import time
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = Path(os.environ.get("YTA_DATA_DIR", ROOT / "data"))
PROJECTS = DATA / "projects"
OUTPUT = Path(os.environ.get("YTA_OUTPUT_DIR", ROOT / "output"))
_lock = threading.RLock()

DEFAULT_SETTINGS: dict = {
    "demo_mode": True,
    "script": {
        "language": "English",
        "style": "storytelling",
        "target_minutes": 2,
        "llm_provider": "deepseek",
        "llm_model": "deepseek-reasoner",
        "temperature": 1.3,
        "min_sentences": 1,
        "max_sentences": 4,
        "first_single_sentence_scenes": 6,
        "max_scene_seconds": 20,
        "hook_cta": (
            "In the first scenes, hook the viewer with a strong question or an unexpected fact. "
            "In minute 2 or 3, ask viewers to write their opinion in the comments with a relevant question. "
            "In the middle of the video, remind viewers to subscribe to the channel."
        ),
        "rules": (
            "Each scene must be one complete thought; never cut a sentence across scenes.\n"
            "Short sentences with spoken rhythm.\n"
            "Every few sentences open a loop: a question or a twist.\n"
            "Avoid cliches like 'imagine this', 'this is incredible', 'let's get started'.\n"
            "Do not explain the topic in the intro; start from the most interesting point.\n"
            "End with a sentence that links the viewer to the next idea."
        ),
        "voice_rules": (
            "Use punctuation for delivery: '...' for a pause, '!' for energy, '?' for rising intonation, ',' for a short breath.\n"
            "Add emotion tags in parentheses at the start of a sentence when useful: (calm), (sad), (excited), (whispering), (serious), (hopeful), (curious).\n"
            "Use at most one emotion tag per sentence and do not overuse them."
        ),
        "extra_rules": "",
    },
    "visual": {
        "aspect": "16:9",
        "image_model": "gpt-image-1",
        "quality": "low",
        "consistency": "strong",
        "style_id": "",
        "negative": "text, letters, watermark, logo, blurry, deformed hands, extra fingers",
    },
    "voice": {
        "provider": "fish",
        "voice_id": "",
        "fish_model": "s1",
        "speed": 1.0,
        "voices": [],
    },
    "subtitles": {"enabled": False, "burn_in": False, "max_lines": 2, "chars_per_line": 42, "font_size": 44},
    "music": {"enabled": False, "file": "", "volume": 0.12},
    "motion": {
        "ken_burns": True,
        "zoom_percent": 15,
        "animate_provider": "fal",
        "fal_model": "fal-ai/kling-video/v2.1/standard/image-to-video",
        "kie_model": "bytedance/seedance-2",
        "kie_image_field": "image_url",
        "kie_extra": "",
        "clip_seconds": 5,
    },
    "transitions": {"mode": "crossfade", "duration": 0.5, "types": ["fade", "dissolve", "smoothleft", "smoothright"]},
    "branding": {"logo": "", "logo_width_percent": 8, "position": "top-left"},
    "output": {"fps": 30, "crf": 20, "audio_bitrate": "192k"},
    "research": {
        "content_language": "English",
        "lang_code": "en",
        "region": "US",
        "ui_language": "Azerbaijani",
        "days": 90,
        "max_keywords": 12,
        "llm_provider": "",
        "llm_model": "",
    },
    "costs": {
        "image_low": 0.016,
        "image_medium": 0.063,
        "image_high": 0.25,
        "tts_per_million_chars": 15.0,
        "animate_per_clip": 0.35,
        "deepseek_in_per_m": 0.28,
        "deepseek_out_per_m": 0.42,
        "openai_in_per_m": 0.4,
        "openai_out_per_m": 1.6,
        "anthropic_in_per_m": 4.0,
        "anthropic_out_per_m": 20.0,
    },
}

DEFAULT_KEYS = {"deepseek": "", "openai": "", "anthropic": "", "fish": "", "elevenlabs": "", "fal": "", "kie": "", "youtube": ""}

BASE_STYLES = [
    {
        "id": "base-cartoon",
        "name": "Flat cartoon explainer",
        "prefix": "Flat 2D cartoon illustration, clean bold outlines, soft pastel palette, simple shapes,",
        "prompt": "minimal background, friendly expressive characters, consistent line weight, explainer video style",
        "negative": "text, logo, photorealistic",
        "builtin": True,
    },
    {
        "id": "base-cinematic",
        "name": "Cinematic realistic",
        "prefix": "Cinematic realistic photo, 35mm film look, dramatic soft lighting, shallow depth of field,",
        "prompt": "rich color grading, natural skin texture, high detail, documentary atmosphere",
        "negative": "text, logo, cartoon, deformed hands",
        "builtin": True,
    },
    {
        "id": "base-ink",
        "name": "Dark ink storybook",
        "prefix": "Dark moody ink and watercolor storybook illustration, muted earth tones, textured paper,",
        "prompt": "strong silhouettes, mysterious atmosphere, painterly brush strokes, mythological mood",
        "negative": "text, logo, neon colors",
        "builtin": True,
    },
]


def _read(path: Path, default):
    if not path.exists():
        return copy.deepcopy(default)
    with path.open(encoding="utf-8") as f:
        return json.load(f)


def _write(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    with tmp.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    os.replace(tmp, path)


def deep_merge(base: dict, override: dict) -> dict:
    out = copy.deepcopy(base)
    for k, v in (override or {}).items():
        if isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k] = deep_merge(out[k], v)
        else:
            out[k] = copy.deepcopy(v)
    return out


# ---------- settings ----------
def get_settings() -> dict:
    with _lock:
        return deep_merge(DEFAULT_SETTINGS, _read(DATA / "settings.json", {}))


def save_settings(new: dict) -> dict:
    with _lock:
        merged = deep_merge(get_settings(), new)
        _write(DATA / "settings.json", merged)
        return merged


# ---------- API keys ----------
def get_keys() -> dict:
    with _lock:
        return {**DEFAULT_KEYS, **_read(DATA / "keys.json", {})}


def save_keys(new: dict) -> dict:
    with _lock:
        keys = get_keys()
        for k, v in new.items():
            if k in DEFAULT_KEYS and v is not None and not str(v).startswith("•"):
                keys[k] = str(v).strip()
        _write(DATA / "keys.json", keys)
        return keys


def masked_keys() -> dict:
    return {k: ("•" * 8 + v[-4:] if v else "") for k, v in get_keys().items()}


# ---------- profiles ----------
def list_profiles() -> list[dict]:
    return _read(DATA / "profiles.json", [])


def save_profile(name: str, profile_id: str | None = None) -> dict:
    with _lock:
        profiles = list_profiles()
        snap = get_settings()
        if profile_id:
            for p in profiles:
                if p["id"] == profile_id:
                    p["settings"], p["updated"] = snap, time.time()
                    _write(DATA / "profiles.json", profiles)
                    return p
            raise KeyError(profile_id)
        p = {"id": uuid.uuid4().hex[:10], "name": name, "settings": snap, "updated": time.time()}
        profiles.append(p)
        _write(DATA / "profiles.json", profiles)
        return p


def apply_profile(profile_id: str) -> dict:
    with _lock:
        for p in list_profiles():
            if p["id"] == profile_id:
                settings = deep_merge(DEFAULT_SETTINGS, p["settings"])
                _write(DATA / "settings.json", settings)
                _write(DATA / "active_profile.json", {"id": profile_id})
                return settings
        raise KeyError(profile_id)


def active_profile_id() -> str:
    return _read(DATA / "active_profile.json", {}).get("id", "")


def delete_profile(profile_id: str) -> None:
    with _lock:
        _write(DATA / "profiles.json", [p for p in list_profiles() if p["id"] != profile_id])


# ---------- library (visual styles + characters) ----------
def get_library() -> dict:
    lib = _read(DATA / "library.json", {"styles": [], "characters": []})
    lib["styles"] = BASE_STYLES + [s for s in lib["styles"] if not s.get("builtin")]
    return lib


def upsert_library_item(kind: str, item: dict) -> dict:
    assert kind in ("styles", "characters")
    with _lock:
        lib = _read(DATA / "library.json", {"styles": [], "characters": []})
        items = lib[kind]
        if not item.get("id"):
            item["id"] = uuid.uuid4().hex[:10]
            items.append(item)
        else:
            for i, existing in enumerate(items):
                if existing["id"] == item["id"]:
                    items[i] = item
                    break
            else:
                items.append(item)
        _write(DATA / "library.json", lib)
        return item


def delete_library_item(kind: str, item_id: str) -> None:
    with _lock:
        lib = _read(DATA / "library.json", {"styles": [], "characters": []})
        lib[kind] = [x for x in lib[kind] if x["id"] != item_id]
        _write(DATA / "library.json", lib)


def find_style(style_id: str) -> dict | None:
    return next((s for s in get_library()["styles"] if s["id"] == style_id), None)


# ---------- projects ----------
def project_dir(pid: str) -> Path:
    if not pid.isalnum():
        raise ValueError("invalid project id")
    return PROJECTS / pid


def create_project(title: str, brief: str) -> dict:
    pid = uuid.uuid4().hex[:12]
    proj = {
        "id": pid,
        "title": title.strip() or "Untitled",
        "brief": brief.strip(),
        "created": time.time(),
        "updated": time.time(),
        "stage": "script",
        "script": "",
        "scenes": [],
        "settings": get_settings(),
        "profile_id": active_profile_id(),
        "costs": [],
        "job": None,
        "output": "",
        "srt": "",
        "metadata": None,
    }
    save_project(proj)
    return proj


def get_project(pid: str) -> dict:
    path = project_dir(pid) / "project.json"
    if not path.exists():
        raise KeyError(pid)
    return _read(path, {})


def save_project(proj: dict) -> dict:
    with _lock:
        proj["updated"] = time.time()
        _write(project_dir(proj["id"]) / "project.json", proj)
        return proj


def update_project(pid: str, fn) -> dict:
    """Atomic read-modify-write."""
    with _lock:
        proj = get_project(pid)
        fn(proj)
        return save_project(proj)


def list_projects() -> list[dict]:
    if not PROJECTS.exists():
        return []
    out = []
    for d in PROJECTS.iterdir():
        f = d / "project.json"
        if f.exists():
            p = _read(f, {})
            out.append({
                "id": p["id"], "title": p["title"], "stage": p["stage"], "updated": p["updated"],
                "scenes": len(p.get("scenes", [])), "cost": round(sum(c["usd"] for c in p.get("costs", [])), 4),
                "output": p.get("output", ""),
            })
    return sorted(out, key=lambda x: -x["updated"])


def delete_project(pid: str) -> None:
    import shutil
    shutil.rmtree(project_dir(pid), ignore_errors=True)
