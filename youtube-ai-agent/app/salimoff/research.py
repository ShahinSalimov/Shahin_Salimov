"""Stage 1–2: market analysis and the niche decision.

1. AI proposes candidate niches suited for faceless AI production (or takes the user's list).
2. For every niche the system pulls real YouTube data (top videos of the last 90 days) and measures
   demand, small-channel success (outliers), competition and Shorts potential.
3. AI adds what data cannot show: RPM, AI-production feasibility, monetization/policy safety.
4. A fixed, transparent formula scores each niche → the system decides and explains why.
5. From the outlier videos of the winner it extracts success patterns (titles, hooks, lengths).
"""
from __future__ import annotations

import math
import statistics as stats
import time
from datetime import datetime, timezone

from . import ai, db, ytapi

WEIGHTS = {"demand": 0.22, "opportunity": 0.24, "competition": 0.14, "rpm": 0.16,
           "feasibility": 0.12, "safety": 0.12}
LABELS = {"demand": "Tələb", "opportunity": "Kiçik kanal uğuru", "competition": "Rəqabət (yüksək = asan)",
          "rpm": "Gəlir (RPM)", "feasibility": "AI ilə istehsal", "safety": "Monetizasiya təhlükəsizliyi"}
SMALL_CHANNEL = 50_000

DEFAULT_INPUT = {
    "language": "English", "region": "US", "interests": "", "niches": [], "style": "realistic cinematic",
    "goal": "monetization", "budget_per_long_usd": 5, "candidates": 8,
}


def clamp(x: float, lo: float = 0, hi: float = 100) -> float:
    return max(lo, min(hi, x))


def new_research(inp: dict) -> dict:
    r = {"id": db.new_id(), "created": time.time(), "status": "new", "input": {**DEFAULT_INPUT, **inp},
         "candidates": [], "decision": None, "patterns": None, "costs": [], "data_source": ""}
    return db.save_research(r)


# --------------------------------------------------------------------------- metrics
def measure(videos: list[dict]) -> dict:
    """Pure function: turn raw search results into niche metrics."""
    if not videos:
        return {"n": 0}
    views = [v["views"] for v in videos]
    with_subs = [v for v in videos if v.get("subs", 0) > 0]
    ratios = [v["views"] / v["subs"] for v in with_subs] or [0]
    med = stats.median(views)
    small_wins = [v for v in videos if 0 < v.get("subs", 0) < SMALL_CHANNEL and v["views"] >= max(20_000, med * 0.5)]
    now = datetime.now(timezone.utc)
    new_channels = []
    for v in videos:
        try:
            created = datetime.fromisoformat(v["channel_created"].replace("Z", "+00:00"))
            if (now - created).days < 365:
                new_channels.append(v)
        except (KeyError, ValueError):
            pass
    shorts = [v for v in videos if 0 < v.get("seconds", 0) <= 180]
    longs = [v for v in videos if v.get("seconds", 0) > 180]
    subs_med = stats.median([v["subs"] for v in with_subs]) if with_subs else 0
    m = {
        "n": len(videos),
        "median_views": int(med),
        "median_ratio": round(stats.median(ratios), 2),
        "small_win_share": round(len(small_wins) / len(videos), 2),
        "new_channel_share": round(len(new_channels) / len(videos), 2),
        "unique_channels": len({v["channel_id"] for v in videos}),
        "median_subs": int(subs_med),
        "shorts_share": round(len(shorts) / len(videos), 2),
        "shorts_median_views": int(stats.median([v["views"] for v in shorts])) if shorts else 0,
        "long_median_minutes": round(stats.median([v["seconds"] for v in longs]) / 60, 1) if longs else 0,
    }
    m["demand"] = round(clamp((math.log10(max(med, 1)) - 3) / 3 * 100))                    # 1k→0, 1M→100
    m["opportunity"] = round(clamp(35 * math.log10(1 + m["median_ratio"]) + 120 * m["small_win_share"]
                                   + 50 * m["new_channel_share"]))
    m["competition"] = round(clamp(100 - 22 * math.log10(max(subs_med, 1000) / 1000)
                                   + 20 * (m["unique_channels"] / len(videos) - 0.5)))
    return m


def score(c: dict) -> dict:
    parts = {k: float(c.get(k, 0)) for k in WEIGHTS}
    total = sum(parts[k] * w for k, w in WEIGHTS.items())
    return {"total": round(total, 1), "parts": {k: round(v) for k, v in parts.items()}}


def rpm_score(rpm_usd: float) -> float:
    return clamp(rpm_usd / 12 * 100)  # $12+ RPM → 100


# --------------------------------------------------------------------------- AI steps
def _ai_candidates(inp: dict, need_estimates: bool) -> tuple[list[dict], dict | None]:
    est = ('"demand": 0-100, "competition": 0-100 (higher = easier to enter), "opportunity": 0-100 '
           "(how often small/new channels get big views), " if need_estimates else "")
    user = (
        f"Target audience language: {inp['language']}. Region: {inp['region']}. Goal: {inp['goal']}.\n"
        f"Creator interests: {inp['interests'] or 'open to any'}.\n"
        f"Production: 100% AI (script, {inp['style']} AI images/video, AI voice-over), no face, no filming. "
        f"Budget about ${inp['budget_per_long_usd']} per long video.\n"
        + (f"Evaluate exactly these niches: {inp['niches']}\n" if inp.get("niches") else
           f"Propose {inp['candidates']} distinct YouTube niches with real demand in {inp['region']} right now, "
           "that work for both long videos and Shorts.\n")
        + "For each niche return: "
        '{"name": "...", "description": "one sentence", "keywords": ["2 YouTube search queries in the audience language"], '
        '"audience": "...", "rpm_usd": number (realistic estimated RPM for this niche and region), '
        '"feasibility": 0-100 (how well it can be produced with AI images/voice in good quality), '
        '"safety": 0-100 (low risk of demonetization, reused/repetitive content and policy strikes), '
        + est + '"long_minutes": number, "why": "...", "risks": "..."}\n'
        'Return {"niches": [...]}'
    )
    data, cost = ai.ask_json("You are a YouTube market analyst who evaluates niches for faceless AI channels. "
                             "Be realistic and conservative with numbers.", user, max_tokens=6000)
    return data.get("niches", []), cost


def _ai_patterns(niche: dict, top: list[dict], inp: dict) -> tuple[dict, dict | None]:
    rows = "\n".join(f"- {v['title']} | {v['views']:,} views | {v['subs']:,} subs | {v['seconds'] // 60} min"
                     for v in top) or "(no real data, use your knowledge)"
    data, cost = ai.ask_json(
        "You reverse-engineer why YouTube videos succeed.",
        f"Niche: {niche['name']} ({niche.get('description', '')}). Language: {inp['language']}.\n"
        f"Outlier videos (high views relative to channel size):\n{rows}\n\n"
        'Return {"title_formulas": ["6 reusable title templates with [placeholders]"], '
        '"hook_patterns": ["5 first-10-second hook patterns"], "thumbnail_patterns": ["4 concepts"], '
        '"content_angles": ["8 angles/sub-topics that perform"], "ideal_long_minutes": number, '
        '"ideal_short_seconds": number, "posting": "recommended weekly cadence for long and shorts", '
        '"avoid": ["4 things that hurt performance or monetization"], "summary": "3 sentences"}',
        max_tokens=4000)
    return data, cost


# --------------------------------------------------------------------------- demo data
DEMO_NICHES = [
    ("Untold History Mysteries", "Lesser-known historical events told as cinematic stories", 7.5, 88, 82),
    ("Luxury Lifestyle & Billionaire Habits", "How the ultra-rich live, spend and think", 9.0, 80, 70),
    ("Space & Universe Explained", "Mind-bending facts about the cosmos", 6.0, 92, 90),
    ("Personal Finance for Beginners", "Simple money rules, investing basics", 14.0, 70, 75),
    ("Ancient Civilizations", "Lost cities, empires and myths", 6.5, 90, 85),
    ("Psychology Facts", "Human behavior explained with stories", 8.0, 85, 80),
    ("Animal Kingdom Extremes", "The strangest animals on Earth", 5.0, 87, 88),
    ("Future Technology & AI", "What the next 10 years will look like", 10.0, 84, 78),
]


def _demo_candidates(inp: dict) -> list[dict]:
    out = []
    for name, desc, rpm, feas, safe in DEMO_NICHES[: int(inp.get("candidates", 8))]:
        out.append({"name": name, "description": desc, "keywords": [name.lower(), name.split()[0].lower() + " facts"],
                    "audience": "18-44, curious viewers", "rpm_usd": rpm, "feasibility": feas, "safety": safe,
                    "long_minutes": 12, "why": "Demo: evergreen topic, visual, works well with AI imagery.",
                    "risks": "Demo: needs strong storytelling to avoid generic content."})
    return out


def _demo_patterns(niche: dict) -> dict:
    n = niche["name"]
    return {
        "title_formulas": [f"The Dark Truth About [Topic]", "Why [Thing] Was Hidden For [Number] Years",
                           "What Happened To [Topic]?", "[Number] [Topic] Facts That Sound Fake But Are True",
                           "This [Topic] Changed Everything", "Nobody Talks About [Topic]"],
        "hook_patterns": ["Start with the most shocking fact", "Ask a question the viewer cannot answer",
                          "Show the ending first", "Contradict a common belief", "Countdown promise"],
        "thumbnail_patterns": ["One huge subject, dark background, high contrast", "Before/after split",
                               "Close-up face with emotion", "Single mysterious object with glow"],
        "content_angles": [f"{n}: angle {i}" for i in range(1, 9)],
        "ideal_long_minutes": 12, "ideal_short_seconds": 45,
        "posting": "2 long videos + 7 Shorts per week",
        "avoid": ["Generic stock-like visuals", "Repetitive templated scripts", "Misleading thumbnails",
                  "Long intros"],
        "summary": "Demo patterns. Curiosity-driven titles and fast hooks dominate this niche.",
    }


# --------------------------------------------------------------------------- the job
def run(progress, rid: str) -> dict:
    r = db.get_research(rid)
    inp = r["input"]
    r["status"] = "running"
    db.save_research(r)
    costs = []
    demo = ai.demo()
    use_api = ytapi.has_api_key() and not demo
    progress(5, "Namizəd nişlər seçilir")
    if demo:
        cands = _demo_candidates(inp)
        if inp.get("niches"):
            cands = [{**cands[i % len(cands)], "name": n} for i, n in enumerate(inp["niches"])]
    else:
        cands, c = _ai_candidates(inp, need_estimates=not use_api)
        costs.append(c)
    if not cands:
        raise RuntimeError("AI namizəd niş qaytarmadı")

    raw_by_niche: dict[str, list[dict]] = {}
    for i, c in enumerate(cands):
        progress(10 + 60 * i / len(cands), f"YouTube məlumatı analiz olunur: {c['name']}")
        videos: list[dict] = []
        if use_api or demo:
            for q in (c.get("keywords") or [c["name"]])[:2]:
                try:
                    videos += ytapi.demo_search(q) if demo else ytapi.search_videos(
                        q, region=inp["region"], language=_lang_code(inp["language"]))
                except ytapi.YTError as e:
                    c.setdefault("warnings", []).append(str(e))
                    if "quota" in str(e).lower():
                        use_api = False
            seen, uniq = set(), []
            for v in videos:
                if v["video_id"] not in seen:
                    seen.add(v["video_id"])
                    uniq.append(v)
            videos = uniq
        m = measure(videos)
        if m["n"]:
            c["metrics"] = m
            c.update(demand=m["demand"], opportunity=m["opportunity"], competition=m["competition"])
            c["source"] = "youtube_data"
        else:
            c["source"] = "ai_estimate"
            for k in ("demand", "competition", "opportunity"):
                c[k] = clamp(float(c.get(k, 50)))
        c["rpm"] = round(rpm_score(float(c.get("rpm_usd", 4))))
        c["feasibility"] = clamp(float(c.get("feasibility", 60)))
        c["safety"] = clamp(float(c.get("safety", 60)))
        c["score"] = score(c)
        raw_by_niche[c["name"]] = sorted(videos, key=lambda v: -(v["views"] / max(v.get("subs") or 1, 1)))[:12]
        c["top_videos"] = [{k: v[k] for k in ("title", "views", "subs", "seconds", "channel", "video_id")}
                           for v in raw_by_niche[c["name"]][:6]]

    cands.sort(key=lambda c: -c["score"]["total"])
    win = cands[0]
    progress(75, f"Qərar: {win['name']}. Uğurlu videoların nümunələri çıxarılır")
    if demo:
        patterns = _demo_patterns(win)
    else:
        patterns, c = _ai_patterns(win, raw_by_niche.get(win["name"], []), inp)
        costs.append(c)
    patterns["niche"] = win["name"]

    r = db.get_research(rid)
    r.update(candidates=cands, patterns=patterns, status="done",
             data_source="demo" if demo else ("youtube_data" if any(c["source"] == "youtube_data" for c in cands) else "ai_estimate"),
             decision=decide(cands), costs=[{**x, "t": time.time()} for x in costs if x])
    db.save_research(r)
    progress(100, "Analiz hazırdır")
    return r


def decide(cands: list[dict]) -> dict:
    win = cands[0]
    p = win["score"]["parts"]
    strong = sorted(p, key=lambda k: -p[k])[:2]
    weak = min(p, key=lambda k: p[k])
    gap = round(win["score"]["total"] - cands[1]["score"]["total"], 1) if len(cands) > 1 else 0
    reason = (f"{win['name']} ən yüksək ümumi bal topladı ({win['score']['total']}/100). "
              f"Güclü tərəfləri: {LABELS[strong[0]]} ({p[strong[0]]}) və {LABELS[strong[1]]} ({p[strong[1]]}). "
              f"Ən zəif göstərici: {LABELS[weak]} ({p[weak]}); strategiyada bunu kompensasiya etmək lazımdır. "
              + (f"İkinci yerdən fərq {gap} baldır." if gap else ""))
    if gap < 3 and len(cands) > 1:
        reason += f" Fərq kiçikdir, {cands[1]['name']} də ciddi alternativdir."
    return {"niche": win["name"], "score": win["score"]["total"], "reason": reason,
            "alternatives": [c["name"] for c in cands[1:3]], "confidence": "high" if gap >= 5 else "medium"}


def choose(rid: str, niche_name: str) -> dict:
    """User override of the system's decision."""
    r = db.get_research(rid)
    idx = next((i for i, c in enumerate(r["candidates"]) if c["name"] == niche_name), None)
    if idx is None:
        raise KeyError(niche_name)
    ordered = [r["candidates"][idx]] + [c for i, c in enumerate(r["candidates"]) if i != idx]
    r["decision"] = {**decide(ordered), "overridden": idx != 0}
    if idx != 0:
        r["decision"]["reason"] = "İstifadəçi seçimi. " + r["decision"]["reason"]
    return db.save_research(r)


def patterns_for(r: dict, niche: dict) -> tuple[dict, dict | None]:
    """Patterns of the chosen niche (re-extracted if the user overrode the decision)."""
    if (r.get("patterns") or {}).get("niche") == niche["name"]:
        return r["patterns"], None
    if ai.demo():
        return {**_demo_patterns(niche), "niche": niche["name"]}, None
    pat, cost = _ai_patterns(niche, niche.get("top_videos", []), r["input"])
    pat["niche"] = niche["name"]
    return pat, cost


def _lang_code(language: str) -> str:
    codes = {"english": "en", "azerbaijani": "az", "turkish": "tr", "russian": "ru", "german": "de",
             "french": "fr", "spanish": "es", "arabic": "ar", "portuguese": "pt", "italian": "it", "hindi": "hi"}
    return codes.get(language.strip().lower(), "")
