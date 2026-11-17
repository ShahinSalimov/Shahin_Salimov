"""Image generation provider adapters (scene backgrounds and thumbnails).

- ``OpenAIImageGen``: ``POST /v1/images/generations`` with ``gpt-image-1`` (base64 output). The
  closest supported size is requested; render.py crops/scales to the exact output size.
- ``FakeImageGen``: a solid colour derived from the prompt (ffmpeg), for tests and dry runs.

AI video and stock b-roll providers are not integrated yet: such scenes fall back to an AI image with
Ken Burns motion, and the render report lists those fallbacks.
"""
from __future__ import annotations

import base64
import hashlib
import subprocess
from pathlib import Path
from typing import Protocol

import requests

from core.tools import NonRetryable

OPENAI_URL = "https://api.openai.com/v1/images/generations"


class ImageGen(Protocol):
    name: str
    is_ai: bool

    def generate(self, prompt: str, width: int, height: int, out_path: Path) -> Path: ...


def pick_openai_size(width: int, height: int) -> str:
    ratio = width / height
    if ratio < 0.85:
        return "1024x1536"
    if ratio > 1.15:
        return "1536x1024"
    return "1024x1024"


class OpenAIImageGen:
    name = "openai_images"
    is_ai = True

    def __init__(self, api_key: str, model: str = "gpt-image-1", timeout: float = 180.0):
        self._key, self.model, self.timeout = api_key, model, timeout

    def __repr__(self) -> str:
        return f"OpenAIImageGen(model={self.model!r})"

    def generate(self, prompt: str, width: int, height: int, out_path: Path) -> Path:
        res = requests.post(OPENAI_URL, headers={"Authorization": f"Bearer {self._key}"},
                            json={"model": self.model, "prompt": prompt, "size": pick_openai_size(width, height),
                                  "n": 1}, timeout=self.timeout)
        if res.status_code in (400, 401, 403):
            raise NonRetryable(f"openai images: HTTP {res.status_code}")
        res.raise_for_status()
        out_path = Path(out_path)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_bytes(base64.b64decode(res.json()["data"][0]["b64_json"]))
        return out_path


class FakeImageGen:
    name = "fake"
    is_ai = False

    def generate(self, prompt: str, width: int, height: int, out_path: Path) -> Path:
        digest = hashlib.sha256(prompt.encode()).digest()
        color = "0x" + "".join(f"{64 + b % 160:02x}" for b in digest[:3])   # never too dark for QC
        out_path = Path(out_path)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-f", "lavfi", "-i",
                        f"color=c={color}:s={width}x{height}:d=1",
                        "-vf", "drawgrid=w=iw/6:h=ih/10:t=2:c=white@0.25", "-frames:v", "1", str(out_path)],
                       check=True)
        return out_path
