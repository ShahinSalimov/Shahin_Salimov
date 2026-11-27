"""HTTP API of SALIMOFF AI YOUTUBE (mounted under /api/salimoff)."""
from __future__ import annotations

import time

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse, HTMLResponse, RedirectResponse

from .. import store
from . import autopilot, channel, db, jobs, orchestrator, planner, reports, research, ytapi

router = APIRouter(prefix="/api/salimoff")


def _ch(cid: str) -> dict:
    try:
        return db.get_channel(cid)
    except KeyError:
        raise HTTPException(404, "Kanal tapılmadı")


def _start(key: str, fn, *args, **kw):
    try:
        jobs.start(key, fn, *args, **kw)
    except jobs.Busy as e:
        raise HTTPException(409, str(e))
    return {"ok": True, "job": key}


def startup() -> None:
    for ch in db.list_channels():
        planner.recover(ch["id"])
    autopilot.start()


# ---------------- overview ----------------
@router.get("/overview")
def overview():
    out = []
    for ch in db.list_channels():
        ideas = ch["ideas"]
        st = {s: sum(1 for i in ideas if i["status"] == s) for s in
              ("idea", "approved", "producing", "ready", "scheduled", "published", "failed")}
        last = ch["reports"][-1] if ch.get("reports") else None
        out.append({
            "id": ch["id"], "name": ch["name"], "niche": ch["niche"], "language": ch["language"],
            "status": ch["status"], "autopilot": ch["autopilot"], "youtube": ch["youtube"], "counts": st,
            "logo": bool(ch["assets"].get("logo")), "spent_today": planner.spent_today(ch),
            "last_report": {"created": last["created"], "kpis": last["kpis"], "deltas": last["deltas"]} if last else None,
            "next_report_at": (ch.get("last_report_at") or 0) + ch["autopilot"]["report_every_days"] * 86400,
            "log": ch["log"][-5:],
        })
    sysc = db.get_system()
    keys = store.get_keys()
    return {"channels": out, "system": sysc, "demo_mode": store.get_settings()["demo_mode"],
            "ready": {"youtube_api_key": bool(keys.get("youtube_api_key")), "oauth": ytapi.oauth_ready(),
                      "llm": bool(keys.get(store.get_settings()["script"]["llm_provider"])),
                      "images": bool(keys.get("openai")), "voice": bool(keys.get("fish") or keys.get("elevenlabs"))},
            "research": research_list()[:5]}


@router.get("/jobs/{key:path}")
def job_status(key: str):
    return jobs.status(key)


@router.put("/system")
def put_system(body: dict):
    return db.save_system(body)


# ---------------- research ----------------
@router.get("/research")
def research_list():
    return db.list_research()


@router.post("/research")
def research_start(body: dict):
    r = research.new_research(body or {})

    def fail(e):
        r2 = db.get_research(r["id"])
        r2.update(status="error", error=str(e))
        db.save_research(r2)
    _start(f"research:{r['id']}", research.run, r["id"], on_error=fail)
    return {"id": r["id"], "job": f"research:{r['id']}"}


@router.get("/research/{rid}")
def research_get(rid: str):
    try:
        r = db.get_research(rid)
    except KeyError:
        raise HTTPException(404, "Analiz tapılmadı")
    r["job"] = jobs.status(f"research:{rid}")
    r["weights"], r["labels"] = research.WEIGHTS, research.LABELS
    return r


@router.post("/research/{rid}/choose")
def research_choose(rid: str, body: dict):
    try:
        return research.choose(rid, body.get("niche", ""))
    except KeyError:
        raise HTTPException(404, "Niş tapılmadı")


@router.post("/research/{rid}/build-channel")
def research_build(rid: str, body: dict | None = None):
    return _start(f"build:{rid}", channel.build, rid, (body or {}).get("niche", ""))


@router.post("/launch")
def launch(body: dict):
    """The whole system in one click: analyze → decide → build → plan → autopilot."""
    key = f"launch:{int(time.time())}"
    return _start(key, orchestrator.launch, body.get("input") or {}, body.get("mode", "approve"))


# ---------------- channels ----------------
@router.get("/channels/{cid}")
def channel_get(cid: str):
    ch = _ch(cid)
    ch["spent_today"] = planner.spent_today(ch)
    ch["upcoming_slots"] = {k: [t.isoformat() for t in planner.next_slots(ch, k, 6)] for k in ("long", "short")}
    ch["jobs"] = {k: jobs.status(f"{k}:{cid}") for k in ("ideas", "upload", "report", "materialize", "branding")}
    ch["total_cost"] = round(sum(c["usd"] for c in ch.get("costs", [])) +
                             sum(i.get("cost", 0) for i in ch["ideas"]), 3)
    for r in ch.get("reports", []):
        r.pop("videos", None)  # keep the payload small; full report via /reports/{id}
    return ch


@router.put("/channels/{cid}")
def channel_put(cid: str, body: dict):
    _ch(cid)
    allowed_ap = set(db.DEFAULT_AUTOPILOT)

    def upd(c):
        if "autopilot" in body:
            c["autopilot"].update({k: v for k, v in body["autopilot"].items() if k in allowed_ap})
        for k in ("name", "checklist"):
            if k in body:
                c[k] = body[k]
        if "blueprint" in body and isinstance(body["blueprint"], dict):
            c["blueprint"].update(body["blueprint"])
    return db.update_channel(cid, upd)


@router.delete("/channels/{cid}")
def channel_delete(cid: str):
    _ch(cid)
    db.delete_channel(cid)
    return {"ok": True}


@router.post("/channels/{cid}/rematerialize")
def channel_rematerialize(cid: str):
    _ch(cid)
    return _start(f"materialize:{cid}", channel.materialize, cid)


@router.post("/channels/{cid}/tick")
def channel_tick(cid: str):
    _ch(cid)
    return {"did": autopilot.tick(cid)}


@router.get("/channels/{cid}/asset/{key}")
def channel_asset(cid: str, key: str):
    if key not in ("logo", "banner"):
        raise HTTPException(400, "key")
    _ch(cid)
    p = channel.asset_path(cid, key)
    if not p:
        raise HTTPException(404, "yoxdur")
    return FileResponse(p)


# ---------------- ideas / production / upload ----------------
@router.post("/channels/{cid}/ideas/generate")
def ideas_generate(cid: str, body: dict | None = None):
    _ch(cid)
    b = body or {}
    return _start(f"ideas:{cid}", lambda p: planner.generate_ideas(cid, int(b.get("long", 6)), int(b.get("short", 12))))


@router.post("/channels/{cid}/ideas")
def idea_add(cid: str, body: dict):
    _ch(cid)
    if body.get("kind") not in ("long", "short") or not body.get("title", "").strip():
        raise HTTPException(400, "kind və title lazımdır")
    idea = {"id": db.new_id(), "kind": body["kind"], "title": body["title"].strip()[:100], "hook": body.get("hook", ""),
            "brief": body.get("brief", ""), "pillar": body.get("pillar", ""), "why": "manual", "related_title": "",
            "predicted": 70, "priority": 70, "status": "approved", "created": time.time(), "project_id": "",
            "attempts": 0, "error": "", "publish_at": "", "yt_id": "", "yt_url": ""}
    db.update_channel(cid, lambda c: c["ideas"].append(idea))
    return idea


@router.put("/channels/{cid}/ideas/{iid}")
def idea_put(cid: str, iid: str, body: dict):
    _ch(cid)
    fields = {k: v for k, v in body.items() if k in ("title", "hook", "brief", "pillar", "kind", "priority")}
    if "status" in body:
        if body["status"] not in ("idea", "approved", "rejected", "ready"):
            raise HTTPException(400, "status")
        fields["status"] = body["status"]
        if body["status"] == "ready":
            fields["error"] = ""
    try:
        return planner.set_idea(cid, iid, **fields)
    except KeyError:
        raise HTTPException(404, "İdeya tapılmadı")


@router.post("/channels/{cid}/ideas/{iid}/produce")
def idea_produce(cid: str, iid: str):
    _ch(cid)
    try:
        return {"project_id": planner.produce(cid, iid)}
    except (KeyError, RuntimeError) as e:
        raise HTTPException(409, str(e))


@router.post("/channels/{cid}/ideas/{iid}/upload")
def idea_upload(cid: str, iid: str, body: dict | None = None):
    _ch(cid)
    return _start(f"upload:{cid}", planner.upload, cid, iid, (body or {}).get("publish_at", ""))


# ---------------- YouTube connection ----------------
@router.post("/channels/{cid}/connect")
def yt_connect(cid: str, body: dict | None = None):
    _ch(cid)
    if (body or {}).get("demo") or store.get_settings()["demo_mode"]:
        ytapi.connect_demo(cid)
        return {"connected": True, "demo": True}
    try:
        return {"auth_url": ytapi.auth_url(cid)}
    except ytapi.YTError as e:
        raise HTTPException(400, str(e))


@router.get("/oauth/callback")
def oauth_callback(code: str = "", state: str = "", error: str = ""):
    if error:
        return HTMLResponse(f"<p>Google icazə vermədi: {error}</p><a href='/'>Geri</a>", 400)
    try:
        cid = ytapi.finish_oauth(code, state)
    except ytapi.YTError as e:
        return HTMLResponse(f"<p>Qoşulma alınmadı: {e}</p><a href='/'>Geri</a>", 400)
    return RedirectResponse(f"/#/channel/{cid}/settings")


@router.post("/channels/{cid}/disconnect")
def yt_disconnect(cid: str):
    _ch(cid)
    ytapi.disconnect(cid)
    return {"ok": True}


@router.post("/channels/{cid}/branding")
def yt_branding(cid: str):
    ch = _ch(cid)
    if not ch["youtube"]["connected"]:
        raise HTTPException(400, "Əvvəlcə YouTube-a qoşun")

    def job(progress):
        msg = ytapi.sync_branding(cid, ch["blueprint"].get("description", ""), ch["blueprint"].get("keywords", []),
                                  channel.asset_path(cid, "banner"))
        db.update_channel(cid, lambda c: c["youtube"].update(branding_synced=True))
        db.log(cid, msg)
        return msg
    return _start(f"branding:{cid}", job)


# ---------------- reports ----------------
@router.post("/channels/{cid}/reports")
def report_now(cid: str):
    _ch(cid)
    return _start(f"report:{cid}", reports.generate, cid)


@router.get("/channels/{cid}/reports/{rid}")
def report_get(cid: str, rid: str, format: str = "json"):  # noqa: A002
    ch = _ch(cid)
    rep = next((r for r in ch.get("reports", []) if r["id"] == rid), None)
    if not rep:
        raise HTTPException(404, "Hesabat tapılmadı")
    if format == "html":
        return HTMLResponse(reports.to_html(ch, rep))
    return rep
