"""Trend channel finder: successful YouTube channels of the last N months (YouTube Data API v3).

Flow: keyword -> most viewed videos published in the period (search.list) -> their channels
(channels.list) -> filter (new channels only / all) -> growth score -> ranked list.
Results are stored in data/trends.json; video ideas are generated from them with the script LLM.
"""
from __future__ import annotations

import csv
import io
import math
import random
import time
from datetime import datetime, timedelta, timezone

import httpx

from . import llm, store

API = "https://www.googleapis.com/youtube/v3"

DEFAULT_KEYWORDS = [
    "AI tools", "AI video", "ChatGPT", "AI automation", "AI news",
    "make money online", "side hustle", "business ideas",
    "faceless channel", "AI shorts", "motivation shorts", "AI story",
]


class TrendError(RuntimeError):
    pass


def _get(endpoint: str, params: dict, key: str) -> dict:
    try:
        r = httpx.get(f"{API}/{endpoint}", params={**params, "key": key}, timeout=30)
    except httpx.HTTPError as e:
        raise TrendError(f"YouTube bağlantı xətası: {e}") from e
    if r.status_code != 200:
        try:
            err = r.json()["error"]
            reason = (err.get("errors") or [{}])[0].get("reason", "")
            msg = err.get("message", "")
        except Exception:
            reason, msg = "", r.text[:200]
        if reason in ("quotaExceeded", "dailyLimitExceeded"):
            raise TrendError("quota: YouTube API gündəlik kvotası bitdi (sabah yenilənir)")
        if r.status_code in (400, 403) and ("key" in msg.lower() or reason == "keyInvalid"):
            raise TrendError("YouTube API açarı qəbul edilmədi")
        raise TrendError(f"YouTube xətası {r.status_code}: {msg}")
    return r.json()


def test_key(key: str) -> str:
    _get("videoCategories", {"part": "snippet", "regionCode": "US"}, key)
    return "Bağlantı uğurludur (YouTube Data API v3)"


def score(subs: int, views: int, videos: int, age_days: float) -> float:
    """Daily subscribers, daily views and views per video on a log scale."""
    age = max(age_days, 1)
    return round(2.0 * math.log10(1 + subs / age)
                 + 1.5 * math.log10(1 + views / age)
                 + 1.0 * math.log10(1 + views / max(videos, 1)), 2)


def _search(keyword: str, since: datetime, key: str, opts: dict) -> list[dict]:
    params = {
        "part": "snippet", "type": "video", "q": keyword, "order": "viewCount", "maxResults": 50,
        "publishedAfter": since.strftime("%Y-%m-%dT%H:%M:%SZ"),
    }
    if opts.get("region"):
        params["regionCode"] = opts["region"].upper()
    if opts.get("language"):
        params["relevanceLanguage"] = opts["language"].lower()
    if opts.get("duration") in ("short", "medium", "long"):
        params["videoDuration"] = opts["duration"]
    return _get("search", params, key).get("items", [])


def find_channels(opts: dict, key: str) -> dict:
    keywords = [k.strip() for k in (opts.get("keywords") or DEFAULT_KEYWORDS) if k.strip()][:25]
    months = float(opts.get("months") or 6)
    mode = opts.get("mode") or "new"
    min_subs = int(opts.get("min_subs") or 0)
    limit = int(opts.get("limit") or 50)
    now = datetime.now(timezone.utc)
    since = now - timedelta(days=months * 30.44)

    pool: dict[str, dict] = {}
    warnings: list[str] = []
    for kw in keywords:
        try:
            items = _search(kw, since, key, opts)
        except TrendError as e:
            warnings.append(f"{kw}: {e}")
            if str(e).startswith("quota"):
                break
            continue
        for it in items:
            sn = it["snippet"]
            p = pool.setdefault(sn["channelId"], {"keywords": set(), "videos": []})
            p["keywords"].add(kw)
            if len(p["videos"]) < 3:
                p["videos"].append({"title": sn["title"], "published": sn["publishedAt"][:10],
                                    "url": f"https://www.youtube.com/watch?v={it['id']['videoId']}"})
    if not pool and warnings:
        raise TrendError(warnings[0])

    rows = []
    ids = list(pool)
    for i in range(0, len(ids), 50):
        for ch in _get("channels", {"part": "snippet,statistics", "id": ",".join(ids[i:i + 50])}, key).get("items", []):
            rows.extend(_row(ch, pool[ch["id"]], now, since, mode, min_subs))
    rows.sort(key=lambda r: r["score"], reverse=True)
    return _result(opts, keywords, rows[:limit], warnings, len(pool))


def _row(ch: dict, info: dict, now: datetime, since: datetime, mode: str, min_subs: int) -> list[dict]:
    sn, st = ch["snippet"], ch.get("statistics", {})
    if st.get("hiddenSubscriberCount"):
        return []
    created = datetime.fromisoformat(sn["publishedAt"].replace("Z", "+00:00"))
    if mode == "new" and created < since:
        return []
    subs, views, videos = (int(st.get(k, 0)) for k in ("subscriberCount", "viewCount", "videoCount"))
    if subs < min_subs:
        return []
    age = max((now - created).total_seconds() / 86400, 1)
    handle = sn.get("customUrl", "")
    return [{
        "id": ch["id"],
        "title": sn["title"],
        "url": f"https://www.youtube.com/{handle}" if handle else f"https://www.youtube.com/channel/{ch['id']}",
        "thumb": sn.get("thumbnails", {}).get("default", {}).get("url", ""),
        "country": sn.get("country", ""),
        "created": created.date().isoformat(),
        "age_days": round(age),
        "subscribers": subs,
        "views": views,
        "videos": videos,
        "subs_per_day": round(subs / age),
        "views_per_video": round(views / max(videos, 1)),
        "score": score(subs, views, videos, age),
        "keywords": sorted(info["keywords"]),
        "top_videos": info["videos"],
    }]


def _result(opts, keywords, rows, warnings, scanned) -> dict:
    return {"created": time.time(), "options": {**opts, "keywords": keywords}, "channels": rows,
            "scanned": scanned, "warnings": warnings, "ideas": []}


def demo_channels(opts: dict) -> dict:
    """Fake but plausible results so the tab works without an API key."""
    keywords = opts.get("keywords") or DEFAULT_KEYWORDS
    rnd = random.Random(42)
    now = datetime.now(timezone.utc)
    rows = []
    for i in range(18):
        kw = keywords[i % len(keywords)]
        age = rnd.randint(20, 175)
        subs = rnd.randint(12, 900) * 1000
        videos = rnd.randint(8, 160)
        views = subs * rnd.randint(40, 300)
        rows.append({
            "id": f"DEMO{i}", "title": f"Demo {kw.title()} Channel {i + 1}", "url": "https://www.youtube.com",
            "thumb": "", "country": rnd.choice(["US", "GB", "IN", "TR", ""]),
            "created": (now - timedelta(days=age)).date().isoformat(), "age_days": age,
            "subscribers": subs, "views": views, "videos": videos, "subs_per_day": subs // age,
            "views_per_video": views // videos, "score": score(subs, views, videos, age), "keywords": [kw],
            "top_videos": [{"title": f"Demo video about {kw} #{j + 1}", "published": "", "url": "https://www.youtube.com"}
                           for j in range(2)],
        })
    rows.sort(key=lambda r: r["score"], reverse=True)
    return _result(opts, keywords, rows, ["DEMO rejimi: nəticələr süni nümunədir"], len(rows))


def run(opts: dict) -> dict:
    settings = store.get_settings()
    if settings.get("demo_mode"):
        res = demo_channels(opts)
    else:
        key = store.get_keys().get("youtube", "")
        if not key:
            raise TrendError("YouTube API açarı daxil edilməyib (Ayarlar → API → YouTube)")
        res = find_channels(opts, key)
    store.save_trends(res)
    return res


def ideas(count: int = 8) -> dict:
    """Generate video ideas from the stored trend results with the script LLM."""
    res = store.get_trends()
    if not res or not res.get("channels"):
        raise TrendError("Əvvəlcə kanalları axtarın")
    settings = store.get_settings()
    s = settings["script"]
    top = res["channels"][:15]
    if settings.get("demo_mode"):
        out = [{"title": f"{v['title']} (yeni bucaq)", "brief": f"Inspired by {c['title']}: a deeper take on {c['keywords'][0]}.",
                "why": f"{c['title']} {c['age_days']} gündə {c['subscribers']:,} abunəçi yığıb", "channel": c["title"]}
               for c in top[:count] for v in c["top_videos"][:1]]
        cost = []
    else:
        lines = "\n".join(
            f"- {c['title']} | created {c['created']} | {c['subscribers']} subs | {c['subs_per_day']} subs/day | "
            f"niche: {', '.join(c['keywords'])} | top videos: " + " / ".join(v["title"] for v in c["top_videos"])
            for c in top)
        system = ("You are a YouTube strategist for faceless, AI-illustrated channels. "
                  "You study fast-growing channels and propose original video ideas (never copies) that ride the same demand.")
        user = (f"Fast-growing channels of the last {res['options'].get('months', 6)} months:\n{lines}\n\n"
                f"Propose {count} original video ideas for my channel. Language of titles: {s['language']}. "
                "Return JSON: {\"ideas\": [{\"title\": str, \"brief\": str (2-3 sentences, what the video covers), "
                "\"why\": str (which trend/channel it is based on and why it can work), \"channel\": str}]}")
        text, c = llm.chat(system, user, provider=s["llm_provider"], model=s["llm_model"],
                           temperature=1.0, max_tokens=4000, json_mode=s["llm_provider"] != "anthropic")
        data = llm.extract_json(text)
        out = data.get("ideas", data) if isinstance(data, dict) else data
        if not isinstance(out, list):
            raise TrendError("LLM ideyaları düzgün formatda qaytarmadı")
        cost = [c]
    res["ideas"] = out[:count]
    store.save_trends(res)
    return {"ideas": res["ideas"], "usd": round(sum(x["usd"] for x in cost), 4)}


def to_csv(res: dict) -> str:
    buf = io.StringIO()
    cols = ["title", "url", "country", "created", "age_days", "subscribers", "views", "videos",
            "subs_per_day", "views_per_video", "score"]
    w = csv.writer(buf)
    w.writerow(cols + ["keywords", "top_video", "top_video_url"])
    for r in res.get("channels", []):
        tv = (r.get("top_videos") or [{}])[0]
        w.writerow([r[c] for c in cols] + [", ".join(r["keywords"]), tv.get("title", ""), tv.get("url", "")])
    return "﻿" + buf.getvalue()
