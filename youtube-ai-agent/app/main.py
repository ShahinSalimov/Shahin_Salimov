"""Local web app: Studio (scripts + queue) and Settings (keys, channels)."""
from __future__ import annotations

import os
import subprocess
import sys
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from . import channels, config, jobs, providers, youtube

STATIC = Path(__file__).parent / "static"


@asynccontextmanager
async def lifespan(_app):
    config.DATA.mkdir(parents=True, exist_ok=True)
    config.OUTPUT.mkdir(parents=True, exist_ok=True)
    jobs.recover()
    if os.environ.get("YTA_NO_WORKER") != "1":
        jobs.start_worker()
    yield


app = FastAPI(title="YouTube Agent", lifespan=lifespan)


def _err(e: Exception, code: int = 400):
    raise HTTPException(code, str(e))


# ---------------- settings & keys ----------------
@app.get("/api/settings")
def settings():
    return {"settings": config.get_settings(), "keys": config.masked_keys(),
            "client_secret": youtube.client_secret_path().exists(),
            "kie_enabled": providers.kie_enabled()}


@app.put("/api/settings")
def put_settings(body: dict):
    try:
        return {"settings": config.save_settings(body)}
    except (TypeError, ValueError) as e:
        _err(e)


@app.put("/api/keys")
def put_keys(body: dict):
    config.save_keys(body)
    return {"keys": config.masked_keys()}


@app.post("/api/keys/{name}/test")
def test_key(name: str):
    if name not in config.KEY_NAMES:
        _err(ValueError("Naməlum servis"))
    try:
        return {"ok": True, "message": providers.test_key(name)}
    except providers.ProviderError as e:
        return {"ok": False, "message": str(e)}


# ---------------- channels ----------------
@app.post("/api/youtube/client-secret")
async def client_secret(file: UploadFile = File(...)):
    raw = await file.read()
    import json
    try:
        data = json.loads(raw)
        assert "installed" in data
    except (ValueError, AssertionError):
        _err(ValueError("Bu fayl Desktop app tipli OAuth client_secret.json deyil"))
    youtube.client_secret_path().parent.mkdir(parents=True, exist_ok=True)
    youtube.client_secret_path().write_bytes(raw)
    return {"ok": True}


@app.get("/api/channels")
def list_channels():
    return [{**c, "connected": youtube.is_connected(c["id"])} for c in channels.list_channels()]


@app.post("/api/channels/connect")
def connect_channel(body: dict | None = None):
    """Opens Google sign-in in the browser; blocks until Şahin finishes there."""
    try:
        return youtube.connect((body or {}).get("channel_id"))
    except (youtube.YouTubeError, channels.ChannelError) as e:
        _err(e)


@app.put("/api/channels/{cid}")
def update_channel(cid: str, body: dict):
    try:
        return channels.update(cid, body)
    except channels.ChannelError as e:
        _err(e, 404)


@app.delete("/api/channels/{cid}")
def delete_channel(cid: str):
    channels.remove(cid)
    return {"ok": True}


# ---------------- jobs ----------------
class JobIn(BaseModel):
    script: str
    channel_id: str
    title_hint: str = ""
    make_long: bool = True
    make_short: bool = True


def _public(j: dict) -> dict:
    """List view without the heavy plan/scene data."""
    keep = ("id", "created", "updated", "title_hint", "channel_id", "status", "step", "progress", "message",
            "error", "warnings", "cost", "estimate", "long", "short", "make_long", "make_short")
    out = {k: j.get(k) for k in keep}
    out["title"] = ((j.get("plan") or {}).get("long_meta") or {}).get("title") or j["title_hint"] \
        or j["script"][:60]
    out["scenes"] = len(j.get("scenes") or [])
    return out


@app.get("/api/jobs")
def list_jobs():
    return [_public(j) for j in reversed(jobs.list_jobs())]


@app.post("/api/jobs")
def add_job(body: JobIn):
    try:
        return _public(jobs.add_job(body.script, body.channel_id, body.title_hint, body.make_long, body.make_short))
    except jobs.JobError as e:
        _err(e)


@app.post("/api/jobs/{jid}/retry")
def retry(jid: str):
    try:
        return _public(jobs.retry(jid))
    except (KeyError, jobs.JobError) as e:
        _err(e)


@app.post("/api/jobs/{jid}/stop")
def stop(jid: str):
    try:
        jobs.stop(jid)
    except KeyError as e:
        _err(e, 404)
    return {"ok": True}


@app.delete("/api/jobs/{jid}")
def delete(jid: str):
    try:
        jobs.delete(jid)
    except (KeyError, jobs.JobError) as e:
        _err(e)
    return {"ok": True}


@app.get("/api/jobs/{jid}/file/{kind}")
def job_file(jid: str, kind: str):
    try:
        j = jobs.get_job(jid)
    except KeyError:
        _err(KeyError("İş tapılmadı"), 404)
    path = {"long": j["long"].get("path"), "short": j["short"].get("path"), "thumb": j.get("thumb")}.get(kind)
    if not path or not Path(path).exists():
        _err(FileNotFoundError("Fayl yoxdur"), 404)
    return FileResponse(path, filename=Path(path).name)


@app.post("/api/open-output")
def open_output():
    folder = str(config.OUTPUT)
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


app.mount("/", StaticFiles(directory=STATIC, html=True), name="static")
