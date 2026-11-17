"""Text-to-speech provider adapters with word-level timing.

- ``ElevenLabsTTS``: ``POST /v1/text-to-speech/{voice_id}/with-timestamps`` returns base64 audio plus
  character alignment, converted here to word timings (used for burned-in subtitles).
- ``FakeTTS``: a quiet sine tone with evenly spaced word timings, for tests and dry runs.
"""
from __future__ import annotations

import base64
import subprocess
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Protocol

import requests

from core.tools import NonRetryable

ELEVEN_URL = "https://api.elevenlabs.io/v1/text-to-speech/{voice_id}/with-timestamps"


@dataclass
class TTSResult:
    audio_path: Path
    duration_s: float
    words: list[dict[str, Any]] = field(default_factory=list)
    characters: int = 0


class TTSProvider(Protocol):
    name: str

    def synthesize(self, text: str, *, voice_id: str, speed: float, out_path: Path) -> TTSResult: ...


def alignment_to_words(alignment: dict[str, list]) -> list[dict[str, Any]]:
    chars = alignment["characters"]
    starts = alignment["character_start_times_seconds"]
    ends = alignment["character_end_times_seconds"]
    words, cur, w_start, w_end = [], "", None, None
    for ch, s, e in zip(chars, starts, ends):
        if ch.isspace():
            if cur:
                words.append({"word": cur, "start": round(w_start, 3), "end": round(w_end, 3)})
            cur, w_start = "", None
            continue
        if not cur:
            w_start = s
        cur += ch
        w_end = e
    if cur:
        words.append({"word": cur, "start": round(w_start, 3), "end": round(w_end, 3)})
    return words


def probe_duration(path: Path) -> float:
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
                         capture_output=True, text=True, check=True).stdout.strip()
    return float(out)


class ElevenLabsTTS:
    name = "elevenlabs"

    def __init__(self, api_key: str, model_id: str = "eleven_multilingual_v2", timeout: float = 120.0):
        self._key, self.model_id, self.timeout = api_key, model_id, timeout

    def __repr__(self) -> str:
        return f"ElevenLabsTTS(model_id={self.model_id!r})"

    def synthesize(self, text: str, *, voice_id: str, speed: float, out_path: Path) -> TTSResult:
        res = requests.post(ELEVEN_URL.format(voice_id=voice_id), headers={"xi-api-key": self._key},
                            json={"text": text, "model_id": self.model_id, "voice_settings": {"speed": speed}},
                            timeout=self.timeout)
        if res.status_code in (401, 403, 404, 422):
            raise NonRetryable(f"elevenlabs: HTTP {res.status_code}")
        res.raise_for_status()
        body = res.json()
        out_path = Path(out_path)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_bytes(base64.b64decode(body["audio_base64"]))
        words = alignment_to_words(body.get("alignment") or {"characters": [], "character_start_times_seconds": [],
                                                              "character_end_times_seconds": []})
        duration = probe_duration(out_path)
        return TTSResult(audio_path=out_path, duration_s=duration, words=words, characters=len(text))


class FakeTTS:
    name = "fake"
    SECONDS_PER_WORD = 0.35

    def synthesize(self, text: str, *, voice_id: str, speed: float, out_path: Path) -> TTSResult:
        tokens = text.split()
        step = self.SECONDS_PER_WORD / max(speed, 0.1)
        duration = round(max(1.0, len(tokens) * step), 3)
        out_path = Path(out_path)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-f", "lavfi", "-i", f"sine=f=220:d={duration}",
                        "-af", "volume=0.3", "-ar", "44100", "-ac", "1", str(out_path)], check=True)
        words = [{"word": w, "start": round(i * step, 3), "end": round(min(duration, (i + 1) * step), 3)}
                 for i, w in enumerate(tokens)]
        if words:
            words[-1]["end"] = duration
        return TTSResult(audio_path=out_path, duration_s=duration, words=words, characters=len(text))
