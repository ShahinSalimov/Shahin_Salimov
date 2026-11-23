"""FastAPI server + static UI."""
from __future__ import annotations

import os
import subprocess
import sys
import time
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

import threading

from fastapi import Request
from fastapi.responses import HTMLResponse, RedirectResponse

from . import channels, llm, pipeline, research, script, store, youtube

STATIC = Path(__file__).parent / "static"


@asynccontextmanager
async def lifespan(_app):
    store.DATA.mkdir(parents=True, exist_ok=True)
    store.OUTPUT.mkdir(parents=True, exist_ok=True)
    pipeline.recover_interrupted()
    research.recover_interrupted()
    stop = threading.Event()
    if os.environ.get("YTA_SCHEDULER", "1") == "1":
        threading.Thread(target=channels.scheduler, args=(stop,), daemon=True).start()
    yield
    stop.set()


app = FastAPI(title="YouTube AI Agent", lifespan=lifespan)


def _proj(pid: str) -> dict:
    try:
        return store.get_project(pid)
    except (KeyError, ValueError):
        raise HTTPException(404, "Layihə tapılmadı")


def _job(pid: str, name: str, fn, *args):
    try:
        pipeline.start(pid, name, fn, *args)
    except pipeline.Busy as e:
        raise HTTPException(409, str(e))
    return {"ok": True}


# ---------------- settings / keys / profiles ----------------
@app.get("/api/settings")
def get_settings():
    return {"settings": store.get_settings(), "keys": store.masked_keys(),
            "profiles": [{"id": p["id"], "name": p["name"]} for p in store.list_profiles()],
            "active_profile": store.active_profile_id()}


@app.put("/api/settings")
def put_settings(body: dict):
    return {"settings": store.save_settings(body), "saved_at": time.strftime("%H:%M:%S")}


@app.put("/api/keys")
def put_keys(body: dict):
    store.save_keys(body)
    return {"keys": store.masked_keys()}


@app.post("/api/keys/{provider}/test")
def test_key(provider: str):
    try:
        return {"ok": True, "message": llm.test_connection(provider)}
    except llm.ProviderError as e:
        return {"ok": False, "message": str(e)}


class ProfileIn(BaseModel):
    name: str = ""
    id: str | None = None


@app.post("/api/profiles")
def save_profile(body: ProfileIn):
    try:
        p = store.save_profile(body.name or "Profil", body.id)
    except KeyError:
        raise HTTPException(404, "Profil tapılmadı")
    if not body.id:
        store.apply_profile(p["id"])
    return {"id": p["id"], "name": p["name"]}


@app.post("/api/profiles/{profile_id}/apply")
def apply_profile(profile_id: str):
    try:
        return {"settings": store.apply_profile(profile_id)}
    except KeyError:
        raise HTTPException(404, "Profil tapılmadı")


@app.delete("/api/profiles/{profile_id}")
def delete_profile(profile_id: str):
    store.delete_profile(profile_id)
    return {"ok": True}


# ---------------- library ----------------
@app.get("/api/library")
def library():
    return store.get_library()


@app.post("/api/library/{kind}")
def upsert_library(kind: str, item: dict):
    if kind not in ("styles", "characters"):
        raise HTTPException(400, "kind")
    return store.upsert_library_item(kind, item)


@app.delete("/api/library/{kind}/{item_id}")
def del_library(kind: str, item_id: str):
    store.delete_library_item(kind, item_id)
    return {"ok": True}


# ---------------- uploads (logo, music) ----------------
@app.post("/api/upload/{kind}")
async def upload(kind: str, file: UploadFile = File(...)):
    if kind not in ("logo", "music"):
        raise HTTPException(400, "kind")
    allowed = {"logo": (".png", ".webp"), "music": (".mp3", ".wav", ".m4a", ".aac")}[kind]
    ext = Path(file.filename or "").suffix.lower()
    if ext not in allowed:
        raise HTTPException(400, f"İcazə verilən formatlar: {', '.join(allowed)}")
    dest = store.DATA / "assets" / f"{kind}{ext}"
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(await file.read())
    section = "branding" if kind == "logo" else "music"
    field = "logo" if kind == "logo" else "file"
    store.save_settings({section: {field: str(dest)}})
    return {"path": str(dest)}


# ---------------- projects ----------------
class NewProject(BaseModel):
    title: str
    brief: str = ""
    auto: bool = False


@app.get("/api/projects")
def projects():
    return store.list_projects()


@app.post("/api/projects")
def new_project(body: NewProject):
    p = store.create_project(body.title, body.brief)
    if body.auto:
        _job(p["id"], "full_auto", pipeline.job_full_auto)
    return p


@app.get("/api/projects/{pid}")
def get_project(pid: str):
    p = _proj(pid)
    p["running"] = pipeline.is_running(pid)
    p["total_cost"] = round(sum(c["usd"] for c in p["costs"]), 4)
    return p


@app.delete("/api/projects/{pid}")
def delete_project(pid: str):
    if pipeline.is_running(pid):
        raise HTTPException(409, "Proses gedərkən silmək olmaz")
    store.delete_project(pid)
    return {"ok": True}


@app.post("/api/projects/{pid}/refresh-settings")
def refresh_settings(pid: str):
    """Copy the current global settings (after a profile switch) into the project."""
    _proj(pid)
    return store.update_project(pid, lambda p: p.update(settings=store.get_settings()))


@app.put("/api/projects/{pid}/script")
def put_script(pid: str, body: dict):
    _proj(pid)
    return store.update_project(pid, lambda p: p.update(script=body.get("script", "")))


@app.post("/api/projects/{pid}/write-script")
def write_script(pid: str):
    _proj(pid)
    return _job(pid, "script", pipeline.job_write_script)


@app.post("/api/projects/{pid}/split")
def split(pid: str):
    p = _proj(pid)
    if not p["script"].strip():
        raise HTTPException(400, "Ssenari boşdur")
    scenes = script.split_scenes(p["script"], p["settings"]["script"])
    return store.update_project(pid, lambda x: x.update(scenes=scenes, stage="storyboard"))


@app.post("/api/projects/{pid}/reset-scenes")
def reset_scenes(pid: str):
    _proj(pid)
    if pipeline.is_running(pid):
        raise HTTPException(409, "Proses gedir")
    return store.update_project(pid, lambda p: p.update(scenes=[], stage="script", output="", metadata=None))


@app.put("/api/projects/{pid}/scenes/{sid}")
def edit_scene(pid: str, sid: str, body: dict):
    _proj(pid)
    allowed = {"text", "visual", "prompt", "animate"}

    def upd(p):
        for s in p["scenes"]:
            if s["id"] == sid:
                for k, v in body.items():
                    if k in allowed:
                        s[k] = v
                if "text" in body:
                    s["audio"] = ""  # voice must be regenerated
                if "prompt" in body:
                    s["prompt_locked"] = bool(body["prompt"].strip())
                if "visual" in body:
                    s["prompt_locked"] = False
    return store.update_project(pid, upd)


@app.delete("/api/projects/{pid}/scenes/{sid}")
def delete_scene(pid: str, sid: str):
    _proj(pid)
    return store.update_project(pid, lambda p: p.update(scenes=[s for s in p["scenes"] if s["id"] != sid]))


@app.post("/api/projects/{pid}/scenes/{sid}/clear-video")
def clear_video(pid: str, sid: str):
    _proj(pid)
    return store.update_project(pid, lambda p: [s.update(video="") for s in p["scenes"] if s["id"] == sid])


@app.post("/api/projects/{pid}/frames")
def frames(pid: str, body: dict | None = None):
    _proj(pid)
    body = body or {}
    return _job(pid, "frames", pipeline.job_frames, body.get("scene_ids"), bool(body.get("force")))


@app.post("/api/projects/{pid}/scenes/{sid}/animate")
def animate(pid: str, sid: str):
    _proj(pid)
    return _job(pid, "animate", pipeline.job_animate, sid)


@app.post("/api/projects/{pid}/voice")
def voice(pid: str, body: dict | None = None):
    _proj(pid)
    body = body or {}
    return _job(pid, "voice", pipeline.job_voice, body.get("scene_ids"), bool(body.get("force")))


@app.post("/api/projects/{pid}/render")
def do_render(pid: str):
    _proj(pid)
    return _job(pid, "render", pipeline.job_render)


@app.post("/api/projects/{pid}/metadata")
def metadata(pid: str):
    _proj(pid)
    return _job(pid, "metadata", pipeline.job_metadata)


@app.post("/api/projects/{pid}/auto")
def auto(pid: str):
    _proj(pid)
    return _job(pid, "full_auto", pipeline.job_full_auto)


@app.post("/api/projects/{pid}/stop")
def stop(pid: str):
    pipeline.stop(pid)
    return {"ok": True}


@app.get("/api/projects/{pid}/file/{sub}/{name}")
def project_file(pid: str, sub: str, name: str):
    if sub not in ("images", "audio", "videos") or "/" in name or ".." in name:
        raise HTTPException(400, "path")
    f = store.project_dir(pid) / sub / name
    if not f.exists():
        raise HTTPException(404, "yoxdur")
    return FileResponse(f)


@app.get("/api/projects/{pid}/output")
def output(pid: str, srt: bool = False):
    p = _proj(pid)
    f = Path(p["srt"] if srt else p["output"] or "")
    if not p["output"] or not f.exists():
        raise HTTPException(404, "Video hələ hazır deyil")
    return FileResponse(f, filename=f.name)


@app.post("/api/projects/{pid}/open-folder")
def open_folder(pid: str):
    p = _proj(pid)
    folder = str(Path(p["output"]).parent if p.get("output") else store.OUTPUT)
    try:
        if sys.platform.startswith("win"):
            os.startfile(folder)  # type: ignore[attr-defined]
        elif sys.platform == "darwin":
            subprocess.Popen(["open", folder])
        else:
            subprocess.Popen(["xdg-open", folder])
    except OSError:
        pass
    return {"folder": folder}


# ---------------- channel strategy agent ----------------
@app.get("/api/research")
def research_list(channel_id: str = ""):
    rows = research.list_all()
    if channel_id:
        return [r for r in rows if r["channel_id"] == channel_id]
    return [r for r in rows if r["kind"] in ("niche", "ideas", "seo")]


@app.post("/api/research/{kind}")
def research_start(kind: str, body: dict):
    if kind not in ("niche", "ideas", "seo"):
        raise HTTPException(400, "kind")
    return research.start(kind, body)


def _research(rid: str) -> dict:
    try:
        return research.get(rid)
    except KeyError:
        raise HTTPException(404, "Araşdırma tapılmadı")


@app.get("/api/research/{rid}")
def research_get(rid: str):
    doc = _research(rid)
    doc["total_cost"] = round(sum(c.get("usd", 0) for c in doc.get("costs", [])), 4)
    return doc


@app.delete("/api/research/{rid}")
def research_delete(rid: str):
    research.delete(rid)
    return {"ok": True}


class IdeaToProject(BaseModel):
    title: str
    brief: str = ""
    metadata: dict | None = None
    auto: bool = False


@app.post("/api/research-to-project")
def research_to_project(body: IdeaToProject):
    """Send a researched idea (and its SEO pack, if made) into the video pipeline."""
    p = store.create_project(body.title, body.brief)
    if body.metadata:
        m = body.metadata
        meta = {"title": m.get("recommended_title") or body.title, "description": m.get("description", ""),
                "tags": m.get("tags", []), "thumbnail_prompt": m.get("thumbnail_prompt", "")}
        p = store.update_project(p["id"], lambda x: x.update(metadata=meta))
    if body.auto:
        _job(p["id"], "full_auto", pipeline.job_full_auto)
    return p


# ---------------- my channels ----------------
def _ch(cid: str) -> dict:
    try:
        return channels.get(cid)
    except KeyError:
        raise HTTPException(404, "Kanal tapılmadı")


def _with_status(c: dict) -> dict:
    return {**c, "connected": youtube.is_connected(c["id"]), "idea_count": len(channels.ideas(c["id"]))}


@app.get("/api/channels")
def channels_list():
    return [_with_status(c) for c in channels.list_channels()]


@app.post("/api/channels")
def channels_create(body: dict):
    if not (body.get("name") or "").strip():
        raise HTTPException(400, "Kanal adı yazın")
    body.pop("id", None)
    c = channels.save(body)
    if body.get("generate_kit", True):
        research.start("channel_kit", {"channel_id": c["id"], "title": f"{c['name']}: kanal paketi"})
    return c


@app.post("/api/channels/from-research/{rid}")
def channels_from_research(rid: str, body: dict):
    try:
        c = channels.from_research(rid, body.get("name", ""), body.get("handle", ""))
    except KeyError:
        raise HTTPException(404, "Araşdırma tapılmadı")
    except ValueError as e:
        raise HTTPException(400, str(e))
    research.start("channel_kit", {"channel_id": c["id"], "title": f"{c['name']}: kanal paketi"})
    return c


@app.get("/api/channels/{cid}")
def channels_get(cid: str):
    c = _with_status(_ch(cid))
    c["ideas"] = list(reversed(channels.ideas(cid)))
    return c


@app.put("/api/channels/{cid}")
def channels_put(cid: str, body: dict):
    _ch(cid)
    body = {k: v for k, v in body.items() if k not in ("id", "youtube", "created")}
    return channels.save({**body, "id": cid})


@app.delete("/api/channels/{cid}")
def channels_delete(cid: str):
    _ch(cid)
    youtube.disconnect(cid)
    channels.delete(cid)
    return {"ok": True}


@app.post("/api/channels/{cid}/{action}")
def channels_job(cid: str, action: str, body: dict | None = None):
    c = _ch(cid)
    body = body or {}
    if action == "disconnect":  # declared here because this route would otherwise shadow it
        youtube.disconnect(cid)
        channels.save({"id": cid, "youtube": {"channel_id": "", "title": "", "connected_at": 0}})
        return {"ok": True}
    kinds = {"kit": ("channel_kit", "kanal paketi"), "ideas": ("channel_ideas", "yeni ideyalar"),
             "command": ("channel_command", "komanda")}
    if action not in kinds:
        raise HTTPException(400, "action")
    kind, label = kinds[action]
    return research.start(kind, {**body, "channel_id": cid, "title": f"{c['name']}: {label}"})


@app.post("/api/channels/{cid}/ideas/{iid}/{action}")
def idea_action(cid: str, iid: str, action: str, body: dict | None = None):
    c = _ch(cid)
    try:
        idea = channels.get_idea(cid, iid)
    except KeyError:
        raise HTTPException(404, "İdeya tapılmadı")
    body = body or {}
    if action in ("script", "seo"):
        return research.start(f"channel_{action}", {**body, "channel_id": cid, "idea_id": iid,
                                                     "title": f"{c['name']}: {idea['title'][:60]}"})
    if action == "project":
        p = channels.idea_to_project(cid, iid)
        if body.get("auto"):
            _job(p["id"], "full_auto", pipeline.job_full_auto)
        return p
    if action == "save":
        allowed = {k: v for k, v in body.items() if k in ("script", "title", "status")}
        channels.patch_idea(cid, iid, **allowed)
        return {"ok": True}
    raise HTTPException(400, "action")


@app.delete("/api/channels/{cid}/ideas/{iid}")
def idea_delete(cid: str, iid: str):
    _ch(cid)
    channels.update_ideas(cid, lambda items: items.__setitem__(slice(None), [i for i in items if i["id"] != iid]))
    return {"ok": True}


# ---------------- YouTube connection + upload ----------------
@app.get("/api/youtube/connect/{cid}")
def yt_connect(cid: str, request: Request):
    _ch(cid)
    redirect = str(request.base_url).rstrip("/") + "/api/youtube/callback"
    try:
        return RedirectResponse(youtube.auth_url(cid, redirect))
    except youtube.YouTubeError as e:
        return HTMLResponse(_page("Bağlanmadı", str(e)), status_code=400)


def _page(title: str, msg: str, back: str = "/#/channels") -> str:
    from html import escape
    return (f"<!doctype html><meta charset=utf-8><title>{escape(title)}</title><body style='font:16px system-ui;"
            f"background:#0f1115;color:#e7e9ee;padding:40px'><h2>{escape(title)}</h2><p>{escape(msg)}</p>"
            f"<p><a style='color:#ff6b6b' href='{back}'>Proqrama qayıt</a></p></body>")


@app.get("/api/youtube/callback")
def yt_callback(code: str = "", state: str = "", error: str = ""):
    if error:
        return HTMLResponse(_page("Bağlanmadı", f"Google: {error}"), status_code=400)
    try:
        cid, info = youtube.finish_auth(code, state)
    except youtube.YouTubeError as e:
        return HTMLResponse(_page("Bağlanmadı", str(e)), status_code=400)
    channels.save({"id": cid, "youtube": info})
    return HTMLResponse(_page("Kanal bağlandı", f"YouTube kanalı: {info['title']}. Bu pəncərəni bağlaya bilərsiniz.",
                              f"/#/channel/{cid}/upload"))


@app.post("/api/projects/{pid}/thumbnail")
def project_thumbnail(pid: str):
    _proj(pid)
    return _job(pid, "thumbnail", pipeline.job_thumbnail)


@app.get("/api/projects/{pid}/thumb")
def project_thumb_file(pid: str):
    p = _proj(pid)
    f = store.project_dir(pid) / (p.get("thumbnail") or "none")
    if not p.get("thumbnail") or not f.exists():
        raise HTTPException(404, "yoxdur")
    return FileResponse(f)


@app.post("/api/projects/{pid}/upload")
def project_upload(pid: str, body: dict | None = None):
    p = _proj(pid)
    body = body or {}
    cid = body.get("channel_id") or p.get("channel_id")
    if not cid:
        raise HTTPException(400, "Kanal seçin")
    _ch(cid)
    if not p["settings"].get("demo_mode") and not youtube.is_connected(cid):
        raise HTTPException(400, "Bu kanal YouTube-a bağlanmayıb (Kanallarım → kanal → YouTube)")
    if body.get("publish_at"):
        from datetime import datetime
        try:  # <input type=datetime-local> has no timezone: treat it as this computer's local time
            body["publish_at"] = datetime.fromisoformat(body["publish_at"]).astimezone().isoformat(timespec="seconds")
        except ValueError:
            raise HTTPException(400, "Yayım vaxtı formatı yanlışdır")
    if body.get("publish_time") and not body.get("publish_at"):
        body["publish_at"] = youtube.next_publish_at(body["publish_time"])
    return _job(pid, "upload", pipeline.job_upload, {**body, "channel_id": cid})


app.mount("/", StaticFiles(directory=STATIC, html=True), name="static")
