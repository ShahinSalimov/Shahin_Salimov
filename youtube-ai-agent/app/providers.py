"""External AI services. Each call returns its estimated cost in USD.

DeepSeek (planning/metadata), OpenAI gpt-image-1 (frames), Fish Audio (voice),
Kie.ai Seedance 2 (optional image-to-video). With YTA_FAKE=1 every call is
replaced by a local stand-in so the whole pipeline can be tested offline.
"""
from __future__ import annotations

import base64
import hashlib
import json
import subprocess
import textwrap
import time
from pathlib import Path

import httpx

from . import config

IMAGE_SIZE = {False: "1536x1024", True: "1024x1536"}


class ProviderError(RuntimeError):
    pass


# ---------------- helpers ----------------
def _post(url: str, what: str, **kw) -> httpx.Response:
    last = ""
    for attempt in range(3):
        try:
            r = httpx.post(url, timeout=kw.pop("timeout", 300), **kw)
        except httpx.HTTPError as e:
            last = str(e)
            time.sleep(3 * (attempt + 1))
            continue
        if r.status_code == 429 or r.status_code >= 500:
            last = f"{r.status_code}: {r.text[:200]}"
            time.sleep(5 * (attempt + 1))
            continue
        if r.status_code in (401, 403):
            raise ProviderError(f"{what}: API açarı qəbul edilmədi ({r.status_code})")
        if r.status_code >= 400:
            raise ProviderError(f"{what} xətası {r.status_code}: {r.text[:300]}")
        return r
    raise ProviderError(f"{what} cavab vermədi ({last})")


def _key(name: str, label: str) -> str:
    key = config.get_keys()[name]
    if not key:
        raise ProviderError(f"{label} API açarı daxil edilməyib (Ayarlar)")
    return key


def _ffmpeg(args: list[str]) -> None:
    p = subprocess.run(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", *args],
                       capture_output=True, text=True)
    if p.returncode != 0:
        raise ProviderError(f"ffmpeg: {p.stderr[-500:]}")


def media_duration(path: Path) -> float:
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                          "-of", "default=nw=1:nk=1", str(path)], capture_output=True, text=True).stdout
    return float(out.strip() or 0)


# ---------------- DeepSeek ----------------
def deepseek_json(system: str, user: str) -> tuple[dict, float]:
    if config.FAKE:
        return _fake_json(user), 0.0
    key = _key("deepseek", "DeepSeek")
    r = _post("https://api.deepseek.com/chat/completions", "DeepSeek", timeout=600,
              headers={"Authorization": f"Bearer {key}"},
              json={"model": "deepseek-chat", "temperature": 0.9, "max_tokens": 8000,
                    "response_format": {"type": "json_object"},
                    "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}]})
    data = r.json()
    text = data["choices"][0]["message"].get("content") or "{}"
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        parsed = {}
    u = data.get("usage", {})
    cost = (u.get("prompt_tokens", 0) * config.PRICES["deepseek_in_per_m"]
            + u.get("completion_tokens", 0) * config.PRICES["deepseek_out_per_m"]) / 1e6
    return parsed, cost


def _fake_json(user: str) -> dict:
    """Deterministic plan answer for tests: visuals for every scene id it finds."""
    ids = [line.split(":", 1)[0].strip() for line in user.splitlines() if line[:1] == "s" and ":" in line]
    return {
        "scenes": [{"id": i, "visual": f"cinematic shot for {i}"} for i in ids],
        "dramatic": ids[2:4],
        "short_start": ids[0] if ids else None,
        "long_meta": {"title": "Fake title", "description": "Fake description", "tags": ["cars", "crash"]},
        "short_meta": {"title": "Fake short", "description": "Fake", "tags": ["shorts"]},
        "thumb_text": "SPLIT IN TWO",
        "thumb_prompt": "a red supercar on a coastal road at sunrise",
    }


# ---------------- OpenAI images ----------------
def image(prompt: str, out: Path, portrait: bool = False, quality: str | None = None) -> float:
    quality = quality or config.get_settings()["image_quality"]
    if config.FAKE:
        _fake_image(prompt, out, portrait)
        return config.PRICES["image"][quality]
    key = _key("openai", "OpenAI")
    r = _post("https://api.openai.com/v1/images/generations", "OpenAI", timeout=300,
              headers={"Authorization": f"Bearer {key}"},
              json={"model": "gpt-image-1", "prompt": prompt[:30000], "n": 1,
                    "size": IMAGE_SIZE[portrait], "quality": quality})
    item = r.json()["data"][0]
    if item.get("b64_json"):
        out.write_bytes(base64.b64decode(item["b64_json"]))
    else:
        out.write_bytes(httpx.get(item["url"], timeout=120).content)
    return config.PRICES["image"][quality]


def _fake_image(text: str, out: Path, portrait: bool) -> None:
    from PIL import Image, ImageDraw

    w, h = (1024, 1536) if portrait else (1536, 1024)
    hsh = hashlib.md5(text.encode()).digest()
    img = Image.new("RGB", (w, h), tuple(hsh[:3]))
    d = ImageDraw.Draw(img)
    for i in range(8):
        r = 40 + hsh[i] % 200
        x, y = hsh[i + 3] * w // 255, hsh[i + 6] * h // 255
        d.ellipse([x - r, y - r, x + r, y + r], outline=(255, 255, 255), width=6)
    d.multiline_text((40, 40), "\n".join(textwrap.wrap(text, 30)[:4]), fill=(255, 255, 255))
    img.save(out, "PNG")


# ---------------- Fish Audio ----------------
def tts(text: str, out: Path, voice_id: str = "") -> float:
    s = config.get_settings()
    if config.FAKE:
        seconds = max(1.0, len(text) / 15)
        _ffmpeg(["-f", "lavfi", "-i", f"sine=frequency=220:duration={seconds:.2f}", "-af", "volume=0.05",
                 "-ar", "44100", "-ac", "2", "-b:a", "128k", str(out)])
        return 0.0
    key = _key("fish", "Fish Audio")
    if not voice_id:
        raise ProviderError("Kanalın səsi seçilməyib (Ayarlar → Kanallar → Voice ID)")
    r = _post("https://api.fish.audio/v1/tts", "Fish Audio", timeout=300,
              headers={"Authorization": f"Bearer {key}", "model": s["fish_model"]},
              json={"text": text, "reference_id": voice_id, "format": "mp3",
                    "prosody": {"speed": float(s["voice_speed"])}})
    out.write_bytes(r.content)
    free = "free" in s["fish_model"]
    return 0.0 if free else len(text) * config.PRICES["tts_per_million_chars"] / 1e6


# ---------------- Kie.ai (optional) ----------------
# Verified against docs.kie.ai: jobs/createTask, jobs/recordInfo, file-stream-upload, Seedance 2 page.
KIE_API = "https://api.kie.ai/api/v1"
KIE_UPLOAD = "https://kieai.redpandaai.co/api/file-stream-upload"
KIE_MODEL = "bytedance/seedance-2"


def kie_enabled() -> bool:
    return config.FAKE or bool(config.get_keys()["kie"])


def kie_input(prompt: str, image_url: str, seconds: int, portrait: bool) -> dict:
    return {"prompt": prompt, "first_frame_url": image_url, "duration": int(max(4, min(15, seconds))),
            "resolution": "720p", "aspect_ratio": "9:16" if portrait else "16:9", "generate_audio": False}


def _kie_data(r: httpx.Response, what: str) -> dict:
    try:
        data = r.json()
    except ValueError:
        raise ProviderError(f"Kie.ai {what}: gözlənilməz cavab {r.text[:200]}")
    if data.get("code") != 200:
        raise ProviderError(f"Kie.ai {what} xətası {data.get('code')}: {data.get('msg')}")
    return data.get("data") or {}


def animate(image_path: Path, prompt: str, out: Path, portrait: bool = False, should_stop=lambda: False) -> float:
    if config.FAKE:
        w, h = (720, 1280) if portrait else (1280, 720)
        _ffmpeg(["-loop", "1", "-i", str(image_path), "-t", "5",
                 "-vf", f"scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h},"
                        f"zoompan=z='1+0.003*on':d=1:s={w}x{h}:fps=30",
                 "-c:v", "libx264", "-pix_fmt", "yuv420p", str(out)])
        return config.PRICES["animate_per_clip"]
    key = _key("kie", "Kie.ai")
    headers = {"Authorization": f"Bearer {key}"}
    with image_path.open("rb") as f:
        up = httpx.post(KIE_UPLOAD, headers=headers, timeout=180, files={"file": (image_path.name, f, "image/png")},
                        data={"uploadPath": "youtube-agent", "fileName": image_path.name})
    url = _kie_data(up, "şəkil yükləmə").get("downloadUrl")
    if not url:
        raise ProviderError("Kie.ai şəkil linki qaytarmadı")
    task = _kie_data(httpx.post(f"{KIE_API}/jobs/createTask", headers=headers, timeout=60,
                                json={"model": KIE_MODEL, "input": kie_input(prompt, url, 5, portrait)}),
                     "tapşırıq").get("taskId")
    deadline = time.time() + 900
    while time.time() < deadline:
        if should_stop():
            raise ProviderError("Dayandırıldı")
        time.sleep(6)
        info = _kie_data(httpx.get(f"{KIE_API}/jobs/recordInfo", params={"taskId": task},
                                   headers=headers, timeout=60), "status")
        if info.get("state") == "success":
            res = info.get("resultJson") or "{}"
            urls = (json.loads(res) if isinstance(res, str) else res).get("resultUrls") or []
            if not urls:
                raise ProviderError("Kie.ai nəticəsində video yoxdur")
            out.write_bytes(httpx.get(urls[0], timeout=300, follow_redirects=True).content)
            return config.PRICES["animate_per_clip"]
        if info.get("state") == "fail":
            raise ProviderError(f"Kie.ai: {info.get('failMsg') or info.get('failCode')}")
    raise ProviderError("Kie.ai 15 dəqiqədə cavab vermədi")


# ---------------- connection tests ----------------
def test_key(name: str) -> str:
    key = config.get_keys().get(name, "")
    if not key:
        raise ProviderError("Açar boşdur")
    checks = {
        "deepseek": ("https://api.deepseek.com/models", {"Authorization": f"Bearer {key}"}),
        "openai": ("https://api.openai.com/v1/models", {"Authorization": f"Bearer {key}"}),
        "fish": ("https://api.fish.audio/model?page_size=1", {"Authorization": f"Bearer {key}"}),
        "kie": (f"{KIE_API}/chat/credit", {"Authorization": f"Bearer {key}"}),
    }
    url, headers = checks[name]
    try:
        r = httpx.get(url, headers=headers, timeout=30)
    except httpx.HTTPError as e:
        raise ProviderError(f"Bağlantı xətası: {e}")
    if r.status_code in (401, 403):
        raise ProviderError(f"Açar qəbul edilmədi ({r.status_code})")
    if r.status_code >= 400:
        raise ProviderError(f"Xəta {r.status_code}")
    if name == "kie":
        body = r.json()
        if body.get("code") != 200:
            raise ProviderError(f"Açar qəbul edilmədi ({body.get('msg')})")
        return f"Bağlantı uğurludur · balans: {body.get('data')} kredit"
    return "Bağlantı uğurludur"
