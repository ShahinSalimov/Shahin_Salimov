"""Production package for one video: timed segments, AI video prompts per clip, voiceover, thumbnail.

All prompts are English. Clips are written for 5-10 second text-to-video / image-to-video tools; a
segment longer than its clips is filled with slow-motion replays and speed ramps in the editor.
"""
from __future__ import annotations

from .catalog import BASE_STYLE, CAMERA, NEGATIVE, SCENARIOS_BY_KEY, Car, Scenario, article
from .planner import VideoPlan

LONG_TARGET_S = 510      # 8:30 - over 8 minutes so mid-roll ads are possible after monetisation
INTRO_S = 30
OUTRO_S = 45


def damage(speed: int) -> str:
    if speed <= 60:
        return "crumpled front bumper, cracked headlights, deployed airbags, car otherwise intact"
    if speed <= 120:
        return "front end crushed back to the wheels, hood buckled upward, shattered windshield, coolant steam"
    if speed <= 220:
        return "front half destroyed, carbon fiber body panels shredded, wheels torn off, debris field across the floor"
    return "car almost unrecognisable, chassis folded, engine bay exposed, parts scattered 30 meters, thick dust cloud"


def impact_phrase(s: Scenario) -> str:
    return {"frontal": "head-on into", "offset": "with only its left front corner (40% offset) into",
            "side": "sideways, driver door first, into"}[s.impact]


def clip(beat: str, car: Car, color: str, s: Scenario, speed: int, lighting: str, aspect: str) -> str:
    action = {
        "reveal": f"parked motionless 50 meters in front of {s.wall}, showroom-clean, light reflections gliding over the paint",
        "runup": f"accelerating hard at {speed} km/h toward {s.wall}, tires gripping, exhaust heat shimmer",
        "impact_wide": f"crashing {impact_phrase(s)} {s.wall} at {speed} km/h, body crumpling realistically, glass and fragments exploding outward",
        "impact_close": f"crashing {impact_phrase(s)} {s.wall} at {speed} km/h, "
                        + ("driver door caving in around the pole, side airbags firing" if s.impact == "side"
                           else "front end folding, airbags firing"),
        "drone": f"hitting {s.wall} at {speed} km/h, debris spraying in a fan shape",
        "aftermath": f"wrecked after hitting {s.wall} at {speed} km/h: {damage(speed)}",
        "cabin": f"crashing into {s.wall} at {speed} km/h",
    }[beat]
    return (f"{BASE_STYLE}. Camera: {CAMERA[beat]}. {article(color).capitalize()} {color} {car.name} {action}, at {s.location}, "
            f"{lighting}. Aspect ratio {aspect}. Negative: {NEGATIVE}.")


def _ts(sec: int) -> str:
    return f"{sec // 60}:{sec % 60:02d}"


def _slots(start: int, end: int, beats: list[str]) -> list[tuple[int, int, str]]:
    step = (end - start) / len(beats)
    return [(round(start + i * step), round(start + (i + 1) * step), b) for i, b in enumerate(beats)]


ROUND_BEATS = ["reveal", "runup", "impact_wide", "impact_close", "drone", "aftermath"]


def _rounds(plan: VideoPlan) -> list[tuple[str, Car, str, int]]:
    """(label, car, color, speed) per round."""
    cars, colors = plan.cars, plan.colors
    if plan.format_key == "speed_ladder":
        return [(f"{v} km/h", cars[0], colors[0], v) for v in plan.speeds]
    return [(f"{c.name} ({c.price_label})", c, colors[i], plan.speeds[0]) for i, c in enumerate(cars)]


def build_long(plan: VideoPlan) -> dict:
    s = SCENARIOS_BY_KEY[plan.scenario_key]
    aspect = "16:9"
    rounds = _rounds(plan)
    round_len = (LONG_TARGET_S - INTRO_S - OUTRO_S) // len(rounds)
    hero_label, hero_car, hero_color, hero_speed = rounds[-1]
    if plan.format_key == "speed_ladder":
        intro = [("reveal", hero_car, hero_color, plan.speeds[0]), ("runup", hero_car, hero_color, hero_speed)]
    else:
        intro = [("reveal", c, col, v) for _, c, col, v in rounds]
    segments = [{
        "start": 0, "end": INTRO_S, "label": "Intro",
        "clips": [
            {"start": 0, "end": 4, "beat": "impact_close",
             "prompt": clip("impact_close", hero_car, hero_color, s, hero_speed, plan.lighting, aspect),
             "edit": "cold open: the most violent impact of the video first, then hard cut"},
            *[{"start": a, "end": b, "beat": beat,
               "prompt": clip(beat, c, col, s, v, plan.lighting, aspect), "edit": "quick intro cuts with name + price lower-third"}
              for (a, b, beat), (c, col, v) in zip(_slots(4, INTRO_S, [b for b, *_ in intro]), [x[1:] for x in intro])],
        ],
        "voiceover": intro_voiceover(plan, rounds),
        "on_screen_text": ", ".join(lbl for lbl, *_ in rounds),
    }]
    t = INTRO_S
    for n, (label, car, color, speed) in enumerate(rounds, 1):
        end = t + round_len
        segments.append({
            "start": t, "end": end, "label": f"Round {n}: {label}",
            "clips": [{"start": a, "end": b, "beat": beat,
                       "prompt": clip(beat, car, color, s, speed, plan.lighting, aspect),
                       "edit": "slow-motion replay x2 + speed ramp" if beat.startswith("impact") else ""}
                      for a, b, beat in _slots(t, end, ROUND_BEATS)],
            "voiceover": round_voiceover(n, car, speed, s),
            "on_screen_text": f"ROUND {n} | {label.upper()} | DAMAGE: ?/10",
        })
        t = end
    segments.append({
        "start": t, "end": t + OUTRO_S, "label": "Final verdict",
        "clips": [{"start": t, "end": t + OUTRO_S, "beat": "aftermath",
                   "prompt": clip("aftermath", hero_car, hero_color, s, hero_speed, plan.lighting, aspect),
                   "edit": "side-by-side of all wrecks, damage score table overlay, end screen last 20 s"}],
        "voiceover": outro_voiceover(plan),
        "on_screen_text": "FINAL DAMAGE RANKING",
    })
    return {"aspect": aspect, "duration_s": t + OUTRO_S, "duration": _ts(t + OUTRO_S),
            "segments": segments, "thumbnail_prompt": thumbnail_prompt(plan, s, aspect),
            "thumbnail_text": thumbnail_text(plan), "music": "dark cinematic hybrid trailer, heavy sub-bass hits on each impact",
            "editing_notes": EDIT_NOTES_LONG}


def build_short(plan: VideoPlan) -> dict:
    s = SCENARIOS_BY_KEY[plan.scenario_key]
    aspect = "9:16"
    speed = plan.speeds[0]
    cars, colors = plan.cars, plan.colors
    if len(cars) == 1:
        c, col = cars[0], colors[0]
        beats = [(0, 2, "impact_close", c, col, "HOOK: freeze-frame at impact, then rewind effect"),
                 (2, 7, "reveal", c, col, f"text: {c.price_label} {c.model.upper()}"),
                 (7, 13, "runup", c, col, f"text: {speed} KM/H, speed counter"),
                 (13, 20, "impact_wide", c, col, "extreme slow motion, bass hit"),
                 (20, 26, "aftermath", c, col, "text: DAMAGE ?/10"),
                 (26, 30, "drone", c, col, "loop: last frame matches first frame")]
    else:
        (a, b), (ca, cb) = cars[:2], colors[:2]
        beats = [(0, 2, "impact_close", a, ca, "HOOK: both cars split-screen at impact"),
                 (2, 6, "reveal", a, ca, f"text: A = {a.model.upper()}"),
                 (6, 10, "reveal", b, cb, f"text: B = {b.model.upper()}"),
                 (10, 17, "impact_wide", a, ca, f"text: {speed} KM/H"),
                 (17, 24, "impact_wide", b, cb, "same angle as A"),
                 (24, 32, "aftermath", a, ca, "split-screen A vs B wrecks, text: A or B?")]
    clips = [{"start": t0, "end": t1, "beat": beat, "prompt": clip(beat, car, col, s, speed, plan.lighting, aspect),
              "edit": edit} for t0, t1, beat, car, col, edit in beats]
    dur = clips[-1]["end"]
    return {"aspect": aspect, "duration_s": dur, "duration": _ts(dur),
            "segments": [{"start": 0, "end": dur, "label": "Short", "clips": clips,
                          "voiceover": short_voiceover(plan), "on_screen_text": ""}],
            "thumbnail_prompt": None, "thumbnail_text": None,
            "music": "trending phonk / hard-hitting bass, drop exactly on the impact frame",
            "editing_notes": EDIT_NOTES_SHORT}


def build_production(plan: VideoPlan) -> dict:
    return build_long(plan) if plan.kind == "long" else build_short(plan)


# ---- voiceover / thumbnail text ---------------------------------------------------------------

def intro_voiceover(plan: VideoPlan, rounds) -> str:
    names = ", ".join(r[1].name for r in rounds) if plan.format_key != "speed_ladder" else rounds[0][1].name
    total = sum({r[1].key: r[1].price_usd for r in rounds}.values())
    return (f"Today, {names} - roughly ${total:,} worth of machinery - goes up against one thing that never moves: "
            f"a concrete wall. Every crash you are about to see is a realistic AI simulation. "
            f"Stay until the end, because the final result is not what you expect.")


def round_voiceover(n: int, car: Car, speed: int, s: Scenario) -> str:
    return (f"Round {n}. The {car.name}, a car worth around {car.price_label}. Speed: {speed} kilometers per hour. "
            f"Target: {s.wall}. Watch the front end in slow motion... and here is what is left of it. "
            f"Damage score - you decide in the comments before I reveal mine.")


def outro_voiceover(plan: VideoPlan) -> str:
    return (f"So, which one held up best? Here is the final damage ranking. {plan.fmt.hook_question.format(**fill(plan))} "
            "Subscribe - a new crash test drops every single day, and you choose which car hits the wall next.")


def short_voiceover(plan: VideoPlan) -> str:
    f = fill(plan)
    return f"{f.get('price', '')} {f.get('car', f.get('car_a', ''))}. {plan.speeds[0]} kilometers per hour. Concrete wall. " \
           f"{plan.fmt.hook_question.format(**f)}"


def thumbnail_text(plan: VideoPlan) -> str:
    f = fill(plan)
    return {"speed_ladder": "300 KM/H?", "showdown": "WHO SURVIVES?", "price_ladder": f"{f['low_price']} vs {f['high_price']}",
            "brand_battle": "TOUGHEST BRAND?", "suv_tank": "REAL TANK?", "top_list": f"{f['total_price']} GONE"
            }.get(plan.format_key, f"{plan.speeds[0]} KM/H")


def thumbnail_prompt(plan: VideoPlan, s: Scenario, aspect: str) -> str:
    cars = plan.cars
    if len(cars) == 1:
        subject = (f"split composition: left half a pristine {plan.colors[0]} {cars[0].name} gleaming, right half the same car "
                   f"destroyed against {s.wall}, jagged diagonal split line")
    else:
        subject = ("the " + " and the ".join(f"{col} {c.name}" for c, col in zip(cars[:3], plan.colors))
                   + f" lined up facing {s.wall}, the nearest one mid-impact with debris exploding toward the camera")
    return (f"YouTube thumbnail, {BASE_STYLE}, high contrast, saturated colors, {subject}, {plan.lighting}, "
            f"dramatic rim light, clean empty area in the upper-left third for big bold text. Aspect ratio {aspect}. "
            f"Negative: {NEGATIVE}.")


def fill(plan: VideoPlan) -> dict:
    cars = plan.cars
    f = {"speed": plan.speeds[-1], "car": cars[0].name, "model": cars[0].model, "price": cars[0].price_label,
         "a_model": f"{article(cars[0].model)} {cars[0].model}",
         "low_price": cars[0].price_label, "high_price": cars[-1].price_label}
    total = sum(c.price_usd for c in cars)
    f["total_price"] = f"${total / 1_000_000:.1f}M".replace(".0M", "M") if total >= 1_000_000 else f"${total // 1000}K"
    for i, c in enumerate(cars):
        tag = "abc"[i] if i < 3 else str(i)
        f[f"car_{tag}"], f[f"model_{tag}"], f[f"brand_{tag}"] = c.name, c.model, c.brand
    return f


EDIT_NOTES_LONG = [
    "First 5 seconds = the hardest impact of the video (retention).",
    "Every 25-40 s change something: angle, speed ramp, sound hit, on-screen counter.",
    "Use the same voice for every video (ElevenLabs or similar) - channel identity.",
    "Damage score card after every round keeps people watching to the final ranking.",
    "Last 20 s: end screen with the best Short + subscribe element.",
    "Add a small 'AI SIMULATION' label in a corner for the whole video.",
]
EDIT_NOTES_SHORT = [
    "Impact frame in the first second - no intro, no logo.",
    "Captions burned in, large, centered in the safe zone (avoid bottom 20% and right edge).",
    "End frame should loop seamlessly into the first frame.",
    "Add a small 'AI SIMULATION' label in a corner.",
]
