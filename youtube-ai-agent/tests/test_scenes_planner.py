from app import config, planner, providers
from app.scenes import split_scenes

S = config.DEFAULT_SETTINGS


def _script(seconds: float) -> str:
    sent = "The red supercar raced along the coast at dawn."  # 48 chars ≈ 3.2 s
    n = int(seconds / 3.2) + 1
    sents = [sent] * n
    return "\n\n".join(" ".join(sents[i:i + 3]) for i in range(0, n, 3))


def test_split_rules():
    text = "One. Two. Three. Four. Five. Six. Seven. Eight. Nine. Ten. Eleven.\n\nAlpha. Beta. Gamma. Delta."
    sc = split_scenes(text)
    assert [s["text"] for s in sc[:8]] == ["One.", "Two.", "Three.", "Four.", "Five.", "Six.", "Seven.", "Eight."]
    assert sc[8]["text"] == "Nine. Ten. Eleven."
    assert not any("Eleven." in s["text"] and "Alpha" in s["text"] for s in sc)
    assert all(len(s["text"]) <= 225 for s in split_scenes(" ".join(["A long sentence about cars and speed."] * 40)))


def test_plan_fills_missing_scenes(monkeypatch):
    def half(system, user):
        ids = [l.split(":")[0] for l in user.splitlines() if l.startswith("s0")]
        return {"scenes": [{"id": i, "visual": "v"} for i in ids[::2]]}, 0.0
    monkeypatch.setattr(providers, "deepseek_json", half)
    plan, _ = planner.make_plan(_script(60), "Test", S)
    assert all(s["visual"] for s in plan["scenes"])
    assert plan["long_meta"]["title"] == "Test" and plan["short_meta"]["title"].endswith("#Shorts")


def test_animate_choice(monkeypatch):
    plan, _ = planner.make_plan(_script(120), "T", {**S, "max_animated": 3})
    ids = [s["id"] for s in plan["scenes"]]
    assert plan["animate"][:2] == ids[:2] and len(plan["animate"]) <= 3
    monkeypatch.setattr(providers, "kie_enabled", lambda: False)
    plan, _ = planner.make_plan(_script(120), "T", S)
    assert plan["animate"] == []


def test_short_segment_skipped_when_script_short():
    plan, _ = planner.make_plan(_script(15), "T", S)
    assert plan["short"] is None


def test_short_segment_within_30_50s():
    plan, _ = planner.make_plan(_script(300), "T", S)
    seg = plan["short"]
    secs = sum(len(s["text"]) / 15 for s in plan["scenes"][seg["start"]:seg["end"] + 1])
    assert 30 <= secs <= 50


def test_estimate_cost():
    plan = {"scenes": [{"text": "x" * 100}] * 70, "short": {"start": 0, "end": 6}, "animate": []}
    assert abs(planner.estimate_cost(plan, S, 0.02) - (77 * 0.016 + 0.063 + 0.02)) < 1e-6
    assert planner.estimate_cost({**plan, "animate": ["a", "b"]}, S) > planner.estimate_cost(plan, S) + 0.9


def test_image_prompt_orientation():
    assert "vertical 9:16" in planner.image_prompt("car", True)
    assert "Avoid:" in planner.image_prompt("car")
