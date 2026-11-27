"""Stage 3: build a channel from the research decision.

Blueprint (name, positioning, pillars, visual identity, formats, schedule) → materialized into:
  * a visual style in the Library (same look in every scene)
  * two pipeline profiles: "<name> · Long" (16:9) and "<name> · Shorts" (9:16, burned-in captions)
  * generated logo (avatar) and banner images
  * a checklist of the few steps YouTube does not allow through the API.
"""
from __future__ import annotations

import time
from pathlib import Path

from .. import media, store
from . import ai, db, research

ASSETS = db.ROOT / "assets"

SETUP_CHECKLIST = [
    "Google hesabında youtube.com → profil şəkli → 'Kanal yarat' (və ya Brand Account) ilə kanalı açın.",
    "Kanal adını və handle-ı Blueprint-dəki kimi yazın (ad və handle API ilə dəyişdirilə bilmir).",
    "Profil şəklini (logo.png) YouTube Studio → Customization → Branding bölməsində yükləyin (API ilə mümkün deyil).",
    "youtube.com/verify — telefonla təsdiq edin: custom thumbnail və 15 dəqiqədən uzun videolar üçün lazımdır.",
    "Bu sistemdə Kanal → Ayarlar → 'YouTube-a qoş' düyməsi ilə OAuth icazəsi verin.",
    "'Brendinqi YouTube-a yaz' — təsvir, açar sözlər və banner avtomatik yazılır.",
    "YouTube Studio → Settings → Channel → Advanced: ölkəni seçin (monetizasiya üçün vacibdir).",
]


def _bp_prompt(niche: dict, patterns: dict, inp: dict) -> str:
    return (
        f"Niche: {niche['name']} — {niche.get('description', '')}\nAudience: {niche.get('audience', '')}\n"
        f"Language of the channel: {inp['language']}. Region: {inp['region']}. Visual style preference: {inp['style']}.\n"
        f"Success patterns from outlier videos: {ai_compact(patterns)}\n\n"
        "Design a faceless, 100% AI-produced YouTube channel that publishes long videos AND Shorts and can reach "
        "monetization. Content must be original and valuable (not repetitive templated content).\n"
        'Return {"names": [{"name": "...", "handle": "@...", "why": "..."}] (5 options, short, memorable, available-looking), '
        '"name": "best option", "handle": "@...", "tagline": "...", '
        '"description": "YouTube About text in the channel language, max 900 chars, with keywords", '
        '"keywords": ["15 channel keywords"], "audience": "persona", '
        '"pillars": [{"name": "...", "description": "...", "share": 0-100}] (3-5 pillars, shares sum 100), '
        '"tone": "...", "voice_direction": "what voice to choose for TTS (gender, age, timbre, pace)", '
        '"script_style": "storytelling|documentary|educational|mystery|motivational", '
        '"visual_style": {"name": "...", "prefix": "first sentence of every image prompt (style only)", '
        '"prompt": "4 sentences describing lighting, palette, lens, texture (style only, no subject)", '
        '"negative": "what to avoid"}, '
        '"logo_prompt": "English prompt for a simple bold circular channel avatar, no text", '
        '"banner_prompt": "English prompt for a 16:9 channel banner, key elements in the horizontal center strip, no text", '
        '"long": {"minutes": number, "structure": "beat-by-beat structure"}, '
        '"short": {"seconds": number (30-58), "structure": "beat-by-beat structure"}, '
        '"title_formulas": ["..."], "thumbnail_style": "...", '
        '"hook_cta": "rules for hooks and calls to action for this channel", '
        '"script_rules": "6 concrete rules for scripts of this channel", '
        '"schedule": {"long_per_week": number, "shorts_per_week": number}, '
        '"monetization_plan": ["5 milestones with what to do at each"]}'
    )


def ai_compact(x) -> str:
    import json
    return json.dumps(x, ensure_ascii=False)[:2500]


def _demo_blueprint(niche: dict, inp: dict) -> dict:
    base = niche["name"].split("&")[0].strip()
    name = f"{base.split()[0]} Vault"
    return {
        "names": [{"name": n, "handle": "@" + n.replace(" ", "").lower(), "why": "demo"} for n in
                  (name, f"The {base}", f"{base.split()[0]} Files", f"Deep {base.split()[0]}", f"{base.split()[0]} Lab")],
        "name": name, "handle": "@" + name.replace(" ", "").lower(),
        "tagline": f"Cinematic stories about {base.lower()}.",
        "description": f"{name} tells cinematic, well-researched stories about {base.lower()}. "
                       "New long videos every week and daily Shorts. Subscribe for stories you won't find elsewhere.",
        "keywords": [base.lower(), "documentary", "facts", "story", "history", "mystery", "explained"],
        "audience": niche.get("audience", "18-44"),
        "pillars": [{"name": "Deep dives", "description": "Long investigations", "share": 50},
                    {"name": "Top lists", "description": "Ranked facts", "share": 30},
                    {"name": "Myths vs facts", "description": "Debunking", "share": 20}],
        "tone": "calm, intriguing, confident",
        "voice_direction": "male, 35-45, deep warm baritone, slow pace",
        "script_style": "documentary",
        "visual_style": {"name": f"{name} cinematic",
                         "prefix": "Cinematic realistic photo, 35mm film look, dramatic low-key lighting,",
                         "prompt": "teal and amber color grade, volumetric light, shallow depth of field, film grain",
                         "negative": "text, logo, cartoon, deformed hands"},
        "logo_prompt": f"Minimal bold circular emblem for a channel about {base.lower()}, dark background, gold accent",
        "banner_prompt": f"Wide cinematic panorama themed on {base.lower()}, dark moody, subject in center strip",
        "long": {"minutes": 10, "structure": "Hook → context → 3 escalating acts → twist → CTA"},
        "short": {"seconds": 45, "structure": "Shock line → 3 fast facts → loop ending"},
        "title_formulas": ["The Dark Truth About [Topic]", "Why [Thing] Was Hidden"],
        "thumbnail_style": "One huge subject, dark background, glowing rim light",
        "hook_cta": "Open with the most surprising fact. Ask for comments at minute 2. Subscribe reminder mid-video.",
        "script_rules": "Short sentences. Open loops every 30 seconds. No filler intros.",
        "schedule": {"long_per_week": 2, "shorts_per_week": 7},
        "monetization_plan": ["0→100 subs: consistency", "100→500: double down on winners",
                              "500 + 3,000h: apply for early YPP", "1,000 + 4,000h: full YPP", "Sponsorships"],
    }


def build(progress, rid: str, niche_name: str = "") -> str:
    """Research → blueprint → channel record (draft). Returns channel id."""
    r = db.get_research(rid)
    name = niche_name or (r.get("decision") or {}).get("niche")
    niche = next((c for c in r["candidates"] if c["name"] == name), None)
    if not niche:
        raise RuntimeError("Analizdə bu niş tapılmadı")
    progress(10, "Uğur nümunələri yoxlanılır")
    patterns, c1 = research.patterns_for(r, niche)
    progress(30, "Kanal strategiyası (blueprint) hazırlanır")
    costs = [c1] if c1 else []
    if ai.demo():
        bp = _demo_blueprint(niche, r["input"])
    else:
        bp, c2 = ai.ask_json("You are a YouTube channel strategist and brand designer.",
                             _bp_prompt(niche, patterns, r["input"]), max_tokens=7000)
        costs.append(c2)
    bp["patterns"] = patterns
    sched = bp.get("schedule") or {}
    ap = dict(db.DEFAULT_AUTOPILOT)
    ap["long_per_week"] = int(min(5, max(1, sched.get("long_per_week", 2))))
    ap["shorts_per_week"] = int(min(14, max(0, sched.get("shorts_per_week", 7))))
    ch = db.create_channel({
        "name": bp.get("name", niche["name"]), "niche": niche["name"], "language": r["input"]["language"],
        "research_id": rid, "blueprint": bp, "autopilot": ap,
        "learnings": [{"t": time.time(), "source": "analiz", "text": t} for t in
                      (patterns.get("avoid", [])[:2] + [patterns.get("summary", "")]) if t],
        "costs": [{**x, "t": time.time()} for x in costs if x],
    })
    db.log(ch["id"], f"Kanal blueprint-i yaradıldı: {ch['name']} (niş: {niche['name']})")
    progress(50, "Profil, stil və brendinq materialları yaradılır")
    materialize(lambda p, m: progress(50 + p / 2, m), ch["id"])
    return ch["id"]


def _settings_for(bp: dict, language: str, style_id: str, kind: str) -> dict:
    base = store.get_settings()
    pat = bp.get("patterns") or {}
    rules = "\n".join(filter(None, [bp.get("script_rules", ""),
                                    "Channel tone: " + bp.get("tone", ""),
                                    "Use these title/hook patterns when relevant: " + "; ".join(pat.get("hook_patterns", [])[:5]),
                                    "Avoid: " + "; ".join(pat.get("avoid", [])[:4])]))
    s = store.deep_merge(base, {
        "script": {"language": language, "style": bp.get("script_style", "documentary"),
                   "hook_cta": bp.get("hook_cta", base["script"]["hook_cta"]),
                   "extra_rules": rules},
        "visual": {"style_id": style_id, "aspect": "16:9"},
    })
    if kind == "long":
        s["script"]["target_minutes"] = float((bp.get("long") or {}).get("minutes") or pat.get("ideal_long_minutes") or 10)
        s["script"]["extra_rules"] += "\nStructure: " + (bp.get("long") or {}).get("structure", "")
        return s
    secs = float((bp.get("short") or {}).get("seconds") or pat.get("ideal_short_seconds") or 45)
    return store.deep_merge(s, {
        "script": {"target_minutes": round(min(58, max(20, secs)) / 60, 2),
                   "first_single_sentence_scenes": 99, "max_sentences": 1, "max_scene_seconds": 6,
                   "hook_cta": "The very first sentence is the hook and must land in under 2 seconds. "
                               "No greetings, no channel name. The last sentence loops back to the first one. "
                               "Optional: one short 'follow for part 2' at the very end.",
                   "extra_rules": s["script"]["extra_rules"] + "\nThis is a YouTube Short (vertical, under 60 seconds). "
                                  "Structure: " + (bp.get("short") or {}).get("structure", "")},
        "visual": {"aspect": "9:16"},
        "subtitles": {"enabled": True, "burn_in": True, "chars_per_line": 20, "max_lines": 2, "font_size": 64},
        "transitions": {"mode": "cut", "duration": 0.2},
        "motion": {"zoom_percent": 20},
    })


def materialize(progress, cid: str) -> dict:
    ch = db.get_channel(cid)
    bp = ch["blueprint"]
    vs = bp.get("visual_style") or {}
    progress(5, "Vizual stil kitabxanaya əlavə olunur")
    style = store.upsert_library_item("styles", {
        "id": ch.get("style_id") or "", "name": vs.get("name") or f"{ch['name']} style",
        "prefix": vs.get("prefix", ""), "prompt": vs.get("prompt", ""), "negative": vs.get("negative", ""),
        "channel_id": cid})
    progress(20, "Long və Shorts profilləri yaradılır")
    profiles = dict(ch.get("profiles") or {})
    for kind, label in (("long", "Long"), ("short", "Shorts")):
        st = _settings_for(bp, ch["language"], style["id"], kind)
        if profiles.get(kind) and store.get_profile(profiles[kind]):
            _replace_profile(profiles[kind], st)
        else:
            profiles[kind] = store.create_profile_with(f"{ch['name']} · {label}", st)["id"]
    d = ASSETS / cid
    d.mkdir(parents=True, exist_ok=True)
    assets = dict(ch.get("assets") or {})
    costs = []
    for i, (key, aspect, prompt) in enumerate((
            ("logo", "1:1", bp.get("logo_prompt") or f"Bold minimal emblem for {ch['name']}"),
            ("banner", "16:9", (bp.get("banner_prompt") or ch["name"]) + ". Wide composition, all key elements in the "
                               "horizontal middle strip, empty top and bottom areas, no text, no letters."))):
        progress(40 + 30 * i, f"{'Loqo' if key == 'logo' else 'Banner'} şəkli yaradılır")
        st = store.deep_merge(store.get_settings(), {"visual": {"aspect": aspect, "quality": "medium"}})
        out = d / f"{key}.png"
        try:
            c = media.generate_image(f"{vs.get('prefix', '')} {prompt}".strip(), out, st)
            costs.append({**c, "t": time.time()})
            assets[key] = str(out)
        except Exception as e:  # noqa: BLE001 - branding images are optional
            db.log(cid, f"{key} yaradılmadı: {e}", "warn")

    def upd(c):
        c.update(style_id=style["id"], profiles=profiles, assets=assets, status="ready",
                 checklist=[{"text": t, "done": False} for t in SETUP_CHECKLIST] if not c.get("checklist") else c["checklist"])
        c.setdefault("costs", []).extend(costs)
    ch = db.update_channel(cid, upd)
    db.log(cid, "Profillər, vizual stil, loqo və banner hazırdır")
    progress(100, "Kanal hazırdır")
    return ch


def _replace_profile(pid: str, settings: dict) -> None:
    with store._lock:
        profiles = store.list_profiles()
        for p in profiles:
            if p["id"] == pid:
                p["settings"], p["updated"] = store.deep_merge(store.DEFAULT_SETTINGS, settings), time.time()
        store._write(store.DATA / "profiles.json", profiles)


def profile_settings(ch: dict, kind: str) -> dict:
    """Settings a new video of this channel/kind is produced with (demo flag follows the global toggle)."""
    p = store.get_profile(ch["profiles"].get(kind, ""))
    st = store.deep_merge(store.DEFAULT_SETTINGS, p["settings"]) if p else _settings_for(
        ch["blueprint"], ch["language"], ch.get("style_id", ""), kind)
    g = store.get_settings()
    st["demo_mode"] = g["demo_mode"]
    st["costs"] = g["costs"]
    return st


def asset_path(cid: str, key: str) -> Path | None:
    p = db.get_channel(cid)["assets"].get(key)
    return Path(p) if p and Path(p).exists() else None
