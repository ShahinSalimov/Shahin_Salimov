"""My channels: per-channel strategy kit, daily ideas, scripts on command, auto schedule.

A channel stores everything the strategy produced for it (niche, positioning, description, keywords,
default tags, title rules...). Every idea, script and SEO pack for that channel is generated from this kit.
"""
from __future__ import annotations

import copy
import threading
import time
import traceback
import uuid
from datetime import datetime

from . import research, script, store

DEFAULT_CHANNEL = {
    "name": "", "handle": "", "niche": "", "language": "English", "lang_code": "en", "region": "US",
    "profile_id": "",  # settings profile (voice, visual style, script rules) used for this channel's videos
    "kit": {
        "positioning": "", "audience": "", "channel_description": "", "channel_keywords": [],
        "default_tags": [], "description_footer": "", "title_rules": "", "thumbnail_style": "",
        "content_pillars": [], "video_length": "", "upload_plan": "", "avoid": [], "monetization": [], "kpis": [],
        "avatar_prompt": "", "banner_prompt": "",
    },
    "auto": {"enabled": False, "time": "09:00", "count": 5, "scripts": 1, "last_date": ""},
    "upload": {"privacy": "private", "category_id": "22", "made_for_kids": False, "synthetic": True,
               "auto": False, "publish_time": "", "thumbnail": True},
    "youtube": {"channel_id": "", "title": "", "connected_at": 0},
}

_path = lambda: store.DATA / "channels.json"  # noqa: E731


# ---------------- storage ----------------
def _ideas_path(cid: str):
    if not cid.isalnum():
        raise KeyError(cid)
    return store.DATA / "channel_ideas" / f"{cid}.json"


def list_channels() -> list[dict]:
    return [store.deep_merge(DEFAULT_CHANNEL, c) for c in store._read(_path(), [])]


def get(cid: str) -> dict:
    for c in list_channels():
        if c["id"] == cid:
            return c
    raise KeyError(cid)


def save(data: dict) -> dict:
    with store._lock:
        items = store._read(_path(), [])
        if not data.get("id"):
            data = store.deep_merge(DEFAULT_CHANNEL, data)
            data.update(id=uuid.uuid4().hex[:10], created=time.time())
            items.append(data)
            out = data
        else:
            for i, c in enumerate(items):
                if c["id"] == data["id"]:
                    items[i] = out = store.deep_merge(store.deep_merge(DEFAULT_CHANNEL, c), data)
                    break
            else:
                raise KeyError(data["id"])
        store._write(_path(), items)
        return out


def delete(cid: str) -> None:
    with store._lock:
        store._write(_path(), [c for c in store._read(_path(), []) if c["id"] != cid])
        _ideas_path(cid).unlink(missing_ok=True)


def ideas(cid: str) -> list[dict]:
    return store._read(_ideas_path(cid), [])


def update_ideas(cid: str, fn) -> list[dict]:
    with store._lock:
        items = ideas(cid)
        fn(items)
        store._write(_ideas_path(cid), items)
        return items


def get_idea(cid: str, iid: str) -> dict:
    for i in ideas(cid):
        if i["id"] == iid:
            return i
    raise KeyError(iid)


def patch_idea(cid: str, iid: str, **kw) -> None:
    update_ideas(cid, lambda items: [i.update(kw) for i in items if i["id"] == iid])


def channel_settings(ch: dict) -> dict:
    """Settings used for this channel's videos: its profile (if linked) + its language."""
    st = store.get_settings()
    for p in store.list_profiles():
        if p["id"] == ch.get("profile_id"):
            st = store.deep_merge(store.DEFAULT_SETTINGS, p["settings"])
            st["demo_mode"] = store.get_settings()["demo_mode"]  # demo switch is global
            break
    st = copy.deepcopy(st)
    st["script"]["language"] = ch.get("language") or st["script"]["language"]
    return st


# ---------------- create from a niche research ----------------
def from_research(rid: str, name: str = "", handle: str = "") -> dict:
    doc = research.get(rid)
    if doc.get("kind") != "niche" or doc.get("status") != "done":
        raise ValueError("Yalnız hazır niş araşdırmasından kanal yaratmaq olar")
    w = (doc.get("result") or {}).get("winner", {})
    first = (w.get("channel_names") or [{}])[0]
    p = doc.get("params", {})
    cfg = store.get_settings()["research"]
    kit = {k: w.get(k) for k in ("positioning", "channel_description", "channel_keywords", "content_pillars",
                                 "video_length", "upload_plan", "avoid", "monetization", "kpis",
                                 "avatar_prompt", "banner_prompt") if w.get(k)}
    return save({
        "name": name or first.get("name", "Yeni kanal"), "handle": (handle or first.get("handle", "")).lstrip("@"),
        "niche": w.get("niche", ""), "language": p.get("language") or cfg["content_language"],
        "region": p.get("region") or cfg["region"], "lang_code": cfg["lang_code"], "kit": kit,
        "research_id": rid,
    })


def context(ch: dict) -> str:
    """The channel kit as text for every LLM call about this channel."""
    k = ch["kit"]
    pillars = "; ".join(f"{x.get('name')} ({x.get('purpose')})" if isinstance(x, dict) else str(x)
                        for x in k.get("content_pillars", []))
    return (f"CHANNEL: {ch['name']} (@{ch['handle']})\nNiche: {ch['niche']}\nPositioning: {k.get('positioning')}\n"
            f"Audience: {k.get('audience')}\nContent pillars: {pillars}\nTitle rules: {k.get('title_rules')}\n"
            f"Thumbnail style: {k.get('thumbnail_style')}\nVideo length: {k.get('video_length')}\n"
            f"Avoid: {'; '.join(k.get('avoid', []))}")


# ---------------- jobs (run through research.start so the UI can poll them) ----------------
def job_kit(params: dict, progress):
    """Fill / regenerate the channel's full strategy kit."""
    ch = get(params["channel_id"])
    cfg = research._cfg()
    if cfg["demo"]:
        kit = {"audience": "DEMO auditoriya", "default_tags": [ch["niche"] or "demo", "ai video"],
               "description_footer": "\n\nSubscribe for more.\n#demo", "title_rules": "DEMO: qısa, maraq yaradan",
               "thumbnail_style": "DEMO", "positioning": ch["kit"].get("positioning") or "DEMO pozisiya",
               "channel_description": ch["kit"].get("channel_description") or "DEMO description"}
        save({"id": ch["id"], "kit": kit})
        return {"kit": kit}, {"notes": ["DEMO rejimi"]}, []
    progress(20, "Kanal paketi yazılır")
    res, c = research._ask(cfg, f"""{context(ch)}
Existing kit (keep what is good, fill what is missing, improve weak parts): {ch['kit']}
Audience language: {ch['language']}; country: {ch['region']}.
{research._lang_line(cfg, ch['language'])}
Return JSON:
{{"positioning": "...", "audience": "who exactly, age, interests, why they watch",
 "channel_description": "About section 600-900 chars in {ch['language']}",
 "channel_keywords": ["10 channel keywords"],
 "default_tags": ["8-10 broad channel tags added to every video"],
 "description_footer": "text appended to every video description in {ch['language']}: subscribe line, short channel pitch, 3 channel hashtags, AI-content disclosure line",
 "title_rules": "5 concrete rules for this channel's titles",
 "thumbnail_style": "consistent thumbnail style for brand recognition",
 "content_pillars": [{{"name": "...", "purpose": "search|browse|subscribe", "example": "title"}}],
 "video_length": "...", "upload_plan": "...", "avoid": ["..."], "monetization": ["..."], "kpis": ["..."],
 "avatar_prompt": "English prompt", "banner_prompt": "English prompt, no text"}}""", 8000)
    save({"id": ch["id"], "kit": res})
    return {"kit": res}, {}, [c]


def job_ideas(params: dict, progress):
    """New ideas for a channel, never repeating ones already in its list."""
    ch = get(params["channel_id"])
    existing = [i["title"] for i in ideas(ch["id"])][-80:]
    kws = ", ".join(ch["kit"].get("channel_keywords", [])[:3])
    res, data, costs = research.job_ideas({
        "niche": ch["niche"], "keywords": kws, "positioning": ch["kit"].get("positioning", ""),
        "language": ch["language"], "region": ch["region"], "count": params.get("count", 5),
        "channel_context": context(ch), "exclude": existing,
    }, progress)
    batch = time.strftime("%Y-%m-%d")
    new = [{**x, "id": uuid.uuid4().hex[:10], "date": batch, "status": "new", "script": "", "seo": None,
            "project_id": ""} for x in res.get("ideas", []) if x.get("title") not in existing]
    update_ideas(ch["id"], lambda items: items.extend(new))
    n_scripts = int(params.get("scripts") or 0)
    for k, idea in enumerate(sorted(new, key=lambda x: -(x.get("score") or 0))[:n_scripts]):
        progress(80 + 15 * k / max(1, n_scripts), f"Ssenari yazılır: {idea['title'][:50]}")
        _, _, c = job_script({"channel_id": ch["id"], "idea_id": idea["id"]}, lambda *a: None)
        costs += c
    return {"added": len(new), "ideas": new}, data, costs


def _brief(idea: dict) -> str:
    return (f"{idea.get('angle', '')}\n\nOpening hook (use it): {idea.get('hook', '')}\n\n"
            f"Structure: {' -> '.join(idea.get('outline') or [])}").strip()


def job_script(params: dict, progress):
    ch = get(params["channel_id"])
    idea = get_idea(ch["id"], params["idea_id"])
    st = channel_settings(ch)
    if params.get("minutes"):
        st["script"]["target_minutes"] = float(params["minutes"])
    elif idea.get("length_min"):
        st["script"]["target_minutes"] = float(idea["length_min"])
    progress(10, f"Ssenari yazılır (~{st['script']['target_minutes']} dəq)")
    brief = _brief(idea) + f"\n\n{context(ch)}"
    text, costs = script.write_script(idea["title"], brief, st)
    patch_idea(ch["id"], idea["id"], script=text, status="script" if idea["status"] == "new" else idea["status"])
    return {"idea_id": idea["id"], "script": text}, {}, costs


def job_command(params: dict, progress):
    """Free command, e.g. 'write a script about the Roman legion that vanished' -> idea + script."""
    ch = get(params["channel_id"])
    cmd = (params.get("text") or "").strip()
    if not cmd:
        raise research.ResearchError("Komanda yazın: məsələn 'X haqqında 10 dəqiqəlik ssenari yaz'")
    cfg = research._cfg()
    if cfg["demo"]:
        idea = {"title": cmd[:80], "angle": "DEMO", "hook": "What if...", "outline": ["Hook", "Story", "End"],
                "type": "browse", "score": 7, "length_min": params.get("minutes") or 2}
        costs = []
    else:
        progress(5, "Komanda kanal üçün ideyaya çevrilir")
        idea, c = research._ask(cfg, f"""{context(ch)}
The creator's command: "{cmd}"
Turn it into ONE strong video for this channel (fit the niche, positioning and title rules).
{research._lang_line(cfg, ch['language'])}
Return {{"title": "...", "alt_titles": ["2"], "type": "search|browse|series", "angle": "...",
"hook": "first 10-15 seconds word for word", "outline": ["5-8 beats"], "target_keyword": "...",
"length_min": number, "thumbnail": "...", "score": 1-10, "why": "..."}}""", 3000)
        costs = [c]
    idea.update(id=uuid.uuid4().hex[:10], date=time.strftime("%Y-%m-%d"), status="new", script="", seo=None,
                project_id="", command=cmd)
    update_ideas(ch["id"], lambda items: items.append(idea))
    _, _, c2 = job_script({"channel_id": ch["id"], "idea_id": idea["id"], "minutes": params.get("minutes")},
                          lambda pct, msg: progress(20 + pct * 0.8, msg))
    return {"idea_id": idea["id"], "title": idea["title"]}, {}, costs + c2


def job_seo(params: dict, progress):
    ch = get(params["channel_id"])
    idea = get_idea(ch["id"], params["idea_id"])
    res, data, costs = research.job_seo({
        "title": idea["title"], "keyword": idea.get("target_keyword", ""), "niche": ch["niche"],
        "language": ch["language"], "context": (idea.get("script") or _brief(idea))[:4000],
        "channel": ch,
    }, progress)
    patch_idea(ch["id"], idea["id"], seo=res)
    return res, data, costs


research.JOBS.update({"channel_kit": job_kit, "channel_ideas": job_ideas, "channel_script": job_script,
                      "channel_command": job_command, "channel_seo": job_seo})


def idea_to_project(cid: str, iid: str, auto: bool = False) -> dict:
    ch = get(cid)
    idea = get_idea(cid, iid)
    seo = idea.get("seo") or {}
    p = store.create_project(seo.get("recommended_title") or idea["title"], _brief(idea))
    st = channel_settings(ch)
    if idea.get("length_min"):
        st["script"]["target_minutes"] = float(idea["length_min"])
    meta = None
    if seo:
        meta = {"title": seo.get("recommended_title") or idea["title"], "description": seo.get("description", ""),
                "tags": seo.get("tags", []), "thumbnail_prompt": seo.get("thumbnail_prompt", "")}
    p = store.update_project(p["id"], lambda x: x.update(settings=st, script=idea.get("script", ""), metadata=meta,
                                                         channel_id=cid, idea_id=iid, profile_id=ch["profile_id"]))
    patch_idea(cid, iid, project_id=p["id"], status="project")
    return p


# ---------------- daily scheduler (runs while the app is open) ----------------
def due_channels(now: datetime | None = None) -> list[dict]:
    now = now or datetime.now()
    today, hhmm = now.strftime("%Y-%m-%d"), now.strftime("%H:%M")
    return [c for c in list_channels()
            if c["auto"]["enabled"] and c["auto"]["last_date"] != today and hhmm >= (c["auto"]["time"] or "09:00")]


def run_due(now: datetime | None = None) -> list[str]:
    started = []
    for ch in due_channels(now):
        save({"id": ch["id"], "auto": {"last_date": (now or datetime.now()).strftime("%Y-%m-%d")}})
        doc = research.start("channel_ideas", {"channel_id": ch["id"], "count": ch["auto"]["count"],
                                               "scripts": ch["auto"]["scripts"],
                                               "title": f"{ch['name']}: gündəlik ideyalar"})
        started.append(doc["id"])
    return started


def scheduler(stop: threading.Event) -> None:
    while not stop.wait(60):
        try:
            run_due()
        except Exception:  # noqa: BLE001 - never kill the loop
            traceback.print_exc()
