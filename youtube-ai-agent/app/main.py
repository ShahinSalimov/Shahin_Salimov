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

from . import llm, pipeline, research, script, store

STATIC = Path(__file__).parent / "static"


@asynccontextmanager
async def lifespan(_app):
    store.DATA.mkdir(parents=True, exist_ok=True)
    store.OUTPUT.mkdir(parents=True, exist_ok=True)
    pipeline.recover_interrupted()
    research.recover_interrupted()
    yield


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
def research_list():
    return research.list_all()


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


app.mount("/", StaticFiles(directory=STATIC, html=True), name="static")
