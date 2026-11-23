"""Background jobs that move a project through: script → scenes → frames → voice → render."""
from __future__ import annotations

import threading
from pathlib import Path
import time
import traceback
from concurrent.futures import ThreadPoolExecutor, as_completed

from . import media, render, script, store, youtube

_stops: dict[str, threading.Event] = {}
_running: dict[str, threading.Thread] = {}
IMAGE_WORKERS = 3


class Busy(RuntimeError):
    pass


def _set_job(pid: str, **job) -> None:
    store.update_project(pid, lambda p: p.__setitem__("job", {**(p.get("job") or {}), **job}))


def _add_costs(pid: str, entries: list[dict]) -> None:
    entries = [{**e, "t": time.time()} for e in entries if e]
    if entries:
        store.update_project(pid, lambda p: p["costs"].extend(entries))


def is_running(pid: str) -> bool:
    t = _running.get(pid)
    return bool(t and t.is_alive())


def stop(pid: str) -> None:
    if pid in _stops:
        _stops[pid].set()


def start(pid: str, name: str, fn, *args) -> None:
    if is_running(pid):
        raise Busy("Bu layihədə artıq bir proses gedir")
    ev = threading.Event()
    _stops[pid] = ev
    _set_job(pid, name=name, status="running", progress=0, message="Başlayır...", error="", started=time.time())

    def runner():
        try:
            fn(pid, ev, *args)
            _set_job(pid, status="done", progress=100, message="Tamamlandı")
        except Exception as e:  # noqa: BLE001 - surface any failure to the UI
            traceback.print_exc()
            stopped = ev.is_set()
            _set_job(pid, status="stopped" if stopped else "error",
                     message="Dayandırıldı" if stopped else "Xəta", error="" if stopped else str(e))

    t = threading.Thread(target=runner, daemon=True)
    _running[pid] = t
    t.start()


def recover_interrupted() -> None:
    """Jobs that were 'running' when the app closed are marked as stopped."""
    for p in store.list_projects():
        proj = store.get_project(p["id"])
        if (proj.get("job") or {}).get("status") == "running":
            _set_job(p["id"], status="stopped", message="Proqram bağlandığı üçün dayandı")


# ---------------- jobs ----------------
def job_write_script(pid: str, ev: threading.Event) -> None:
    proj = store.get_project(pid)
    _set_job(pid, progress=10, message=f"Ssenari yazılır ({proj['settings']['script']['llm_model']})")
    text, costs = script.write_script(proj["title"], proj["brief"], proj["settings"])
    _add_costs(pid, costs)
    store.update_project(pid, lambda p: p.update(script=text))


def job_frames(pid: str, ev: threading.Event, scene_ids: list[str] | None = None, force: bool = False) -> None:
    proj = store.get_project(pid)
    targets = [s for s in proj["scenes"] if (scene_ids is None or s["id"] in scene_ids)
               and (force or not s.get("image"))]
    if not targets:
        return
    need_visual = [s["id"] for s in targets if not s.get("visual")]
    if need_visual:
        _set_job(pid, progress=5, message="Səhnələr üçün vizual təsvirlər yazılır")
        costs = script.describe_visuals(proj, need_visual)
        _add_costs(pid, costs)
        vis = {s["id"]: s["visual"] for s in proj["scenes"]}
        store.update_project(pid, lambda p: [s.update(visual=vis[s["id"]]) for s in p["scenes"] if s["id"] in vis])
        proj = store.get_project(pid)
        targets = [s for s in proj["scenes"] if s["id"] in {t["id"] for t in targets}]
    d = store.project_dir(pid) / "images"
    d.mkdir(parents=True, exist_ok=True)
    done = 0

    def one(sc):
        if ev.is_set():
            return sc["id"], None, None, "Dayandırıldı"
        prompt = sc.get("prompt") if (sc.get("prompt") and sc.get("prompt_locked")) else script.build_prompt(sc, proj["settings"])
        name = f"images/{sc['id']}_{int(time.time() * 1000) % 10**8}.png"
        try:
            cost = media.generate_image(prompt, store.project_dir(pid) / name, proj["settings"])
            return sc["id"], name, prompt, cost
        except Exception as e:  # noqa: BLE001
            return sc["id"], None, prompt, str(e)

    with ThreadPoolExecutor(IMAGE_WORKERS) as pool:
        futs = [pool.submit(one, sc) for sc in targets]
        for f in as_completed(futs):
            sid, name, prompt, res = f.result()
            done += 1

            def upd(p, sid=sid, name=name, prompt=prompt, res=res):
                for s in p["scenes"]:
                    if s["id"] == sid:
                        if prompt:
                            s["prompt"] = prompt
                        if name:
                            s.update(image=name, status="image", error="")
                        else:
                            s["error"] = res
                if isinstance(res, dict):
                    p["costs"].append({**res, "t": time.time()})
            store.update_project(pid, upd)
            _set_job(pid, progress=10 + 90 * done / len(targets), message=f"Şəkil {done}/{len(targets)}")
    failed = [s for s in store.get_project(pid)["scenes"] if s["id"] in {t["id"] for t in targets} and s.get("error")]
    if ev.is_set():
        raise RuntimeError("Dayandırıldı")
    if failed:
        raise RuntimeError(f"{len(failed)} səhnənin şəkli alınmadı: {failed[0]['error'][:200]}")


def job_animate(pid: str, ev: threading.Event, scene_id: str) -> None:
    proj = store.get_project(pid)
    sc = next(s for s in proj["scenes"] if s["id"] == scene_id)
    if not sc.get("image"):
        raise RuntimeError("Əvvəlcə səhnənin şəklini yaradın")
    _set_job(pid, progress=10, message="Hərəkət prompt-u yazılır")
    prompt, costs = script.motion_prompt(sc, proj["settings"])
    _add_costs(pid, costs)
    _set_job(pid, progress=25, message="Video modeli kadrı hərəkətə gətirir (2-5 dəq)")
    d = store.project_dir(pid) / "videos"
    d.mkdir(parents=True, exist_ok=True)
    name = f"videos/{scene_id}_{int(time.time())}.mp4"
    cost = media.animate(store.project_dir(pid) / sc["image"], prompt, store.project_dir(pid) / name,
                         proj["settings"], should_stop=ev.is_set)
    _add_costs(pid, [cost])

    def upd(p):
        for s in p["scenes"]:
            if s["id"] == scene_id:
                s.update(video=name, motion_prompt=prompt)
    store.update_project(pid, upd)


def job_voice(pid: str, ev: threading.Event, scene_ids: list[str] | None = None, force: bool = False) -> None:
    proj = store.get_project(pid)
    targets = [s for s in proj["scenes"] if (scene_ids is None or s["id"] in scene_ids)
               and (force or not s.get("audio"))]
    d = store.project_dir(pid) / "audio"
    d.mkdir(parents=True, exist_ok=True)
    max_sec = float(proj["settings"]["script"]["max_scene_seconds"])
    warnings = []

    def one(sc):
        if ev.is_set():
            return sc, None, "Dayandırıldı"
        name = f"audio/{sc['id']}_{int(time.time() * 1000) % 10**8}.mp3"
        try:
            cost = media.synthesize(sc["text"], store.project_dir(pid) / name, proj["settings"])
            return sc, name, cost
        except Exception as e:  # noqa: BLE001
            return sc, None, str(e)

    done = 0
    with ThreadPoolExecutor(3) as pool:
        for f in as_completed([pool.submit(one, sc) for sc in targets]):
            sc, name, res = f.result()
            done += 1
            dur = media.media_duration(store.project_dir(pid) / name) if name else 0.0
            if dur > max_sec:
                warnings.append(f"Səhnə {proj['scenes'].index(sc) + 1}: {dur:.0f} san (limit {max_sec:.0f})")

            def upd(p, sid=sc["id"], name=name, res=res, dur=dur):
                for s in p["scenes"]:
                    if s["id"] == sid:
                        if name:
                            s.update(audio=name, duration=round(dur, 2), error="")
                        else:
                            s["error"] = res
                if isinstance(res, dict):
                    p["costs"].append({**res, "t": time.time()})
            store.update_project(pid, upd)
            _set_job(pid, progress=100 * done / max(1, len(targets)), message=f"Səsləndirmə {done}/{len(targets)}")
    if ev.is_set():
        raise RuntimeError("Dayandırıldı")
    store.update_project(pid, lambda p: p.__setitem__("voice_warnings", warnings))
    errs = [s for s in store.get_project(pid)["scenes"] if s["id"] in {t["id"] for t in targets} and s.get("error")]
    if errs:
        raise RuntimeError(f"{len(errs)} səhnə səsləndirilmədi: {errs[0]['error'][:200]}")


def job_render(pid: str, ev: threading.Event) -> None:
    proj = store.get_project(pid)
    out = store.OUTPUT / f"{render.safe_filename(proj['title'])}_{pid[:6]}.mp4"
    res = render.render_project(proj, store.project_dir(pid), out,
                                progress=lambda pct, msg: _set_job(pid, progress=pct, message=msg),
                                should_stop=ev.is_set)
    store.update_project(pid, lambda p: p.update(output=res["path"], srt=res["srt"], stage="done",
                                                  render_info=res))
    if not proj.get("metadata"):
        try:
            meta, costs = script.youtube_metadata(store.get_project(pid))
            _add_costs(pid, costs)
            store.update_project(pid, lambda p: p.update(metadata=meta))
        except Exception:  # noqa: BLE001 - metadata is optional
            traceback.print_exc()


def job_metadata(pid: str, ev: threading.Event) -> None:
    meta, costs = script.youtube_metadata(store.get_project(pid))
    _add_costs(pid, costs)
    store.update_project(pid, lambda p: p.update(metadata=meta))


def job_full_auto(pid: str, ev: threading.Event) -> None:
    """Topic → finished MP4 without stopping (uses current project settings)."""
    proj = store.get_project(pid)
    if not proj["script"].strip():
        job_write_script(pid, ev)
    proj = store.get_project(pid)
    if not proj["scenes"]:
        scenes = script.split_scenes(proj["script"], proj["settings"]["script"])
        store.update_project(pid, lambda p: p.update(scenes=scenes, stage="storyboard"))
    for step in (job_frames, job_voice):
        if ev.is_set():
            raise RuntimeError("Dayandırıldı")
        step(pid, ev)
    job_render(pid, ev)
    ch = _channel(store.get_project(pid))
    if ch and ch["upload"].get("auto") and (ch["youtube"].get("channel_id") or youtube.is_connected(ch["id"])):
        opts = dict(ch["upload"])
        if opts.get("publish_time"):
            opts["publish_at"] = youtube.next_publish_at(opts["publish_time"])
        job_upload(pid, ev, {**opts, "channel_id": ch["id"]})


def _channel(proj: dict) -> dict | None:
    from . import channels
    try:
        return channels.get(proj.get("channel_id") or "")
    except KeyError:
        return None


def job_thumbnail(pid: str, ev: threading.Event) -> None:
    proj = store.get_project(pid)
    meta = proj.get("metadata") or {}
    prompt = meta.get("thumbnail_prompt") or f"Cinematic realistic YouTube thumbnail about: {proj['title']}"
    st = {**proj["settings"], "visual": {**proj["settings"]["visual"], "aspect": "16:9"}}
    _set_job(pid, progress=20, message="Thumbnail çəkilir")
    name = f"thumb_{int(time.time())}.png"
    cost = media.generate_image(prompt + ", no text, high contrast, one clear focal subject", store.project_dir(pid) / name, st)
    _add_costs(pid, [cost])
    store.update_project(pid, lambda p: p.update(thumbnail=name))


def job_upload(pid: str, ev: threading.Event, opts: dict | None = None) -> None:
    """Upload the rendered MP4 (+ thumbnail) to the project's channel."""
    opts = dict(opts or {})
    proj = store.get_project(pid)
    cid = opts.get("channel_id") or proj.get("channel_id")
    if not proj.get("output"):
        raise RuntimeError("Əvvəlcə videonu montaj edin")
    if not cid:
        raise RuntimeError("Kanal seçilməyib")
    from . import channels
    ch = channels.get(cid)
    opts = {**ch["upload"], **{k: v for k, v in opts.items() if v not in (None, "")}}
    if not proj.get("metadata"):
        _set_job(pid, progress=2, message="Title, description, tag-lər yazılır")
        job_metadata(pid, ev)
        proj = store.get_project(pid)
    meta = dict(proj["metadata"])
    footer = (ch["kit"].get("description_footer") or "").strip()
    if footer and footer not in meta.get("description", ""):
        meta["description"] = (meta.get("description", "").rstrip() + "\n\n" + footer)
    meta["tags"] = list(dict.fromkeys(list(meta.get("tags", [])) + list(ch["kit"].get("default_tags", []))))
    body = youtube.build_body(meta, opts, ch.get("lang_code", ""))
    if proj["settings"].get("demo_mode"):
        vid = "demo_" + pid[:6]
        _set_job(pid, progress=90, message="DEMO: YouTube-a yükləmə simulyasiya olundu")
    else:
        vid = youtube.upload_video(cid, Path(proj["output"]),
                                   body, progress=lambda pct, msg: _set_job(pid, progress=5 + pct * 0.85, message=msg),
                                   should_stop=ev.is_set)
    warn = ""
    if opts.get("thumbnail", True):
        try:
            if not proj.get("thumbnail"):
                job_thumbnail(pid, ev)
                proj = store.get_project(pid)
            if not proj["settings"].get("demo_mode"):
                _set_job(pid, progress=95, message="Thumbnail qoyulur")
                youtube.set_thumbnail(cid, vid, store.project_dir(pid) / proj["thumbnail"])
        except Exception as e:  # noqa: BLE001 - video is already up; thumbnail is secondary
            warn = str(e)
    info = {"video_id": vid, "url": f"https://youtu.be/{vid}", "channel_id": cid, "privacy": body["status"]["privacyStatus"],
            "publish_at": body["status"].get("publishAt", ""), "uploaded_at": time.time(), "thumbnail_warning": warn,
            "title": body["snippet"]["title"]}
    store.update_project(pid, lambda p: p.update(youtube=info, channel_id=cid))
    if proj.get("idea_id"):
        channels.patch_idea(cid, proj["idea_id"], status="uploaded", video_url=info["url"])
