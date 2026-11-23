"""Persistent job queue. One worker runs jobs in order; every step is idempotent and saved,
so Retry continues exactly where a job stopped without paying twice for finished work."""
from __future__ import annotations

import re
import shutil
import threading
import time
import traceback
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

from . import channels, config, planner, providers, render, thumbnail, youtube

STEPS = ["plan", "budget", "images", "animate", "voice", "render_long",
         "short_images", "render_short", "thumbnail", "upload"]
STEP_LABELS = {
    "plan": "Plan hazırlanır (prompt-lar, Shorts, başlıq)", "budget": "Xərc yoxlanılır",
    "images": "Kadrlar çəkilir", "animate": "Səhnələr hərəkətə gətirilir", "voice": "Səsləndirmə",
    "render_long": "Uzun video montajı", "short_images": "Shorts kadrları", "render_short": "Shorts montajı",
    "thumbnail": "Thumbnail", "upload": "YouTube-a yüklənir",
}
WORKERS = 3

_lock = threading.RLock()
_wake = threading.Event()
_stop_flags: dict[str, threading.Event] = {}
_worker: threading.Thread | None = None


class JobError(RuntimeError):
    pass


# ---------------- storage ----------------
def _dir(job_id: str) -> Path:
    if not re.fullmatch(r"[a-f0-9]{12}", job_id):
        raise KeyError(job_id)
    return config.DATA / "jobs" / job_id


def _save(job: dict) -> dict:
    job["updated"] = time.time()
    config.write_json(_dir(job["id"]) / "job.json", job)
    return job


def get_job(job_id: str) -> dict:
    path = _dir(job_id) / "job.json"
    if not path.exists():
        raise KeyError(job_id)
    return config.read_json(path, {})


def _update(job_id: str, fn) -> dict:
    with _lock:
        job = get_job(job_id)
        fn(job)
        return _save(job)


def list_jobs() -> list[dict]:
    root = config.DATA / "jobs"
    if not root.exists():
        return []
    jobs = [config.read_json(p / "job.json", None) for p in root.iterdir() if (p / "job.json").exists()]
    return sorted([j for j in jobs if j], key=lambda j: j["created"])


def add_job(script: str, channel_id: str, title_hint: str = "", make_long: bool = True,
            make_short: bool = True) -> dict:
    if not script.strip():
        raise JobError("Ssenari boşdur")
    try:
        channels.get(channel_id)
    except channels.ChannelError as e:
        raise JobError(str(e)) from e
    if not (make_long or make_short):
        raise JobError("Ən azı bir format seçin: uzun video və ya Shorts")
    job = {
        "id": uuid.uuid4().hex[:12], "created": time.time(), "title_hint": title_hint.strip(),
        "script": script.strip(), "channel_id": channel_id, "make_long": make_long, "make_short": make_short,
        "status": "queued", "step": "", "done_steps": [], "progress": 0, "message": "Növbədədir",
        "error": "", "warnings": [], "cost": 0.0, "estimate": None, "plan": None, "scenes": [],
        "short_scenes": [], "long": {}, "short": {}, "thumb": "",
    }
    with _lock:
        _save(job)
    _wake.set()
    return job


def retry(job_id: str) -> dict:
    def upd(j):
        if j["status"] == "running":
            raise JobError("İş hələ gedir")
        j.update(status="queued", error="", message="Növbədədir (davam edəcək)")
    job = _update(job_id, upd)
    _wake.set()
    return job


def stop(job_id: str) -> None:
    if job_id in _stop_flags:
        _stop_flags[job_id].set()
    else:
        _update(job_id, lambda j: j.update(status="stopped", message="Dayandırıldı")
                if j["status"] == "queued" else None)


def delete(job_id: str) -> None:
    job = get_job(job_id)
    if job["status"] == "running":
        raise JobError("İşləyən işi silmək olmaz, əvvəlcə dayandırın")
    shutil.rmtree(_dir(job_id), ignore_errors=True)


def recover() -> None:
    """Jobs that were running when the app closed can be continued with Retry."""
    for j in list_jobs():
        if j["status"] == "running":
            _update(j["id"], lambda x: x.update(status="stopped", message="Proqram bağlandı · Yenidən cəhd edin"))


# ---------------- worker ----------------
def start_worker() -> None:
    global _worker
    if _worker and _worker.is_alive():
        return
    _worker = threading.Thread(target=_loop, daemon=True)
    _worker.start()


def _loop() -> None:
    while True:
        nxt = next((j for j in list_jobs() if j["status"] == "queued"), None)
        if not nxt:
            _wake.wait(5)
            _wake.clear()
            continue
        run_job(nxt["id"])


def run_job(job_id: str) -> None:
    ev = threading.Event()
    _stop_flags[job_id] = ev
    _update(job_id, lambda j: j.update(status="running", error=""))
    try:
        for step in STEPS:
            job = get_job(job_id)
            if step in job["done_steps"]:
                continue
            if ev.is_set():
                raise JobError("Dayandırıldı")
            _update(job_id, lambda j: j.update(step=step, progress=0, message=STEP_LABELS[step]))
            STEP_FUNCS[step](job_id, ev)
            _update(job_id, lambda j: j["done_steps"].append(step))
        _update(job_id, lambda j: j.update(status="done", step="", progress=100, message=_done_message(j)))
    except Exception as e:  # noqa: BLE001 - every failure must reach the UI
        traceback.print_exc()
        stopped = ev.is_set()
        _update(job_id, lambda j: j.update(status="stopped" if stopped else "error",
                                           message="Dayandırıldı" if stopped else f"Xəta: {STEP_LABELS.get(j['step'], '')}",
                                           error="" if stopped else str(e)))
    finally:
        _stop_flags.pop(job_id, None)


def _done_message(j: dict) -> str:
    parts = []
    if j["long"].get("youtube_id"):
        parts.append("uzun video")
    if j["short"].get("youtube_id"):
        parts.append("Shorts")
    return ("Kanala private yükləndi: " + " + ".join(parts)) if parts else "Hazırdır"


def _cost(job_id: str, usd: float) -> None:
    if usd:
        _update(job_id, lambda j: j.update(cost=round(j["cost"] + usd, 4)))


def _parallel(job_id: str, ev, items: list, fn, label: str) -> None:
    """Run fn(item) -> (patch_fn, cost) in parallel; save each result immediately."""
    if not items:
        return
    errors, done = [], 0
    with ThreadPoolExecutor(WORKERS) as pool:
        futs = {pool.submit(fn, it): it for it in items}
        for f in as_completed(futs):
            done += 1
            try:
                patch, usd = f.result()
                _update(job_id, patch)
                _cost(job_id, usd)
            except Exception as e:  # noqa: BLE001
                errors.append(str(e))
            _update(job_id, lambda j: j.update(progress=100 * done / len(items), message=f"{label} {done}/{len(items)}"))
            if ev.is_set():
                for other in futs:
                    other.cancel()
    if ev.is_set():
        raise JobError("Dayandırıldı")
    if errors:
        raise JobError(f"{len(errors)} element alınmadı: {errors[0][:300]}")


def _out_name(job: dict, suffix: str) -> Path:
    title = (job["plan"] or {}).get("long_meta", {}).get("title") or job["title_hint"] or "video"
    slug = re.sub(r"[^\w\-]+", "_", title, flags=re.U).strip("_")[:50] or "video"
    config.OUTPUT.mkdir(parents=True, exist_ok=True)
    return config.OUTPUT / f"{slug}_{job['id'][:6]}{suffix}"


# ---------------- steps ----------------
def step_plan(job_id, ev):
    job = get_job(job_id)
    ch = channels.get(job["channel_id"])
    if not ch["voice_id"] and not config.FAKE:
        raise JobError(f"'{ch['name']}' kanalının səsi seçilməyib (Ayarlar → Kanallar → Voice ID)")
    plan, usd = planner.make_plan(job["script"], job["title_hint"], config.get_settings(), ch["language"])
    scenes = [{**s, "image": "", "audio": "", "video": ""} for s in plan["scenes"]]
    warnings = []
    if job["make_short"] and plan["short"] is None:
        warnings.append("Ssenari Shorts üçün çox qısadır (30 saniyədən az), yalnız uzun video hazırlanır")
    if not providers.kie_enabled():
        warnings.append("Kie.ai açarı yoxdur: səhnələr Ken Burns effekti ilə hərəkət edir")
    _update(job_id, lambda j: (j.update(plan=plan, scenes=scenes, llm_cost=usd), j["warnings"].extend(warnings)))
    _cost(job_id, usd)


def step_budget(job_id, ev):
    job = get_job(job_id)
    s = config.get_settings()
    plan = dict(job["plan"])
    if not job["make_short"]:
        plan["short"] = None
    est = planner.estimate_cost(plan, s, job.get("llm_cost", 0.0))
    _update(job_id, lambda j: j.update(estimate=est))
    if est > s["budget_cap"]:
        raise JobError(f"Təxmini xərc ${est:.2f} büdcə limitini (${s['budget_cap']:.2f}) keçir. "
                       "Ayarlarda limiti artırın və ya ssenarini qısaldın, sonra Yenidən cəhd edin.")


def _scene_patch(sid: str, key: str, value: str, short: bool = False):
    def patch(j):
        for sc in j["short_scenes" if short else "scenes"]:
            if sc["id"] == sid:
                sc[key] = value
    return patch


def step_images(job_id, ev):
    job = get_job(job_id)
    d = _dir(job_id) / "images"
    d.mkdir(parents=True, exist_ok=True)

    def one(sc):
        rel = f"images/{sc['id']}.png"
        usd = providers.image(planner.image_prompt(sc["visual"]), _dir(job_id) / rel)
        return _scene_patch(sc["id"], "image", rel), usd
    _parallel(job_id, ev, [s for s in job["scenes"] if not s["image"]], one, "Kadr")


def step_animate(job_id, ev):
    job = get_job(job_id)
    targets = [s for s in job["scenes"] if s["id"] in job["plan"]["animate"] and not s["video"]]
    (_dir(job_id) / "videos").mkdir(parents=True, exist_ok=True)
    for i, sc in enumerate(targets):
        if ev.is_set():
            raise JobError("Dayandırıldı")
        _update(job_id, lambda j: j.update(progress=100 * i / len(targets), message=f"Hərəkət {i + 1}/{len(targets)}"))
        rel = f"videos/{sc['id']}.mp4"
        prompt = f"Subtle realistic cinematic camera movement. {sc['visual']}"
        try:
            usd = providers.animate(_dir(job_id) / sc["image"], prompt, _dir(job_id) / rel, should_stop=ev.is_set)
        except providers.ProviderError as e:  # animation is a bonus: keep going with Ken Burns
            _update(job_id, lambda j: j["warnings"].append(f"Səhnə {sc['id']} hərəkətləndirilmədi: {e}"))
            continue
        _update(job_id, _scene_patch(sc["id"], "video", rel))
        _cost(job_id, usd)


def step_voice(job_id, ev):
    job = get_job(job_id)
    voice = channels.get(job["channel_id"])["voice_id"]
    (_dir(job_id) / "audio").mkdir(parents=True, exist_ok=True)

    def one(sc):
        rel = f"audio/{sc['id']}.mp3"
        usd = providers.tts(sc["text"], _dir(job_id) / rel, voice)
        return _scene_patch(sc["id"], "audio", rel), usd
    _parallel(job_id, ev, [s for s in job["scenes"] if not s["audio"]], one, "Səs")


def _progress(job_id, label):
    return lambda pct, msg: _update(job_id, lambda j: j.update(progress=pct, message=f"{label}: {msg}"))


def step_render_long(job_id, ev):
    job = get_job(job_id)
    if not job["make_long"]:
        return
    out = _out_name(job, ".mp4")
    res = render.render_video(job["scenes"], _dir(job_id), out, progress=_progress(job_id, "Uzun video"),
                              should_stop=ev.is_set)
    _update(job_id, lambda j: j["long"].update(path=res["path"], srt=res["srt"], duration=res["duration"]))


def _short_range(job):
    seg = job["plan"]["short"] if job["make_short"] else None
    return job["scenes"][seg["start"]:seg["end"] + 1] if seg else []


def step_short_images(job_id, ev):
    job = get_job(job_id)
    scenes = _short_range(job)
    if not scenes:
        return
    if not job["short_scenes"]:
        _update(job_id, lambda j: j.update(short_scenes=[
            {"id": s["id"] + "v", "text": s["text"], "visual": s["visual"], "audio": s["audio"], "image": ""}
            for s in scenes]))
        job = get_job(job_id)
    (_dir(job_id) / "short").mkdir(parents=True, exist_ok=True)

    def one(sc):
        rel = f"short/{sc['id']}.png"
        usd = providers.image(planner.image_prompt(sc["visual"], portrait=True), _dir(job_id) / rel, portrait=True)
        return _scene_patch(sc["id"], "image", rel, short=True), usd
    _parallel(job_id, ev, [s for s in job["short_scenes"] if not s["image"]], one, "Shorts kadrı")


def step_render_short(job_id, ev):
    job = get_job(job_id)
    if not job["short_scenes"]:
        return
    out = _out_name(job, "_short.mp4")
    res = render.render_video(job["short_scenes"], _dir(job_id), out, portrait=True, burn_subs=True,
                              progress=_progress(job_id, "Shorts"), should_stop=ev.is_set)
    _update(job_id, lambda j: j["short"].update(path=res["path"], duration=res["duration"]))


def step_thumbnail(job_id, ev):
    job = get_job(job_id)
    if not job["make_long"]:
        return
    raw = _dir(job_id) / "thumb_raw.png"
    if not raw.exists():
        usd = providers.image(planner.image_prompt(job["plan"]["thumb_prompt"]), raw, quality="medium")
        _cost(job_id, usd)
    out = thumbnail.compose(raw, job["plan"]["thumb_text"], _out_name(job, "_thumb.jpg"))
    _update(job_id, lambda j: j.update(thumb=str(out)))


def step_upload(job_id, ev):
    job = get_job(job_id)
    ch = channels.get(job["channel_id"])
    if job["long"].get("path") and not job["long"].get("youtube_id"):
        _update(job_id, lambda j: j.update(message="Uzun video YouTube-a yüklənir"))
        vid = youtube.upload(Path(job["long"]["path"]), job["plan"]["long_meta"], ch,
                             progress=lambda p: _update(job_id, lambda j: j.update(progress=p * 0.7)))
        _update(job_id, lambda j: j["long"].update(youtube_id=vid, studio=youtube.studio_url(vid)))
        for what, call in (("Thumbnail", lambda: youtube.set_thumbnail(vid, Path(job["thumb"]), ch)),
                           ("Altyazı", lambda: youtube.upload_captions(vid, Path(job["long"]["srt"]), ch))):
            try:
                call()
            except Exception as e:  # noqa: BLE001 - the video itself is uploaded; report and continue
                _update(job_id, lambda j: j["warnings"].append(f"{what} əlavə olunmadı: {e}"))
    job = get_job(job_id)
    if job["short"].get("path") and not job["short"].get("youtube_id"):
        _update(job_id, lambda j: j.update(message="Shorts YouTube-a yüklənir", progress=75))
        vid = youtube.upload(Path(job["short"]["path"]), job["plan"]["short_meta"], ch)
        _update(job_id, lambda j: j["short"].update(youtube_id=vid, studio=youtube.studio_url(vid)))


STEP_FUNCS = {
    "plan": step_plan, "budget": step_budget, "images": step_images, "animate": step_animate,
    "voice": step_voice, "render_long": step_render_long, "short_images": step_short_images,
    "render_short": step_render_short, "thumbnail": step_thumbnail, "upload": step_upload,
}
