"""Image generation (OpenAI), voice-over (Fish Audio / ElevenLabs), image-to-video (fal.ai), demo stand-ins."""
from __future__ import annotations

import base64
import hashlib
import re
import subprocess
import textwrap
import time
from pathlib import Path

import httpx

from . import store
from .llm import ProviderError

IMAGE_SIZES = {"16:9": "1536x1024", "9:16": "1024x1536", "1:1": "1024x1024"}
FRAME = {"16:9": (1920, 1080), "9:16": (1080, 1920), "1:1": (1080, 1080)}
EMOTION_TAG = re.compile(r"\((?:[a-zA-Z ]{2,25})\)\s*")


# ---------------- images ----------------
def generate_image(prompt: str, out: Path, settings: dict) -> dict:
    v = settings["visual"]
    if settings.get("demo_mode"):
        _demo_image(prompt, out, v["aspect"])
        return {"kind": "image", "provider": "demo", "usd": 0.0}
    key = store.get_keys()["openai"]
    if not key:
        raise ProviderError("OpenAI API açarı daxil edilməyib")
    body = {"model": v["image_model"], "prompt": prompt[:30000], "n": 1,
            "size": IMAGE_SIZES[v["aspect"]], "quality": v["quality"]}
    last = None
    for attempt in range(3):
        try:
            r = httpx.post("https://api.openai.com/v1/images/generations", json=body, timeout=300,
                           headers={"Authorization": f"Bearer {key}"})
        except httpx.HTTPError as e:
            last = f"bağlantı xətası: {e}"
            time.sleep(3 * (attempt + 1))
            continue
        if r.status_code == 429 or r.status_code >= 500:
            last = f"{r.status_code}: {r.text[:200]}"
            time.sleep(5 * (attempt + 1))
            continue
        if r.status_code >= 400:
            raise ProviderError(f"OpenAI image xətası {r.status_code}: {r.text[:300]}")
        item = r.json()["data"][0]
        if item.get("b64_json"):
            out.write_bytes(base64.b64decode(item["b64_json"]))
        else:
            out.write_bytes(httpx.get(item["url"], timeout=120).content)
        usd = settings["costs"].get(f"image_{v['quality']}", 0.0)
        return {"kind": "image", "provider": "openai", "usd": usd}
    raise ProviderError(f"OpenAI image alınmadı ({last})")


def _demo_image(text: str, out: Path, aspect: str) -> None:
    from PIL import Image, ImageDraw, ImageFont

    w, h = {"16:9": (1536, 1024), "9:16": (1024, 1536), "1:1": (1024, 1024)}[aspect]
    hsh = hashlib.md5(text.encode()).digest()
    c1, c2 = tuple(hsh[:3]), tuple(hsh[3:6])
    img = Image.new("RGB", (w, h))
    px = ImageDraw.Draw(img)
    for y in range(h):
        t = y / h
        px.line([(0, y), (w, y)], fill=tuple(int(c1[i] * (1 - t) + c2[i] * t) for i in range(3)))
    for i in range(6):
        r = 60 + hsh[6 + i] % 160
        x, y = hsh[i] * w // 255, hsh[i + 6] * h // 255
        px.ellipse([x - r, y - r, x + r, y + r], outline=(255, 255, 255), width=4)
    try:
        font = ImageFont.truetype("DejaVuSans-Bold.ttf", 44)
    except OSError:
        font = ImageFont.load_default()
    lines = textwrap.wrap(text, 40)[:6]
    y = h // 2 - len(lines) * 30
    for line in lines:
        px.text((w // 2, y), line, fill=(255, 255, 255), font=font, anchor="mm", stroke_width=3,
                stroke_fill=(0, 0, 0))
        y += 60
    img.save(out, "PNG")


# ---------------- voice-over ----------------
def synthesize(text: str, out: Path, settings: dict) -> dict:
    vs = settings["voice"]
    if settings.get("demo_mode"):
        seconds = max(1.5, len(EMOTION_TAG.sub("", text)) / 15 / float(vs.get("speed") or 1))
        _run(["ffmpeg", "-y", "-f", "lavfi", "-i", f"sine=frequency=220:duration={seconds:.2f}",
              "-af", "volume=0.05", "-ar", "44100", "-ac", "2", "-b:a", "128k", str(out)])
        return {"kind": "tts", "provider": "demo", "usd": 0.0}
    keys = store.get_keys()
    if not vs.get("voice_id"):
        raise ProviderError("Səs seçilməyib (Ayarlar → Səsləndirmə → Voice ID)")
    if vs["provider"] == "fish":
        if not keys["fish"]:
            raise ProviderError("Fish Audio API açarı daxil edilməyib")
        r = _post_retry("https://api.fish.audio/v1/tts",
                        headers={"Authorization": f"Bearer {keys['fish']}", "model": vs.get("fish_model", "s1")},
                        json={"text": text, "reference_id": vs["voice_id"], "format": "mp3",
                              "prosody": {"speed": float(vs.get("speed", 1.0))}})
    elif vs["provider"] == "elevenlabs":
        if not keys["elevenlabs"]:
            raise ProviderError("ElevenLabs API açarı daxil edilməyib")
        clean = EMOTION_TAG.sub("", text)  # ElevenLabs reads (tags) aloud
        r = _post_retry(f"https://api.elevenlabs.io/v1/text-to-speech/{vs['voice_id']}",
                        headers={"xi-api-key": keys["elevenlabs"]},
                        json={"text": clean, "model_id": "eleven_multilingual_v2",
                              "voice_settings": {"stability": 0.45, "similarity_boost": 0.8,
                                                 "speed": max(0.7, min(1.2, float(vs.get("speed", 1.0))))}})
    else:
        raise ProviderError(f"Naməlum səs provayderi: {vs['provider']}")
    out.write_bytes(r.content)
    usd = len(text) * settings["costs"]["tts_per_million_chars"] / 1e6
    return {"kind": "tts", "provider": vs["provider"], "usd": usd}


def _post_retry(url, **kw) -> httpx.Response:
    last = ""
    for attempt in range(3):
        try:
            r = httpx.post(url, timeout=300, **kw)
        except httpx.HTTPError as e:
            last = str(e)
            time.sleep(3 * (attempt + 1))
            continue
        if r.status_code == 429 or r.status_code >= 500:
            last = f"{r.status_code}: {r.text[:200]}"
            time.sleep(5 * (attempt + 1))
            continue
        if r.status_code >= 400:
            raise ProviderError(f"{url.split('/')[2]} xətası {r.status_code}: {r.text[:300]}")
        return r
    raise ProviderError(f"{url.split('/')[2]} cavab vermədi ({last})")


# ---------------- image-to-video ----------------
def animate(image: Path, prompt: str, out: Path, settings: dict, should_stop=lambda: False) -> dict:
    m = settings["motion"]
    if settings.get("demo_mode"):
        w, h = FRAME[settings["visual"]["aspect"]]
        _run(["ffmpeg", "-y", "-loop", "1", "-i", str(image), "-t", str(m["clip_seconds"]),
              "-vf", f"scale={w * 2}:{h * 2}:force_original_aspect_ratio=increase,crop={w * 2}:{h * 2},"
                     f"zoompan=z='1+0.002*on':x='iw/2-(iw/zoom/2)+on':y='ih/2-(ih/zoom/2)':d=1:s={w}x{h}:fps=30",
              "-c:v", "libx264", "-pix_fmt", "yuv420p", str(out)])
        return {"kind": "animate", "provider": "demo", "usd": 0.0}
    if m.get("animate_provider") == "kie":
        return _animate_kie(image, prompt, out, settings, should_stop)
    key = store.get_keys()["fal"]
    if not key:
        raise ProviderError("fal.ai API açarı daxil edilməyib")
    data_uri = "data:image/png;base64," + base64.b64encode(image.read_bytes()).decode()
    headers = {"Authorization": f"Key {key}"}
    r = httpx.post(f"https://queue.fal.run/{m['fal_model']}", headers=headers, timeout=120,
                   json={"prompt": prompt, "image_url": data_uri, "duration": str(m["clip_seconds"])})
    if r.status_code >= 400:
        raise ProviderError(f"fal.ai xətası {r.status_code}: {r.text[:300]}")
    job = r.json()
    deadline = time.time() + 900
    while time.time() < deadline:
        if should_stop():
            raise ProviderError("Dayandırıldı")
        time.sleep(5)
        st = httpx.get(job["status_url"], headers=headers, timeout=60).json()
        if st.get("status") == "COMPLETED":
            res = httpx.get(job["response_url"], headers=headers, timeout=60).json()
            url = (res.get("video") or {}).get("url")
            if not url:
                raise ProviderError(f"fal.ai nəticəsində video yoxdur: {str(res)[:200]}")
            out.write_bytes(httpx.get(url, timeout=300).content)
            return {"kind": "animate", "provider": "fal", "usd": settings["costs"]["animate_per_clip"]}
        if st.get("status") in ("FAILED", "ERROR"):
            raise ProviderError(f"fal.ai tapşırığı uğursuz oldu: {st}")
    raise ProviderError("fal.ai 15 dəqiqə ərzində cavab vermədi")


# ---------------- Kie.ai (market jobs API) ----------------
# Verified against docs.kie.ai: market/quickstart, market/common/get-task-detail,
# file-upload-api/quickstart and each model page below.
KIE_API = "https://api.kie.ai/api/v1"
KIE_UPLOAD = "https://kieai.redpandaai.co/api/file-stream-upload"

# model id -> how its "input" object is built (field names/types from each model page)
KIE_MODELS = {
    "bytedance/seedance-2": {"label": "Seedance 2.0", "image": "first_frame_url", "dur": "int", "range": (4, 15),
                             "extra": {"resolution": "720p", "generate_audio": False}, "aspect": True},
    "bytedance/seedance-2-fast": {"label": "Seedance 2.0 Fast", "image": "first_frame_url", "dur": "int",
                                  "range": (4, 15), "extra": {"generate_audio": False}, "aspect": True},
    "bytedance/v1-pro-image-to-video": {"label": "Bytedance V1 Pro", "image": "image_url", "dur": "str",
                                        "choices": (5, 10), "extra": {"resolution": "720p"}},
    "bytedance/v1-lite-image-to-video": {"label": "Bytedance V1 Lite", "image": "image_url", "dur": "str",
                                         "choices": (5, 10), "extra": {"resolution": "720p"}},
    "kling-2.6/image-to-video": {"label": "Kling 2.6", "image": "image_urls", "dur": "str", "choices": (5, 10),
                                 "extra": {"sound": False}},
    "hailuo/2-3-image-to-video-standard": {"label": "Hailuo 2.3 Standard", "image": "image_url", "dur": "str",
                                           "choices": (6, 10), "extra": {"resolution": "768P"}},
    "wan/2-6-image-to-video": {"label": "Wan 2.6", "image": "image_urls", "dur": "str", "choices": (5, 10, 15),
                               "extra": {"resolution": "720p"}},
}


def kie_input(model: str, prompt: str, image_url: str, seconds: float, aspect: str,
              custom_field: str = "image_url", extra_json: str = "") -> dict:
    import json as _json

    spec = KIE_MODELS.get(model)
    if spec:
        if spec["dur"] == "int":
            lo, hi = spec["range"]
            duration = int(max(lo, min(hi, round(seconds))))
        else:
            duration = str(min(spec["choices"], key=lambda c: abs(c - seconds)))
        field = spec["image"]
        inp = {"prompt": prompt, **spec["extra"], "duration": duration}
        if spec.get("aspect"):
            inp["aspect_ratio"] = aspect
    else:  # any other Market model: user supplies the image field name and extra params
        field = (custom_field or "image_url").strip()
        inp = {"prompt": prompt, "duration": str(int(round(seconds)))}
    inp[field] = [image_url] if field.endswith("urls") else image_url
    if extra_json.strip():
        try:
            inp.update(_json.loads(extra_json))
        except ValueError:
            raise ProviderError("Ayarlar → Hərəkət → 'Kie əlavə parametrlər' düzgün JSON deyil")
    return inp


def _kie_json(r: httpx.Response, what: str) -> dict:
    try:
        data = r.json()
    except ValueError:
        raise ProviderError(f"Kie.ai {what}: JSON olmayan cavab ({r.status_code}) {r.text[:200]}")
    # Kie returns HTTP 200 with its own "code" field; anything but 200 is an error
    if r.status_code >= 400 or data.get("code") != 200:
        raise ProviderError(f"Kie.ai {what} xətası {data.get('code', r.status_code)}: {data.get('msg') or r.text[:200]}")
    return data.get("data") or {}


def kie_upload(image: Path, key: str) -> str:
    """Kie models take a public image URL, so the local frame is uploaded first (stream upload: best for 1-10 MB)."""
    with image.open("rb") as f:
        r = httpx.post(KIE_UPLOAD, headers={"Authorization": f"Bearer {key}"}, timeout=180,
                       files={"file": (image.name, f, "image/png")},
                       data={"uploadPath": "youtube-ai-agent", "fileName": image.name})
    url = _kie_json(r, "şəkil yükləmə").get("downloadUrl")
    if not url:
        raise ProviderError("Kie.ai yükləmə cavabında downloadUrl yoxdur")
    return url


def _animate_kie(image: Path, prompt: str, out: Path, settings: dict, should_stop) -> dict:
    import json as _json

    m = settings["motion"]
    key = store.get_keys()["kie"]
    if not key:
        raise ProviderError("Kie.ai API açarı daxil edilməyib")
    headers = {"Authorization": f"Bearer {key}"}
    image_url = kie_upload(image, key)
    inp = kie_input(m["kie_model"].strip(), prompt, image_url, float(m["clip_seconds"]),
                    settings["visual"]["aspect"], m.get("kie_image_field", ""), m.get("kie_extra", ""))
    r = httpx.post(f"{KIE_API}/jobs/createTask", headers=headers, timeout=60,
                   json={"model": m["kie_model"].strip(), "input": inp})
    task_id = _kie_json(r, "tapşırıq yaratma").get("taskId")
    if not task_id:
        raise ProviderError("Kie.ai taskId qaytarmadı")
    deadline = time.time() + 900
    while time.time() < deadline:
        if should_stop():
            raise ProviderError("Dayandırıldı")
        time.sleep(6)
        info = _kie_json(httpx.get(f"{KIE_API}/jobs/recordInfo", params={"taskId": task_id},
                                   headers=headers, timeout=60), "status")
        state = info.get("state")  # waiting / queuing / generating / success / fail
        if state == "success":
            res = info.get("resultJson") or "{}"
            res = _json.loads(res) if isinstance(res, str) else res
            urls = res.get("resultUrls") or []
            if not urls:
                raise ProviderError(f"Kie.ai nəticəsində video yoxdur: {str(res)[:200]}")
            out.write_bytes(httpx.get(urls[0], timeout=300, follow_redirects=True).content)
            return {"kind": "animate", "provider": "kie", "usd": settings["costs"]["animate_per_clip"]}
        if state == "fail":
            raise ProviderError(f"Kie.ai tapşırığı uğursuz oldu: {info.get('failMsg') or info.get('failCode')}")
    raise ProviderError("Kie.ai 15 dəqiqə ərzində cavab vermədi")


# ---------------- helpers ----------------
def _run(cmd: list[str]) -> str:
    p = subprocess.run(cmd, capture_output=True, text=True)
    if p.returncode != 0:
        raise RuntimeError(f"ffmpeg xətası: {p.stderr[-800:]}")
    return p.stdout


def media_duration(path: Path) -> float:
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of",
                          "default=nw=1:nk=1", str(path)], capture_output=True, text=True).stdout.strip()
    return float(out or 0)
