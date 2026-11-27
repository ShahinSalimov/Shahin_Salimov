"""Stages 4–5: content plan, production (long + Shorts) and publishing to YouTube.

Idea lifecycle:
  idea → approved → producing → ready → scheduled → published
                        ↘ failed (retried once in full-auto)      rejected (by user)
"""
from __future__ import annotations

import threading
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

try:
    from zoneinfo import ZoneInfo
except ImportError:  # pragma: no cover
    ZoneInfo = None  # type: ignore

from .. import media, pipeline, script, store
from . import ai, channel, db, ytapi

ACTIVE = ("idea", "approved")


# --------------------------------------------------------------------------- ideas
def _context(ch: dict) -> str:
    bp = ch["blueprint"]
    pat = bp.get("patterns") or {}
    best = []
    if ch.get("reports"):
        best = [f"{v['title']} ({v['views']} views, {v['kind']})" for v in ch["reports"][-1].get("winners", [])]
    used = [i["title"] for i in ch["ideas"]][-120:]
    return (
        f"Channel: {ch['name']} — {bp.get('tagline', '')}\nNiche: {ch['niche']}\nLanguage: {ch['language']}\n"
        f"Audience: {bp.get('audience', '')}\nTone: {bp.get('tone', '')}\n"
        f"Pillars: {[(p['name'], p.get('description', '')) for p in bp.get('pillars', [])]}\n"
        f"Pillar performance weights (1 = average, from analytics): {ch.get('pillar_weights') or 'no data yet'}\n"
        f"Title formulas that work in this niche: {pat.get('title_formulas') or bp.get('title_formulas')}\n"
        f"Angles that perform: {pat.get('content_angles')}\n"
        f"Lessons learned so far: {[l['text'] for l in ch.get('learnings', [])][-12:]}\n"
        f"Recent winners: {best or 'none yet'}\n"
        f"Already used titles (do not repeat or paraphrase): {used}"
    )


def generate_ideas(cid: str, n_long: int = 6, n_short: int = 12) -> list[dict]:
    ch = db.get_channel(cid)
    if ai.demo():
        base = len(ch["ideas"])
        raw = ([{"kind": "long", "title": f"Demo long idea {base + i + 1}: The hidden side of {ch['niche']}",
                 "hook": "What if the story you know is wrong?", "brief": f"Deep dive #{i + 1}",
                 "pillar": (ch["blueprint"].get("pillars") or [{"name": "Main"}])[i % max(1, len(ch["blueprint"].get("pillars") or [1]))]["name"],
                 "predicted": 60 + (i * 7) % 30} for i in range(n_long)]
               + [{"kind": "short", "title": f"Demo short {base + i + 1}: one fact about {ch['niche']}",
                   "hook": "Nobody believes this at first.", "brief": f"Fast fact #{i + 1}",
                   "pillar": "Top lists", "predicted": 55 + (i * 11) % 40} for i in range(n_short)])
        cost = None
    else:
        data, cost = ai.ask_json(
            "You are the head of content of a fast-growing faceless YouTube channel. You plan videos that "
            "maximize click-through and retention while staying original and valuable.",
            _context(ch) + f"\n\nPlan {n_long} long videos and {n_short} Shorts. Shorts can tease or expand a long "
            "video (set related_title). Mix pillars according to their weights.\n"
            'Return {"ideas": [{"kind": "long|short", "title": "final YouTube title in the channel language", '
            '"hook": "first sentence", "brief": "3-4 sentences: what the video covers and the story arc", '
            '"pillar": "pillar name", "predicted": 0-100 (expected performance vs channel average), '
            '"why": "short reason", "related_title": ""}]}', max_tokens=7000, temperature=0.9)
        raw = data.get("ideas", [])
    weights = ch.get("pillar_weights") or {}
    seen = {i["title"].strip().lower() for i in ch["ideas"]}
    new = []
    for it in raw:
        title = str(it.get("title", "")).strip()
        if not title or title.lower() in seen or it.get("kind") not in ("long", "short"):
            continue
        seen.add(title.lower())
        pred = float(it.get("predicted", 50))
        new.append({
            "id": db.new_id(), "kind": it["kind"], "title": title[:100], "hook": it.get("hook", ""),
            "brief": it.get("brief", ""), "pillar": it.get("pillar", ""), "why": it.get("why", ""),
            "related_title": it.get("related_title", ""), "predicted": pred,
            "priority": round(pred * float(weights.get(it.get("pillar", ""), 1.0)), 1),
            "status": "approved" if ch["autopilot"]["mode"] == "full" else "idea",
            "created": time.time(), "project_id": "", "attempts": 0, "error": "",
            "publish_at": "", "yt_id": "", "yt_url": "",
        })

    def upd(c):
        c["ideas"].extend(new)
        if cost:
            c.setdefault("costs", []).append({**cost, "t": time.time()})
        c["last_ideas_at"] = time.time()
    db.update_channel(cid, upd)
    db.log(cid, f"{len(new)} yeni ideya planlaşdırıldı "
                f"({sum(i['kind'] == 'long' for i in new)} long, {sum(i['kind'] == 'short' for i in new)} short)")
    return new


def set_idea(cid: str, iid: str, **fields) -> dict:
    out = {}

    def upd(c):
        for i in c["ideas"]:
            if i["id"] == iid:
                i.update(fields)
                out.update(i)
    db.update_channel(cid, upd)
    if not out:
        raise KeyError(iid)
    return out


def get_idea(ch: dict, iid: str) -> dict:
    i = next((x for x in ch["ideas"] if x["id"] == iid), None)
    if not i:
        raise KeyError(iid)
    return i


# --------------------------------------------------------------------------- production
def produce(cid: str, iid: str) -> str:
    ch = db.get_channel(cid)
    idea = get_idea(ch, iid)
    if idea["status"] in ("producing", "scheduled", "published"):
        raise RuntimeError("Bu ideya artıq istehsaldadır və ya yüklənib")
    brief = "\n".join(filter(None, [
        idea["brief"], f"Opening hook: {idea['hook']}" if idea.get("hook") else "",
        f"Content pillar: {idea['pillar']}" if idea.get("pillar") else "",
        f"Related long video: {idea['related_title']}" if idea.get("related_title") else ""]))
    proj = store.create_project(idea["title"], brief)
    st = channel.profile_settings(ch, idea["kind"])
    store.update_project(proj["id"], lambda p: p.update(
        settings=st, profile_id=ch["profiles"].get(idea["kind"], ""),
        salimoff={"channel_id": cid, "idea_id": iid, "kind": idea["kind"]}))
    set_idea(cid, iid, status="producing", project_id=proj["id"], error="", started=time.time())
    pipeline.start(proj["id"], "salimoff_produce", job_produce)
    db.log(cid, f"İstehsal başladı ({idea['kind']}): {idea['title']}")
    return proj["id"]


def job_produce(pid: str, ev: threading.Event) -> None:
    """Full pipeline + channel-specific metadata + thumbnail (long only)."""
    pipeline.job_full_auto(pid, ev)
    proj = store.get_project(pid)
    meta = dict(proj.get("metadata") or {})
    info = proj.get("salimoff") or {}
    try:
        ch = db.get_channel(info.get("channel_id", ""))
    except KeyError:
        ch = None
    if not meta.get("title"):
        meta, costs = script.youtube_metadata(proj)
        pipeline._add_costs(pid, costs)
    meta["title"] = (meta.get("title") or proj["title"])[:100]
    tags = list(meta.get("tags") or [])
    if ch:
        footer = f"\n\n{ch['blueprint'].get('tagline', '')}\n{ch['blueprint'].get('handle', '')}".rstrip()
        meta["description"] = (meta.get("description") or "") + footer
        tags = list(dict.fromkeys(tags + ch["blueprint"].get("keywords", [])[:8]))
    if info.get("kind") == "short":
        if "#shorts" not in meta["title"].lower() and len(meta["title"]) <= 92:
            meta["title"] += " #Shorts"
        meta["description"] = (meta.get("description") or "") + "\n#Shorts"
    meta["tags"] = tags[:30]
    store.update_project(pid, lambda p: p.update(metadata=meta))
    if info.get("kind") == "long" and meta.get("thumbnail_prompt"):
        pipeline._set_job(pid, progress=98, message="Thumbnail yaradılır")
        st = store.deep_merge(proj["settings"], {"visual": {"aspect": "16:9", "quality": "medium"}})
        style = store.find_style(st["visual"].get("style_id", "")) or {}
        prompt = (f"{style.get('prefix', '')} YouTube thumbnail, extremely high contrast, one dominant subject, "
                  f"bold composition, {meta['thumbnail_prompt']}. No text, no letters.").strip()
        try:
            cost = media.generate_image(prompt, store.project_dir(pid) / "thumbnail.png", st)
            pipeline._add_costs(pid, [cost])
            store.update_project(pid, lambda p: p.update(thumbnail="thumbnail.png"))
        except Exception as e:  # noqa: BLE001 - thumbnail is optional
            store.update_project(pid, lambda p: p.update(thumbnail_error=str(e)))


def sync_production(cid: str) -> None:
    """Move producing ideas to ready/failed according to their project job."""
    ch = db.get_channel(cid)
    for i in ch["ideas"]:
        if i["status"] != "producing" or not i.get("project_id"):
            continue
        try:
            p = store.get_project(i["project_id"])
        except (KeyError, ValueError):
            set_idea(cid, i["id"], status="failed", error="Layihə silinib")
            continue
        if pipeline.is_running(p["id"]):
            continue
        job = p.get("job") or {}
        if job.get("status") == "done" and p.get("output") and Path(p["output"]).exists():
            cost = round(sum(c["usd"] for c in p["costs"]), 4)
            set_idea(cid, i["id"], status="ready", error="", cost=cost,
                     duration=round((p.get("render_info") or {}).get("duration", 0), 1))
            db.log(cid, f"Video hazırdır ({i['kind']}, ${cost}): {i['title']}")
        elif job.get("status") in ("error", "stopped"):
            attempts = i.get("attempts", 0) + 1
            retry = attempts < 2 and ch["autopilot"]["mode"] == "full" and job.get("status") == "error"
            set_idea(cid, i["id"], status="approved" if retry else "failed", attempts=attempts,
                     error=job.get("error") or job.get("message", ""), project_id="" if retry else i["project_id"])
            db.log(cid, f"İstehsal alınmadı{' (yenidən cəhd olunacaq)' if retry else ''}: {i['title']} — "
                        f"{(job.get('error') or '')[:160]}", "error")


# --------------------------------------------------------------------------- schedule
def _tz(name: str):
    if ZoneInfo:
        try:
            return ZoneInfo(name)
        except Exception:  # noqa: BLE001 - unknown tz / tzdata missing
            pass
    return timezone(timedelta(hours=4))  # Asia/Baku fallback


def slot_days(per_week: int) -> list[tuple[int, int]]:
    """(weekday, index_in_day) pairs spread evenly over the week. Up to 2 per day."""
    per_week = max(0, min(14, int(per_week)))
    if per_week == 0:
        return []
    if per_week <= 7:
        return sorted({(round(i * 7 / per_week) % 7, 0) for i in range(per_week)})
    return [(d, 0) for d in range(7)] + [(round(i * 7 / (per_week - 7)) % 7, 1) for i in range(per_week - 7)]


def next_slots(ch: dict, kind: str, count: int, now: datetime | None = None) -> list[datetime]:
    ap = ch["autopilot"]
    tz = _tz(ap["timezone"])
    now = (now or datetime.now(timezone.utc)).astimezone(tz)
    per_week = ap["long_per_week"] if kind == "long" else ap["shorts_per_week"]
    hour = int(ap["publish_hour_long"] if kind == "long" else ap["publish_hour_short"])
    days = slot_days(per_week)
    taken = {i["publish_at"] for i in ch["ideas"] if i["kind"] == kind and i.get("publish_at")}
    out = []
    for d in range(0, 60):
        day = (now + timedelta(days=d)).date()
        for wd, idx in days:
            if day.weekday() != wd:
                continue
            t = datetime(day.year, day.month, day.day, (hour + 6 * idx) % 24, 0, tzinfo=tz)
            iso = t.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
            if t > now + timedelta(hours=2) and iso not in taken:
                out.append(t)
                if len(out) >= count:
                    return out
    return out


# --------------------------------------------------------------------------- upload
def upload(progress, cid: str, iid: str, publish_at: str = "") -> dict:
    ch = db.get_channel(cid)
    idea = get_idea(ch, iid)
    if idea["status"] != "ready":
        raise RuntimeError("Yalnız hazır videolar yüklənir")
    if not ch["youtube"]["connected"]:
        raise RuntimeError("Kanal YouTube-a qoşulmayıb")
    p = store.get_project(idea["project_id"])
    meta = p.get("metadata") or {}
    if not publish_at:
        slot = next_slots(ch, idea["kind"], 1)
        publish_at = slot[0].astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ") if slot else ""
    set_idea(cid, iid, status="uploading", publish_at=publish_at)
    progress(5, "YouTube-a yüklənir")
    thumb = store.project_dir(p["id"]) / p["thumbnail"] if p.get("thumbnail") else None
    try:
        res = ytapi.upload_video(cid, Path(p["output"]), title=meta.get("title") or p["title"],
                                 description=meta.get("description", ""), tags=meta.get("tags", []),
                                 publish_at=publish_at, privacy=ch["autopilot"]["privacy"],
                                 language=_lang(ch["language"]), thumbnail=thumb,
                                 progress=lambda pct: progress(5 + pct * 0.9, f"Yüklənir {pct}%"))
    except Exception as e:
        set_idea(cid, iid, status="ready", publish_at="", error=f"Upload: {e}", upload_failed_at=time.time())
        db.log(cid, f"Upload alınmadı: {idea['title']} — {e}", "error")
        raise
    when = datetime.fromisoformat(publish_at.replace("Z", "+00:00")) if publish_at else None
    status = "scheduled" if when and when > datetime.now(timezone.utc) else "published"
    set_idea(cid, iid, status=status, yt_id=res["id"], yt_url=res.get("url", ""), uploaded=time.time(), error="",
             thumbnail_error=res.get("thumbnail_error", ""))
    db.log(cid, f"YouTube-a yükləndi ({'planlı: ' + publish_at if status == 'scheduled' else 'dərc olundu'}): "
                f"{idea['title']}{' [demo]' if res.get('demo') else ''}")
    return res


def recover(cid: str) -> None:
    """After a restart: interrupted uploads go back to ready."""
    for i in db.get_channel(cid)["ideas"]:
        if i["status"] == "uploading":
            set_idea(cid, i["id"], status="ready", publish_at="", error="Upload: proqram bağlandığı üçün yarımçıq qaldı",
                     upload_failed_at=0)


def mark_published(cid: str) -> None:
    now = datetime.now(timezone.utc)
    ch = db.get_channel(cid)
    for i in ch["ideas"]:
        if i["status"] == "scheduled" and i.get("publish_at"):
            if datetime.fromisoformat(i["publish_at"].replace("Z", "+00:00")) <= now:
                set_idea(cid, i["id"], status="published")


def spent_today(ch: dict) -> float:
    start = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0).timestamp()
    total = sum(c["usd"] for c in ch.get("costs", []) if c.get("t", 0) >= start)
    for i in ch["ideas"]:
        if i.get("project_id") and i.get("started", 0) >= start - 86400:
            try:
                total += sum(c["usd"] for c in store.get_project(i["project_id"])["costs"] if c.get("t", 0) >= start)
            except (KeyError, ValueError):
                pass
    return round(total, 4)


def _lang(language: str) -> str:
    from .research import _lang_code
    return _lang_code(language)
