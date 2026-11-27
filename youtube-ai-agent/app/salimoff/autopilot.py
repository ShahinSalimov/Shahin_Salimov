"""The decision engine: a background loop that runs every channel on autopilot.

Each tick, per channel:
  1. sync finished/failed productions
  2. mark scheduled videos whose publish time passed as published
  3. keep the idea backlog full (generate new ideas using the latest learnings)
  4. keep a buffer of ready videos (long + Shorts) within the daily budget
  5. upload ready videos into the next free publishing slots
  6. every N days build the growth report (which re-weights the plan)
"""
from __future__ import annotations

import os
import threading
import time
import traceback

from . import db, jobs, planner, reports

_thread: threading.Thread | None = None
_stop = threading.Event()
IDEA_RETRY_SECONDS = 1800


def tick(cid: str) -> list[str]:
    """One decision step for a channel. Returns the decisions taken (for logs/tests)."""
    did: list[str] = []
    planner.sync_production(cid)
    planner.mark_published(cid)
    ch = db.get_channel(cid)
    ap = ch["autopilot"]
    if not ap["enabled"] or ch["status"] not in ("ready", "active"):
        return did
    ideas = ch["ideas"]

    def count(kind, *statuses):
        return sum(1 for i in ideas if i["kind"] == kind and i["status"] in statuses)

    # 3. backlog
    need_long = count("long", "idea", "approved") < ap["buffer_long"] + 1
    need_short = ap["shorts_per_week"] > 0 and count("short", "idea", "approved") < ap["buffer_short"] + 1
    if (need_long or need_short) and time.time() - ch.get("last_ideas_at", 0) > IDEA_RETRY_SECONDS \
            and not jobs.running(f"ideas:{cid}"):
        jobs.start(f"ideas:{cid}", lambda p: planner.generate_ideas(cid, 6 if need_long else 0, 12 if need_short else 0))
        db.update_channel(cid, lambda c: c.__setitem__("last_ideas_at", time.time()))
        did.append("ideas")

    # 4. production
    producing = sum(1 for i in ideas if i["status"] == "producing")
    if producing < ap["max_parallel"]:
        spent = planner.spent_today(ch)
        if spent >= float(ap["daily_budget_usd"]):
            if ch.get("budget_warned") != time.strftime("%Y-%m-%d"):
                db.log(cid, f"Gündəlik büdcə limiti (${ap['daily_budget_usd']}) doldu: ${spent}. İstehsal sabaha qədər dayandı.", "warn")
                db.update_channel(cid, lambda c: c.__setitem__("budget_warned", time.strftime("%Y-%m-%d")))
        else:
            # choose the kind whose ready buffer is emptiest relative to its target
            gaps = []
            for kind, buf in (("long", ap["buffer_long"]), ("short", ap["buffer_short"])):
                if kind == "short" and ap["shorts_per_week"] == 0:
                    continue
                have = count(kind, "producing", "ready", "uploading")
                if have < buf:
                    gaps.append(((have / max(buf, 1)), kind))
            for _, kind in sorted(gaps):
                allowed = ("approved", "idea") if ap["mode"] == "full" else ("approved",)
                pool = sorted((i for i in ideas if i["kind"] == kind and i["status"] in allowed),
                              key=lambda i: -i.get("priority", 0))
                if pool:
                    try:
                        planner.produce(cid, pool[0]["id"])
                        did.append(f"produce:{kind}")
                    except Exception as e:  # noqa: BLE001
                        planner.set_idea(cid, pool[0]["id"], status="failed", error=str(e))
                        db.log(cid, f"İstehsala başlamaq olmadı: {e}", "error")
                    break

    # 5. uploads
    ch = db.get_channel(cid)
    if ap["auto_upload"] and ch["youtube"]["connected"]:
        for i in ch["ideas"]:
            failed_recently = i.get("error", "").startswith("Upload") and time.time() - i.get("upload_failed_at", 0) < 3600
            if i["status"] == "ready" and not jobs.running(f"upload:{cid}") and not failed_recently:
                jobs.start(f"upload:{cid}", planner.upload, cid, i["id"])
                did.append("upload")
                break

    # 6. report
    if time.time() - ch.get("last_report_at", 0) >= float(ap["report_every_days"]) * 86400 \
            and any(i.get("yt_id") for i in ch["ideas"]) and not jobs.running(f"report:{cid}"):
        jobs.start(f"report:{cid}", reports.generate, cid)
        did.append("report")
    if did and ch["status"] == "ready":
        db.update_channel(cid, lambda c: c.__setitem__("status", "active"))
    return did


def tick_all() -> None:
    for ch in db.list_channels():
        try:
            tick(ch["id"])
        except Exception as e:  # noqa: BLE001 - one channel must not stop the others
            traceback.print_exc()
            db.log(ch["id"], f"Autopilot xətası: {e}", "error")


def _loop() -> None:
    while not _stop.is_set():
        sysc = db.get_system()
        if sysc["scheduler_enabled"]:
            tick_all()
        _stop.wait(max(15, int(sysc["tick_seconds"])))


def start() -> None:
    global _thread
    if os.environ.get("YTA_SCHEDULER", "1") == "0" or (_thread and _thread.is_alive()):
        return
    _stop.clear()
    _thread = threading.Thread(target=_loop, daemon=True, name="salimoff-autopilot")
    _thread.start()


def stop() -> None:
    _stop.set()
