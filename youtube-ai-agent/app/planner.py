"""Everything the AI decides for a job: frame prompts, which scenes move, the Short, metadata, thumbnail."""
from __future__ import annotations

from . import config, providers
from .scenes import speech_seconds, split_scenes

BATCH = 25
SHORT_MIN, SHORT_MAX = 30.0, 50.0

STYLE_PREFIX = ("Photorealistic cinematic film still, shot on a full-frame camera with a 35mm lens, "
                "dramatic natural lighting,")
STYLE_SUFFIX = ("moody color grading with deep shadows and warm highlights, realistic reflections, subtle "
                "motion blur, documentary realism, high detail, atmospheric haze, cinematic composition")
NEGATIVE = ("text, letters, captions, logo, watermark, license plate numbers, brand badges, gore, blood, "
            "injured people, cartoon, illustration, deformed cars, extra wheels, deformed hands")


def image_prompt(visual: str, portrait: bool = False) -> str:
    frame = "vertical 9:16 composition, subject centered" if portrait else "wide 16:9 composition"
    return f"{STYLE_PREFIX} {visual.strip()}, {frame}. {STYLE_SUFFIX}. Avoid: {NEGATIVE}."


def _system(language: str) -> str:
    return (
        "You are the director of a faceless YouTube channel with photorealistic AI visuals. "
        "You receive narration split into scenes (id: text). Answer with JSON only:\n"
        '{"scenes": [{"id": "...", "visual": "..."}], "dramatic": ["id", ...], "short_start": "id",\n'
        ' "long_meta": {"title": "", "description": "", "tags": []},\n'
        ' "short_meta": {"title": "", "description": "", "tags": []},\n'
        ' "thumb_text": "", "thumb_prompt": ""}\n'
        "Rules:\n"
        "- visual: ONE English description (25-45 words) of a single photorealistic frame that shows what the "
        "narration says: subject, action, setting, time of day, camera angle. Real-world plausible. No text, no "
        "logos, no gore, no injured people; show impacts through wreckage, smoke, skid marks, reactions.\n"
        "- Keep recurring cars, people and places visually consistent between scenes.\n"
        "- dramatic: up to 3 scene ids with the strongest visual action (crash moment, reveal).\n"
        "- short_start: the scene id where the most gripping 30-50 second moment begins.\n"
        f"- long_meta / short_meta in {language}: title max 70 characters, curiosity-driven, no clickbait lies; "
        "description 3 short paragraphs then 3 hashtags; 12-15 tags. The Short title must end with #Shorts.\n"
        "- thumb_text: 2-4 punchy words, uppercase. thumb_prompt: English photorealistic 16:9 thumbnail image, "
        "one clear subject, high contrast, empty space on one side for text.\n"
        "If you only receive some scenes (a later batch), return just their visuals; other fields may be empty."
    )


def make_plan(script: str, title_hint: str, settings: dict, language: str = "English") -> tuple[dict, float]:
    scenes = split_scenes(script)
    if not scenes:
        raise providers.ProviderError("Ssenari boşdur")
    cost = 0.0
    first: dict = {}
    visuals: dict[str, str] = {}
    for b in range(0, len(scenes), BATCH):
        batch = scenes[b:b + BATCH]
        user = (f"Video title idea: {title_hint or '(choose)'}\n"
                f"Batch {b // BATCH + 1}; total scenes {len(scenes)}.\n"
                + "\n".join(f"{s['id']}: {s['text']}" for s in batch))
        if b == 0:  # the first call also sees the whole script for Short/metadata choices
            user += "\n\nFULL SCRIPT (for short_start, metadata and thumbnail):\n" + script[:12000]
        data, c = providers.deepseek_json(_system(language), user)
        cost += c
        if b == 0:
            first = data if isinstance(data, dict) else {}
        for item in (data.get("scenes") or []) if isinstance(data, dict) else []:
            if isinstance(item, dict) and item.get("id") and item.get("visual"):
                visuals[str(item["id"])] = str(item["visual"])
    for s in scenes:  # never leave a scene without a visual
        s["visual"] = visuals.get(s["id"]) or s["text"]

    ids = [s["id"] for s in scenes]
    animate: list[str] = []
    if providers.kie_enabled() and settings["max_animated"] > 0:
        dramatic = [i for i in first.get("dramatic") or [] if i in ids]
        animate = list(dict.fromkeys(ids[:2] + dramatic))[: int(settings["max_animated"])]

    title = title_hint.strip() or "Untitled"
    long_meta = _meta(first.get("long_meta"), title, False)
    short_meta = _meta(first.get("short_meta"), title, True)
    plan = {
        "scenes": scenes,
        "animate": animate,
        "short": short_segment(scenes, first.get("short_start")),
        "long_meta": long_meta,
        "short_meta": short_meta,
        "thumb_text": (first.get("thumb_text") or title).upper()[:40],
        "thumb_prompt": first.get("thumb_prompt") or scenes[0]["visual"],
    }
    return plan, cost


def _meta(raw, fallback_title: str, short: bool) -> dict:
    raw = raw if isinstance(raw, dict) else {}
    title = (raw.get("title") or fallback_title).strip()
    if short and "#shorts" not in title.lower():
        title = f"{title[:90]} #Shorts"
    tags = [str(t) for t in (raw.get("tags") or []) if str(t).strip()][:15]
    return {"title": title[:100], "description": str(raw.get("description") or "")[:4900], "tags": tags}


def short_segment(scenes: list[dict], start_id: str | None) -> dict | None:
    """Contiguous scenes totalling 30-50 s of speech, starting at start_id if that works."""
    ids = [s["id"] for s in scenes]
    secs = [speech_seconds(s["text"]) for s in scenes]
    if sum(secs) < SHORT_MIN:
        return None
    starts = ([ids.index(start_id)] if start_id in ids else []) + list(range(len(scenes)))
    for i in starts:
        total = 0.0
        for j in range(i, len(scenes)):
            total += secs[j]
            if total > SHORT_MAX:
                break
            if total >= SHORT_MIN:
                return {"start": i, "end": j}
    return None


def estimate_cost(plan: dict, settings: dict, llm_cost: float = 0.0) -> float:
    p = config.PRICES
    n_long = len(plan["scenes"])
    seg = plan["short"]
    n_short = (seg["end"] - seg["start"] + 1) if seg else 0
    img = p["image"][settings["image_quality"]] * (n_long + n_short) + p["thumbnail"]
    chars = sum(len(s["text"]) for s in plan["scenes"])
    tts = 0.0 if "free" in settings["fish_model"] else chars * p["tts_per_million_chars"] / 1e6
    anim = len(plan["animate"]) * p["animate_per_clip"]
    return round(img + tts + anim + llm_cost, 4)
