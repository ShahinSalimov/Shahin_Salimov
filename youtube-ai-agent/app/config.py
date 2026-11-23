"""Paths, settings and API keys (local JSON files)."""
from __future__ import annotations

import copy
import json
import os
import threading
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = Path(os.environ.get("YTA_DATA_DIR", ROOT / "data"))
OUTPUT = Path(os.environ.get("YTA_OUTPUT_DIR", ROOT / "output"))
FAKE = os.environ.get("YTA_FAKE") == "1"  # tests only: fake providers and YouTube
_lock = threading.RLock()

DEFAULT_SETTINGS = {
    "voice_id": "",
    "fish_model": "s2.1-pro-free",
    "voice_speed": 1.0,
    "language": "English",
    "category_id": "2",          # Autos & Vehicles
    "max_animated": 4,
    "budget_cap": 6.0,
    "image_quality": "low",
}
KEY_NAMES = ("deepseek", "openai", "fish", "kie")

# Estimated prices in USD (used for the budget check and the cost shown per job).
PRICES = {
    "image": {"low": 0.016, "medium": 0.063, "high": 0.25},
    "thumbnail": 0.063,               # one medium-quality image
    "deepseek_in_per_m": 0.28,
    "deepseek_out_per_m": 0.42,
    "tts_per_million_chars": 15.0,    # 0 while the free Fish model is used
    "animate_per_clip": 0.5,
}


def _read(path: Path, default):
    if not path.exists():
        return copy.deepcopy(default)
    with path.open(encoding="utf-8") as f:
        return json.load(f)


def write_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    with tmp.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    os.replace(tmp, path)


def read_json(path: Path, default):
    return _read(path, default)


def get_settings() -> dict:
    with _lock:
        stored = _read(DATA / "settings.json", {})
        return {**DEFAULT_SETTINGS, **{k: v for k, v in stored.items() if k in DEFAULT_SETTINGS}}


def save_settings(patch: dict) -> dict:
    with _lock:
        s = get_settings()
        for k, v in patch.items():
            if k in DEFAULT_SETTINGS:
                s[k] = type(DEFAULT_SETTINGS[k])(v)
        write_json(DATA / "settings.json", s)
        return s


def get_keys() -> dict:
    with _lock:
        stored = _read(DATA / "keys.json", {})
        return {k: stored.get(k, "") for k in KEY_NAMES}


def save_keys(patch: dict) -> None:
    with _lock:
        stored = _read(DATA / "keys.json", {})  # keep any v1 keys we no longer use
        for k, v in patch.items():
            if k in KEY_NAMES and v is not None and not str(v).startswith("•"):
                stored[k] = str(v).strip()
        write_json(DATA / "keys.json", stored)


def masked_keys() -> dict:
    return {k: ("•" * 8 + v[-4:] if v else "") for k, v in get_keys().items()}
