"""Channel strategy agent: niche research, channel names, video ideas and SEO packs.

Data sources (all optional, the agent degrades gracefully):
  * YouTube search autocomplete (free, no key)  -> what people actually type
  * YouTube Data API v3 (key "youtube")         -> real views, subscribers, outliers
  * youtube.com/@handle                         -> is a channel handle probably free
The LLM only interprets these numbers; it is told never to invent statistics.
"""
from __future__ import annotations

import json
import re
import statistics
import threading
import time
import traceback
import uuid
from datetime import datetime, timedelta, timezone

import httpx

from . import llm, store

YT = "https://www.googleapis.com/youtube/v3"
TAG_BUDGET = 470
RESEARCH = lambda: store.DATA / "research"  # noqa: E731 - follows YTA_DATA_DIR at call time
_running: dict[str, threading.Thread] = {}

UA = {"User-Agent": "Mozilla/5.0 (YouTube AI Agent research)"}


class ResearchError(RuntimeError):
    pass


# =====================================================================
# Expert knowledge given to the model (English prompt = better reasoning)
# =====================================================================
EXPERT = """You are a senior YouTube growth strategist who has launched and monetized dozens of faceless,
AI-produced channels. You think in data: search demand, competition, outlier videos, RPM and production cost.

How you evaluate a niche (score each 1-10):
- demand: people actively search/watch it (autocomplete depth, views per day of recent videos).
- competition: 10 = easy. Easy means small channels (<50k subs) regularly get big views (outliers),
  hard means the top results are dominated by huge channels or brands.
- rpm: advertiser value. Tiers (estimates, vary by country and season): finance/investing/business/software/AI tools/
  real estate/insurance = high; tech, health, education, self-improvement, history/documentary = medium;
  entertainment, stories, gaming, kids, compilations, music = low. Tier-1 English audiences (US, UK, CA, AU) pay most.
- ai_fit: can it be made well with AI voice-over + AI images/video, without a face or camera? Documentary,
  history, mysteries, explainers, finance explainers, psychology, top-lists, stories fit well.
- evergreen: will videos still get views in 1-2 years (search traffic) vs short news cycles.

Monetization reality you must respect:
- YouTube Partner Program full ad revenue: 1,000 subscribers + 4,000 public watch hours in 12 months
  (or 10M Shorts views in 90 days). Lower fan-funding tier: 500 subs + 3 uploads in 90 days + 3,000 hours (or 3M Shorts views).
  Shorts earn far less per view than long videos; long videos (8+ min, mid-roll ads) earn most.
- YouTube's "inauthentic content" policy demonetizes mass-produced, repetitive, template content with no added value.
  Every idea must have a real angle, research, story arc or opinion. Never recommend reuploads, reaction-without-value,
  copyrighted clips, fake news, medical/financial claims presented as fact, or misleading clickbait.
- Realistic synthetic content must be labeled with YouTube's altered/synthetic content setting.
- Extra income beyond AdSense: affiliate links, digital products, sponsorships, memberships.

How you write titles: front-load the keyword people search, max ~60 visible characters, a curiosity gap or a
specific promise, concrete numbers/names/stakes, no ALL CAPS spam, no lies. Thumbnail and title must complement,
not repeat each other. Thumbnails: one focal subject, strong contrast, max 3-4 words of text.

Hard rules:
- Use ONLY the numbers given in the DATA section. If data is missing, say so and mark the value as an estimate.
  Never invent view counts, subscriber counts, CPM/RPM figures or channel names as facts.
- When you cite evidence, reference the exact video title / keyword from DATA.
- Answer with valid JSON only, no markdown fences, no commentary outside JSON."""


# =====================================================================
# Data collection
# =====================================================================
def autocomplete(q: str, lang: str = "en", region: str = "US") -> list[str]:
    """YouTube search suggestions. Free, no key. Returns [] on any failure."""
    try:
        r = httpx.get("https://suggestqueries.google.com/complete/search",
                      params={"client": "firefox", "ds": "yt", "q": q, "hl": lang, "gl": region},
                      headers=UA, timeout=15)
        data = json.loads(r.content.decode("utf-8", "replace"))
        return [s for s in data[1] if isinstance(s, str)][:10]
    except Exception:  # noqa: BLE001 - suggestions are a bonus signal
        return []


def _yt_get(path: str, params: dict, key: str) -> dict:
    try:
        r = httpx.get(f"{YT}/{path}", params={**params, "key": key}, timeout=30)
    except httpx.HTTPError as e:
        raise ResearchError(f"YouTube API bağlantı xətası: {e}") from e
    if r.status_code == 403 and "quota" in r.text.lower():
        raise ResearchError("YouTube API gündəlik kvotası bitib (10 000 vahid). Sabah yenidən cəhd edin.")
    if r.status_code >= 400:
        raise ResearchError(f"YouTube API xətası {r.status_code}: {r.text[:200]}")
    return r.json()


def _iso_dur(s: str) -> int:
    m = re.match(r"P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?", s or "")
    if not m:
        return 0
    d, h, mi, se = (int(x or 0) for x in m.groups())
    return d * 86400 + h * 3600 + mi * 60 + se


def keyword_snapshot(q: str, key: str, *, days: int = 90, region: str = "US", lang: str = "en",
                     shorts: bool = False, max_results: int = 25) -> dict:
    """Top videos for a keyword in the last N days with views, subs, views/day, outlier ratio.
    Quota: ~102 units (search=100, videos=1, channels=1)."""
    after = (datetime.now(timezone.utc) - timedelta(days=days)).strftime("%Y-%m-%dT%H:%M:%SZ")
    params = {"part": "snippet", "q": q, "type": "video", "order": "viewCount", "publishedAfter": after,
              "maxResults": max_results, "regionCode": region, "relevanceLanguage": lang}
    params["videoDuration"] = "short" if shorts else "medium"  # medium = 4-20 min; long-form sweet spot
    items = _yt_get("search", params, key).get("items", [])
    ids = [i["id"]["videoId"] for i in items if i.get("id", {}).get("videoId")]
    if not ids:
        return {"keyword": q, "videos": [], "summary": {"results": 0}}
    vids = _yt_get("videos", {"part": "snippet,statistics,contentDetails", "id": ",".join(ids)}, key).get("items", [])
    ch_ids = sorted({v["snippet"]["channelId"] for v in vids})
    chans = _yt_get("channels", {"part": "statistics,snippet", "id": ",".join(ch_ids)}, key).get("items", [])
    subs = {c["id"]: int(c["statistics"].get("subscriberCount", 0) or 0) for c in chans}
    now = datetime.now(timezone.utc)
    out = []
    for v in vids:
        sn, stt = v["snippet"], v.get("statistics", {})
        views = int(stt.get("viewCount", 0) or 0)
        pub = datetime.fromisoformat(sn["publishedAt"].replace("Z", "+00:00"))
        age = max(1.0, (now - pub).total_seconds() / 86400)
        s = subs.get(sn["channelId"], 0)
        out.append({
            "title": sn["title"], "channel": sn["channelTitle"], "video_id": v["id"],
            "views": views, "subs": s, "age_days": round(age), "views_per_day": round(views / age),
            "outlier": round(views / max(s, 1000), 1),  # views relative to channel size
            "minutes": round(_iso_dur(v.get("contentDetails", {}).get("duration", "")) / 60, 1),
            "likes": int(stt.get("likeCount", 0) or 0),
            "comments": int(stt.get("commentCount", 0) or 0),
        })
    out.sort(key=lambda x: -x["views"])
    return {"keyword": q, "videos": out, "summary": summarize(out)}


def summarize(videos: list[dict]) -> dict:
    """Transparent, code-computed opportunity signals (the LLM must not override these)."""
    if not videos:
        return {"results": 0}
    views = [v["views"] for v in videos]
    small = [v for v in videos if v["subs"] < 50_000]
    small_hits = [v for v in small if v["views"] >= 50_000]
    outliers = [v for v in videos if v["outlier"] >= 3]
    return {
        "results": len(videos),
        "median_views": int(statistics.median(views)),
        "top_views": max(views),
        "median_views_per_day": int(statistics.median(v["views_per_day"] for v in videos)),
        "small_channel_share": round(len(small) / len(videos), 2),
        "small_channel_hits": len(small_hits),
        "outlier_count": len(outliers),
        "median_minutes": statistics.median(v["minutes"] for v in videos),
    }


def handle_status(handle: str) -> str:
    """'free' (404), 'taken' (200) or 'unknown'. YouTube can change this behaviour, so it's a hint only."""
    h = re.sub(r"[^A-Za-z0-9._-]", "", handle.lstrip("@"))
    if not h:
        return "unknown"
    try:
        r = httpx.get(f"https://www.youtube.com/@{h}", headers=UA, timeout=15, follow_redirects=True)
    except httpx.HTTPError:
        return "unknown"
    return {404: "free", 200: "taken"}.get(r.status_code, "unknown")


def compact_data(snaps: list[dict], suggestions: dict[str, list[str]], top: int = 8) -> str:
    """Short text block for the LLM: summaries + the best videos per keyword."""
    lines = []
    for kw, sug in suggestions.items():
        if sug:
            lines.append(f'Autocomplete for "{kw}": ' + " | ".join(sug))
    for s in snaps:
        lines.append(f'\nKEYWORD "{s["keyword"]}" summary: {json.dumps(s["summary"])}')
        for v in s["videos"][:top]:
            lines.append(f'- "{v["title"]}" | {v["channel"]} | {v["views"]:,} views | {v["subs"]:,} subs | '
                         f'{v["views_per_day"]:,}/day | outlier x{v["outlier"]} | {v["minutes"]} min | {v["age_days"]}d old')
    return "\n".join(lines) or "NO DATA COLLECTED (no YouTube API key). Rely on general knowledge and mark every number as an estimate."


# =====================================================================
# LLM helpers
# =====================================================================
def _cfg() -> dict:
    st = store.get_settings()
    r, s = st["research"], st["script"]
    provider = r.get("llm_provider") or s["llm_provider"]
    model = r.get("llm_model") or (s["llm_model"] if provider == s["llm_provider"] else
                                   {"deepseek": "deepseek-reasoner", "openai": "gpt-4.1", "anthropic": "claude-opus-5-5"}[provider])
    return {**r, "provider": provider, "model": model, "demo": st.get("demo_mode", False)}


def _ask(cfg: dict, user: str, max_tokens: int = 8000) -> tuple[dict, dict]:
    json_mode = cfg["provider"] == "openai" or cfg["model"] == "deepseek-chat"
    raw, cost = llm.chat(EXPERT, user, provider=cfg["provider"], model=cfg["model"], temperature=0.8,
                         max_tokens=max_tokens, json_mode=json_mode)
    return llm.extract_json(raw), cost


def _lang_line(cfg: dict, content_lang: str) -> str:
    return (f"Write all explanations (why, rationale, risks, plans) in {cfg['ui_language']}. "
            f"Write titles, hooks, channel names, descriptions and tags in {content_lang} "
            "(the language of the YouTube audience). Image prompts always in English.")


# =====================================================================
# Jobs (background threads, persisted to data/research/<id>.json)
# =====================================================================
def _path(rid: str):
    if not rid.isalnum():
        raise KeyError(rid)
    return RESEARCH() / f"{rid}.json"


def get(rid: str) -> dict:
    p = _path(rid)
    if not p.exists():
        raise KeyError(rid)
    return json.loads(p.read_text(encoding="utf-8"))


def _save(doc: dict) -> dict:
    doc["updated"] = time.time()
    store._write(_path(doc["id"]), doc)  # atomic write helper
    return doc


def _update(rid: str, **kw) -> None:
    with store._lock:
        doc = get(rid)
        doc.update(kw)
        _save(doc)


def list_all() -> list[dict]:
    d = RESEARCH()
    if not d.exists():
        return []
    out = []
    for f in d.glob("*.json"):
        try:
            x = json.loads(f.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        row = {k: x.get(k) for k in ("id", "kind", "title", "status", "updated", "message", "progress", "error")}
        row["channel_id"] = (x.get("params") or {}).get("channel_id", "")
        out.append(row)
    return sorted(out, key=lambda x: -(x["updated"] or 0))


def delete(rid: str) -> None:
    _path(rid).unlink(missing_ok=True)


def recover_interrupted() -> None:
    for x in list_all():
        if x["status"] == "running":
            _update(x["id"], status="error", message="Proqram bağlandığı üçün dayandı")


def start(kind: str, params: dict) -> dict:
    fn = JOBS[kind]
    title = params.get("title") or params.get("niche") or params.get("interests") or kind
    doc = _save({"id": uuid.uuid4().hex[:12], "kind": kind, "title": str(title)[:120], "params": params,
                 "status": "running", "progress": 0, "message": "Başlayır...", "result": None,
                 "data": None, "costs": [], "error": "", "created": time.time()})
    rid = doc["id"]

    def progress(pct: float, msg: str) -> None:
        _update(rid, progress=round(pct), message=msg)

    def runner():
        try:
            result, data, costs = fn(params, progress)
            _update(rid, status="done", progress=100, message="Hazırdır", result=result, data=data,
                    costs=[c for c in costs if c])
        except Exception as e:  # noqa: BLE001 - shown in UI
            traceback.print_exc()
            _update(rid, status="error", message="Xəta", error=str(e))

    t = threading.Thread(target=runner, daemon=True)
    _running[rid] = t
    t.start()
    return doc


def _collect(keywords: list[str], cfg: dict, progress, p0: float, p1: float, shorts: bool) -> tuple[list, dict, list]:
    """Autocomplete for every keyword + YouTube snapshot (if key). Returns (snapshots, suggestions, notes)."""
    key = store.get_keys().get("youtube", "")
    lang2 = cfg["lang_code"]
    snaps, sugg, notes = [], {}, []
    keywords = [k for k in dict.fromkeys(k.strip() for k in keywords) if k][: int(cfg["max_keywords"])]
    for i, kw in enumerate(keywords):
        progress(p0 + (p1 - p0) * i / max(1, len(keywords)), f'Araşdırılır: "{kw}"')
        sugg[kw] = autocomplete(kw, lang2, cfg["region"])
        if key:
            try:
                snaps.append(keyword_snapshot(kw, key, days=int(cfg["days"]), region=cfg["region"],
                                              lang=lang2, shorts=shorts))
            except ResearchError as e:
                notes.append(str(e))
                if "kvota" in str(e):
                    break
    if not key:
        notes.append("YouTube API açarı yoxdur: real baxış/abunəçi rəqəmləri toplanmadı, təhlil AI biliyinə və "
                     "autocomplete-ə əsaslanır. Ayarlar → API → YouTube Data API.")
    return snaps, sugg, notes


# ---------------- 1. Niche + channel name ----------------
def job_niche(params: dict, progress) -> tuple[dict, dict, list]:
    cfg = _cfg()
    content_lang = params.get("language") or cfg["content_language"]
    if params.get("region"):
        cfg["region"] = params["region"]
    shorts = params.get("format") == "shorts"
    brief = (f"Creator interests / ideas: {params.get('interests') or 'open to anything profitable'}\n"
             f"Target audience language: {content_lang}; main country: {cfg['region']}\n"
             f"Format: {params.get('format', 'long')} videos; production: faceless, AI voice + AI visuals "
             f"({params.get('style') or 'realistic cinematic'})\n"
             f"Uploads per week the creator can make: {params.get('per_week', 3)}\n"
             f"Goal: {params.get('goal') or 'views, subscribers and ad revenue as fast as possible'}")
    if cfg["demo"]:
        return demo_niche(params), {"notes": ["DEMO rejimi: nümunə nəticə, real araşdırma deyil."]}, []

    progress(5, "Namizəd nişlər seçilir")
    cand, c1 = _ask(cfg, f"""{brief}

Step 1 of 2. Propose 8 candidate niches for this creator (mix of safe and bold). For each give 2 short
search keywords exactly as viewers would type them on YouTube in {content_lang}.
Return {{"candidates": [{{"niche": "...", "keywords": ["...", "..."]}}]}}""", 3000)
    keywords = [k for c in cand.get("candidates", []) for k in c.get("keywords", [])[:2]]

    snaps, sugg, notes = _collect(keywords, cfg, progress, 15, 70, shorts)
    progress(72, "Data təhlil olunur, strategiya yazılır")
    plan, c2 = _ask(cfg, f"""{brief}

CANDIDATES: {json.dumps(cand.get("candidates", []), ensure_ascii=False)}

DATA (real YouTube numbers collected right now, last {cfg['days']} days):
{compact_data(snaps, sugg)}

Step 2 of 2. Rank the candidates using the DATA and your criteria and build the full channel strategy for the winner.
{_lang_line(cfg, content_lang)}
Return JSON:
{{
 "niches": [{{"name": "...", "verdict": "1-2 sentences", "audience": "who watches",
   "scores": {{"demand": 1-10, "competition": 1-10, "rpm": 1-10, "ai_fit": 1-10, "evergreen": 1-10}},
   "rpm_tier": "high|medium|low", "evidence": ["facts from DATA with numbers"], "risks": ["..."]}}],  // all 8, best first
 "winner": {{
   "niche": "...", "why": "3-5 sentences, cite DATA", "positioning": "the unique angle vs competitors",
   "channel_names": [{{"name": "...", "handle": "no spaces, <=20 chars", "why": "..."}}],   // 10 names: short, memorable, brandable, not a trademark, not tied to one topic too narrowly
   "channel_description": "About section, 600-900 chars, keyword-rich, in {content_lang}",
   "channel_keywords": ["10 channel keywords"],
   "avatar_prompt": "English image prompt for the channel icon",
   "banner_prompt": "English image prompt for a 2560x1440 banner, safe area centered, no text",
   "content_pillars": [{{"name": "...", "purpose": "search|browse|subscribe", "example": "title"}}],
   "video_length": "recommended minutes and why", "upload_plan": "weekly schedule + Shorts strategy",
   "first_10_videos": [{{"title": "...", "pillar": "...", "why_first": "..."}}],
   "monetization": ["AdSense timeline estimate + extra income ideas for this niche"],
   "kpis": ["CTR, retention, etc. targets for the first 90 days"],
   "avoid": ["things that would get this channel demonetized or stuck"]
 }}
}}""", 12000)
    win = plan.get("winner", {})
    names = win.get("channel_names", [])
    for i, n in enumerate(names):
        progress(90 + 9 * i / max(1, len(names)), "Kanal adlarının boş olub-olmadığı yoxlanılır")
        n["handle_status"] = handle_status(n.get("handle") or n.get("name", "").replace(" ", ""))
    return plan, {"notes": notes, "snapshots": snaps, "suggestions": sugg}, [c1, c2]


# ---------------- 2. Video ideas ----------------
def job_ideas(params: dict, progress) -> tuple[dict, dict, list]:
    cfg = _cfg()
    niche = params.get("niche", "").strip()
    if not niche:
        raise ResearchError("Niş / kanal mövzusu yazın")
    content_lang = params.get("language") or cfg["content_language"]
    if params.get("region"):
        cfg["region"] = params["region"]
    count = max(3, min(30, int(params.get("count") or 10)))
    shorts = params.get("format") == "shorts"
    if cfg["demo"]:
        return demo_ideas(niche, count), {"notes": ["DEMO rejimi: nümunə nəticə, real araşdırma deyil."]}, []

    seeds = [niche] + [k.strip() for k in (params.get("keywords") or "").split(",") if k.strip()]
    progress(5, "Axtarış sorğuları genişləndirilir")
    expanded = []
    for s in seeds[:3]:
        expanded += autocomplete(s, cfg["lang_code"], cfg["region"])[:3]
    snaps, sugg, notes = _collect(seeds + expanded, cfg, progress, 10, 65, shorts)
    outliers = sorted((v for s in snaps for v in s["videos"] if v["outlier"] >= 2),
                      key=lambda v: -v["outlier"])[:15]
    out_txt = "\n".join(f'- "{v["title"]}" | {v["views"]:,} views on a {v["subs"]:,}-sub channel (x{v["outlier"]})'
                        for v in outliers) or "none found"
    progress(70, "Video ideyaları yazılır")
    res, c = _ask(cfg, f"""Channel niche: {niche}
Audience language: {content_lang}; country: {cfg['region']}; format: {'Shorts' if shorts else 'long-form'};
production: faceless AI voice + AI visuals. {('Channel positioning: ' + params['positioning']) if params.get('positioning') else ''}
{params.get('channel_context', '')}
{('ALREADY PLANNED OR PUBLISHED (do not repeat these topics or near-duplicates): ' + ' | '.join(params['exclude'])) if params.get('exclude') else ''}

DATA:
{compact_data(snaps, sugg)}

OUTLIER VIDEOS (performed far above their channel size = proven topics):
{out_txt}

Generate {count} video ideas with the highest chance of views + subscribers + revenue.
Mix: ~40% search ideas (evergreen keyword), ~40% browse ideas (curiosity/emotion, outlier patterns), ~20% subscriber/series ideas.
Do not copy outlier titles; take the proven topic/pattern and give a fresher, stronger angle.
{_lang_line(cfg, content_lang)}
Return JSON:
{{"ideas": [{{
  "title": "best title", "alt_titles": ["2 alternatives"], "type": "search|browse|series",
  "angle": "what makes this video different and valuable (2 sentences)",
  "hook": "the first 10-15 seconds of narration, word for word",
  "outline": ["5-8 beats of the story/structure"],
  "target_keyword": "...", "length_min": number,
  "thumbnail": "visual concept + max 4 words overlay text",
  "based_on": "which DATA video/keyword proves demand, or 'estimate'",
  "score": 1-10, "why": "why it will perform, cite DATA"
}}]}}  // sorted by score desc""", 12000)
    return res, {"notes": notes, "snapshots": snaps, "suggestions": sugg, "outliers": outliers}, [c]


# ---------------- 3. SEO pack: title, description, tags ----------------
def job_seo(params: dict, progress) -> tuple[dict, dict, list]:
    cfg = _cfg()
    title = params.get("title", "").strip()
    if not title:
        raise ResearchError("Video başlığı / mövzusu yazın")
    content_lang = params.get("language") or cfg["content_language"]
    ch = params.get("channel") or {}
    if cfg["demo"]:
        return finalize_seo(demo_seo(title), ch), {"notes": ["DEMO rejimi"]}, []
    progress(10, "Açar sözlər toplanır")
    kw = params.get("keyword") or title
    sugg = {kw: autocomplete(kw, cfg["lang_code"], cfg["region"])}
    words = " ".join(kw.split()[:3])
    if words != kw:
        sugg[words] = autocomplete(words, cfg["lang_code"], cfg["region"])
    progress(40, "Title, description və tag-lər yazılır")
    res, c = _ask(cfg, f"""Video topic / working title: {title}
Niche: {params.get('niche', '')}
Context / script summary: {(params.get('context') or '')[:4000]}
{_channel_seo_rules(ch)}
Audience language: {content_lang}

DATA: {compact_data([], sugg)}

Create the full YouTube upload package. {_lang_line(cfg, content_lang)}
Return JSON:
{{
 "titles": [{{"title": "<=70 chars", "style": "curiosity|keyword|emotional|number", "why": "..."}}],  // 5 options, best first
 "recommended_title": "...",
 "description": "First 2 lines (<=150 chars) hook + main keyword (visible in search). Then a 2-3 paragraph summary with natural keywords, a 'Chapters' block with 0:00 placeholders matching the outline, a subscribe line, and 3 hashtags at the end. 1200-2000 chars.",
 "tags": ["15-25 tags: exact keyword first, then variations, long-tail, synonyms, common misspellings"],
 "hashtags": ["3 hashtags"],
 "thumbnail_text": "max 4 words",
 "thumbnail_prompt": "English prompt for a 16:9 realistic cinematic thumbnail, one focal subject, high contrast, empty space for text, no text",
 "pinned_comment": "a question that drives comments",
 "shorts_hooks": ["3 YouTube Shorts ideas cut from this video to promote it"],
 "seo_notes": "short explanation of the keyword strategy"
}}""", 6000)
    progress(95, "Limitlər yoxlanılır")
    return finalize_seo(res, ch), {"suggestions": sugg}, [c]


def _channel_seo_rules(ch: dict) -> str:
    if not ch:
        return ""
    k = ch.get("kit", {})
    return (f"This video is for the channel '{ch.get('name')}' (niche: {ch.get('niche')}; positioning: {k.get('positioning')}). "
            f"Follow the channel title rules: {k.get('title_rules')}. Thumbnail style: {k.get('thumbnail_style')}. "
            "Do not include the channel footer in the description, it is appended automatically.")


def finalize_seo(res: dict, channel: dict | None = None) -> dict:
    """Enforce YouTube limits: title <=100 chars, description <=5000, tags total <=500 chars.
    YouTube counts commas and the quotes it adds around multi-word tags; exact rules are not documented,
    so we stop at 470 to keep a safety margin."""
    kit = (channel or {}).get("kit", {})
    tags, total = [], 0
    for t in list(res.get("tags", [])) + list(kit.get("default_tags", [])):
        t = re.sub(r"[<>]", "", str(t)).strip()
        cost = len(t) + (2 if " " in t else 0) + (1 if tags else 0)  # quotes for multi-word + comma
        if t and t.lower() not in {x.lower() for x in tags} and total + cost <= TAG_BUDGET:
            tags.append(t)
            total += cost
    res["tags"] = tags
    res["tags_csv"] = ", ".join(tags)
    res["tags_chars"] = total
    if res.get("recommended_title"):
        res["recommended_title"] = res["recommended_title"][:100]
    desc = res.get("description") or ""
    footer = (kit.get("description_footer") or "").strip()
    if footer and footer not in desc:
        desc = desc.rstrip() + "\n\n" + footer
    res["description"] = desc.replace("<", "").replace(">", "")[:5000]
    return res


# =====================================================================
# Demo results (no API calls) so the UI can be tried for free
# =====================================================================
def demo_niche(params: dict) -> dict:
    return {
        "niches": [
            {"name": "Unsolved historical mysteries", "verdict": "DEMO: yüksək tələb, AI vizuala çox uyğundur.",
             "audience": "25-45 yaş, sənədli film sevənlər",
             "scores": {"demand": 8, "competition": 6, "rpm": 5, "ai_fit": 9, "evergreen": 9}, "rpm_tier": "medium",
             "evidence": ["DEMO: real data yoxdur"], "risks": ["Faktları yoxlamaq lazımdır"]},
            {"name": "Personal finance explained", "verdict": "DEMO: ən yüksək RPM, rəqabət güclüdür.",
             "audience": "22-40 yaş, gəlirini artırmaq istəyənlər",
             "scores": {"demand": 8, "competition": 4, "rpm": 9, "ai_fit": 7, "evergreen": 8}, "rpm_tier": "high",
             "evidence": ["DEMO: real data yoxdur"], "risks": ["Maliyyə məsləhəti kimi təqdim etməyin"]},
        ],
        "winner": {
            "niche": "Unsolved historical mysteries", "why": "DEMO nəticəsi. Real təhlil üçün Demo rejimini söndürün.",
            "positioning": "Hər videoda bir sirr + son dəlillər, kinematik realistic vizual.",
            "channel_names": [{"name": "Vault of Echoes", "handle": "VaultOfEchoes", "why": "qısa, sirli", "handle_status": "unknown"},
                              {"name": "Lost Ledger", "handle": "LostLedger", "why": "yadda qalan", "handle_status": "unknown"}],
            "channel_description": "Untold stories and unsolved mysteries from history, told cinematically.",
            "channel_keywords": ["history mysteries", "unsolved mysteries", "documentary"],
            "avatar_prompt": "Minimal emblem of an ancient key glowing in darkness, cinematic, centered",
            "banner_prompt": "Wide cinematic panorama of foggy ancient ruins at dusk, centered composition, no text",
            "content_pillars": [{"name": "Unsolved cases", "purpose": "browse", "example": "The Ship That Sailed With No One Aboard"}],
            "video_length": "12-18 dəqiqə", "upload_plan": "Həftədə 2 uzun video + 3 Shorts",
            "first_10_videos": [{"title": "The Village That Vanished Overnight", "pillar": "Unsolved cases", "why_first": "DEMO"}],
            "monetization": ["DEMO"], "kpis": ["CTR 5%+", "ilk 30 saniyədə retention 70%+"], "avoid": ["Təkrarlanan şablon videolar"],
        },
    }


def demo_ideas(niche: str, count: int) -> dict:
    return {"ideas": [{
        "title": f"{niche}: The Detail Everyone Missed #{i + 1}", "alt_titles": ["Alt A", "Alt B"],
        "type": ["search", "browse", "series"][i % 3], "angle": "DEMO angle", "hook": "What if the story you know is wrong?",
        "outline": ["Hook", "Context", "Twist", "Evidence", "Ending"], "target_keyword": niche, "length_min": 12,
        "thumbnail": "Close-up face in shadow | 'IT WAS HIDDEN'", "based_on": "estimate", "score": 9 - i % 4,
        "why": "DEMO nəticəsi"} for i in range(count)]}


def demo_seo(title: str) -> dict:
    return {"titles": [{"title": title, "style": "keyword", "why": "DEMO"}], "recommended_title": title,
            "description": f"{title}\n\nDEMO description.\n\n0:00 Intro\n\n#demo #ai #youtube",
            "tags": [title.lower(), "demo", "ai video"], "hashtags": ["#demo"], "thumbnail_text": "DEMO",
            "thumbnail_prompt": "Cinematic realistic close-up, high contrast, empty right side", "pinned_comment": "What do you think?",
            "shorts_hooks": ["DEMO"], "seo_notes": "DEMO"}


JOBS = {"niche": job_niche, "ideas": job_ideas, "seo": job_seo}
