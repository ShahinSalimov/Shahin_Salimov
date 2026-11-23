"""Script writing, scene splitting and visual-prompt generation."""
from __future__ import annotations

import re
import uuid

from . import llm, store

WORDS_PER_MINUTE = 150
CHARS_PER_SECOND = 15  # spoken English approx.

STYLE_HINTS = {
    "storytelling": "a story-driven narration with characters, tension and resolution",
    "documentary": "a calm, factual documentary narration",
    "motivational": "an energetic motivational talk addressed directly to the viewer",
    "educational": "a clear educational explainer with examples",
    "mystery": "a suspenseful mystery narration revealing facts step by step",
}


def _script_system(s: dict) -> str:
    return (
        "You are a senior YouTube scriptwriter for faceless, AI-illustrated channels with high retention.\n"
        f"Write in {s['language']}. Style: {STYLE_HINTS.get(s['style'], s['style'])}.\n"
        "Output ONLY the narration text that will be read by a voice-over. No headings, no scene labels, "
        "no stage directions, no markdown. Separate paragraphs with a blank line.\n\n"
        f"HOOK & CTA:\n{s['hook_cta']}\n\n"
        f"SCRIPT RULES:\n{s['rules']}\n\n"
        f"VOICE-OVER DELIVERY RULES (the text goes directly to an expressive TTS engine):\n{s['voice_rules']}\n"
        + (f"\nEXTRA RULES:\n{s['extra_rules']}\n" if s.get("extra_rules") else "")
    )


def write_script(title: str, brief: str, settings: dict) -> tuple[str, list[dict]]:
    """Returns (script, cost entries). Long videos are written section by section."""
    s = settings["script"]
    if settings.get("demo_mode"):
        return demo_script(title, s["target_minutes"]), []
    words = int(float(s["target_minutes"]) * WORDS_PER_MINUTE)
    system = _script_system(s)
    kw = dict(provider=s["llm_provider"], model=s["llm_model"], temperature=float(s["temperature"]))
    costs: list[dict] = []
    topic = f"Video title: {title}\nWhat the video is about: {brief or title}"

    if words <= 1000:
        text, c = llm.chat(system, f"{topic}\n\nWrite the full narration, about {words} words.",
                           max_tokens=max(4000, words * 3), **kw)
        return _clean(text), [c]

    sections = max(3, round(words / 700))
    outline_raw, c = llm.chat(
        "You plan YouTube video structures. Answer with JSON only.",
        f"{topic}\nLanguage: {s['language']}\nPlan the narration as {sections} consecutive sections. "
        'Return {"sections": [{"title": "...", "points": ["..."]}]}',
        json_mode=s["llm_provider"] != "anthropic", max_tokens=4000, **kw)
    costs.append(c)
    outline = llm.extract_json(outline_raw).get("sections", [])[:sections] or [{"title": title, "points": []}]
    per = words // len(outline)
    parts: list[str] = []
    for i, sec in enumerate(outline):
        position = "the opening (apply the hook rules)" if i == 0 else (
            "the final section (end with the closing CTA)" if i == len(outline) - 1 else f"section {i + 1}")
        prev = parts[-1][-600:] if parts else "(start of video)"
        text, c = llm.chat(
            system,
            f"{topic}\n\nFull outline: {[o.get('title') for o in outline]}\n"
            f"Now write {position}: '{sec.get('title')}' covering {sec.get('points')}.\n"
            f"About {per} words. Continue seamlessly from the previous text, do not repeat it:\n{prev}",
            max_tokens=max(4000, per * 3), **kw)
        costs.append(c)
        parts.append(_clean(text))
    return "\n\n".join(parts), costs


def _clean(text: str) -> str:
    text = re.sub(r"<think>.*?</think>", "", text, flags=re.S)
    text = re.sub(r"^\s*(#+|\*\*|scene\s*\d+[:.)-]).*$", "", text, flags=re.I | re.M)
    text = text.replace("**", "")
    return re.sub(r"\n{3,}", "\n\n", text).strip()


_SENT = re.compile(r"(?<=[.!?…])[\"')\]]*\s+(?=[\"'(\[]?[A-ZÀ-ÖØ-ÞƏÜÖĞIİŞÇА-ЯЁ0-9(])")


def split_sentences(paragraph: str) -> list[str]:
    return [x.strip() for x in _SENT.split(paragraph.strip()) if x.strip()]


def split_scenes(script: str, s: dict) -> list[dict]:
    """Paragraph-aware grouping: never crosses a paragraph, respects
    min/max sentences and the max spoken length per scene."""
    max_chars = int(s["max_scene_seconds"]) * CHARS_PER_SECOND
    max_s, min_s = int(s["max_sentences"]), int(s["min_sentences"])
    single = int(s.get("first_single_sentence_scenes", 0))
    groups: list[list[str]] = []
    for para in re.split(r"\n\s*\n", script):
        sentences = split_sentences(para)
        cur: list[str] = []
        for sent in sentences:
            limit = 1 if len(groups) < single else max_s
            too_long = cur and len(" ".join(cur + [sent])) > max_chars
            if cur and (len(cur) >= limit or too_long):
                groups.append(cur)
                cur = []
            cur.append(sent)
        if cur:
            # merge tiny tail into previous group of the same paragraph when allowed
            if groups and len(cur) < min_s and groups[-1] and len(groups[-1]) + len(cur) <= max_s \
                    and len(groups) >= single:
                groups[-1].extend(cur)
            else:
                groups.append(cur)
    return [new_scene(" ".join(g)) for g in groups if g]


def new_scene(text: str) -> dict:
    return {
        "id": uuid.uuid4().hex[:8], "text": text, "visual": "", "prompt": "",
        "image": "", "video": "", "audio": "", "duration": 0.0,
        "animate": False, "status": "new", "error": "",
    }


# ---------------- visual descriptions ----------------
def describe_visuals(proj: dict, scene_ids: list[str] | None = None) -> list[dict]:
    """Fill scene['visual'] (an English image description) for scenes. Returns cost entries."""
    st = proj["settings"]
    scenes = [sc for sc in proj["scenes"] if scene_ids is None or sc["id"] in scene_ids]
    if st.get("demo_mode"):
        for sc in scenes:
            sc["visual"] = "Illustration of: " + sc["text"][:120]
        return []
    lib = store.get_library()
    chars = "\n".join(f"- {c['name']}: {c['description']}" for c in lib["characters"]) or "(none)"
    style = store.find_style(st["visual"]["style_id"])
    consistency = {
        "strong": "Keep a strongly consistent world: recurring characters look identical, similar camera distance and palette.",
        "medium": "Keep characters consistent but vary camera angle and setting naturally.",
        "loose": "Vary compositions freely between scenes.",
    }[st["visual"]["consistency"]]
    sys = (
        "You are an art director turning narration into image prompts for an AI image model.\n"
        "For each scene write ONE vivid English description (25-45 words) of a single still frame that "
        "visually explains the narration: subject, action, setting, composition, mood. "
        "Never ask for written text inside the image. Describe recurring characters exactly as defined.\n"
        f"{consistency}\nVisual style (do not repeat it, it is added later): {style['name'] if style else 'default'}\n"
        f"Recurring characters:\n{chars}\n"
        'Answer JSON only: {"scenes": [{"id": "...", "visual": "..."}]}'
    )
    s = st["script"]
    costs = []
    for i in range(0, len(scenes), 20):
        batch = scenes[i:i + 20]
        ctx = proj["brief"] or proj["title"]
        payload = "\n".join(f'{sc["id"]}: {sc["text"]}' for sc in batch)
        raw, c = llm.chat(sys, f"Video topic: {ctx}\n\nScenes:\n{payload}", provider=s["llm_provider"],
                          model="deepseek-chat" if s["llm_provider"] == "deepseek" else s["llm_model"],
                          temperature=0.9, json_mode=s["llm_provider"] != "anthropic", max_tokens=6000)
        costs.append(c)
        got = {x["id"]: x["visual"] for x in llm.extract_json(raw).get("scenes", []) if "id" in x}
        for sc in batch:
            sc["visual"] = got.get(sc["id"]) or sc["visual"] or sc["text"]
    return costs


def build_prompt(scene: dict, settings: dict) -> str:
    v = settings["visual"]
    style = store.find_style(v["style_id"])
    parts = []
    if style:
        parts.append(style["prefix"])
    parts.append(scene["visual"] or scene["text"])
    if style and style.get("prompt"):
        parts.append(style["prompt"])
    lib = store.get_library()
    for c in lib["characters"]:
        if c["name"].lower() in (scene["text"] + " " + scene["visual"]).lower():
            parts.append(f"{c['name']} looks like: {c['description']}")
    neg = ", ".join(x for x in [v.get("negative", ""), (style or {}).get("negative", "")] if x)
    if neg:
        parts.append(f"Avoid: {neg}.")
    return " ".join(p.strip() for p in parts if p.strip())


def motion_prompt(scene: dict, settings: dict) -> tuple[str, list[dict]]:
    base = f"Subtle cinematic motion that brings this still image to life. Narration: {scene['text'][:300]}"
    if settings.get("demo_mode"):
        return base, []
    s = settings["script"]
    text, c = llm.chat(
        "Write one short English prompt (max 40 words) for an image-to-video model describing natural "
        "camera movement and subject motion for the given frame. No text overlays. Output the prompt only.",
        f"Frame: {scene['visual']}\nNarration: {scene['text']}",
        provider=s["llm_provider"], model="deepseek-chat" if s["llm_provider"] == "deepseek" else s["llm_model"],
        temperature=0.8, max_tokens=300)
    return text.strip().strip('"'), [c]


def youtube_metadata(proj: dict) -> tuple[dict, list[dict]]:
    st = proj["settings"]
    if st.get("demo_mode"):
        return {"title": proj["title"], "description": proj["script"][:300], "tags": ["ai", "story"],
                "thumbnail_prompt": "Bold high-contrast thumbnail of " + proj["title"]}, []
    s = st["script"]
    raw, c = llm.chat(
        "You are a YouTube SEO expert. Answer JSON only.",
        f"Language: {s['language']}\nVideo title idea: {proj['title']}\nScript:\n{proj['script'][:6000]}\n\n"
        'Return {"title": "<=70 chars, curiosity driven", "description": "3 short paragraphs + 3 hashtags", '
        '"tags": ["15 tags"], "thumbnail_prompt": "English image prompt for a 16:9 thumbnail, no text"}',
        provider=s["llm_provider"], model="deepseek-chat" if s["llm_provider"] == "deepseek" else s["llm_model"],
        temperature=0.9, json_mode=s["llm_provider"] != "anthropic", max_tokens=3000)
    return llm.extract_json(raw), [c]


def demo_script(title: str, minutes: float) -> str:
    base = [
        f"What if everything you believed about {title} was only half the story?",
        "Most people never notice it. But the signs are everywhere.",
        "It starts quietly... a small change you almost ignore.",
        "Then one day, it becomes impossible to look away.",
        "Here is the part nobody talks about. The real shift happens in the smallest daily choices.",
        "Write in the comments: have you ever felt this yourself?",
        "Scientists and storytellers agree on one thing. Patterns repeat, until someone decides to break them.",
        "And that someone could be you. Not tomorrow. Today.",
        "If this made you think, subscribe, because the next story goes even deeper.",
    ]
    reps = max(1, round(minutes * WORDS_PER_MINUTE / sum(len(x.split()) for x in base)))
    paras = []
    for r in range(reps):
        chunk = base if r == 0 else base[1:-1]
        paras.append(" ".join(chunk[:5]))
        paras.append(" ".join(chunk[5:]))
    return "\n\n".join(paras)
