"""Run: python -m pytest -q   (uses demo mode, no API keys, needs ffmpeg)."""
import os
import tempfile
import time

TMP = tempfile.mkdtemp()
os.environ["YTA_DATA_DIR"] = os.path.join(TMP, "data")
os.environ["YTA_OUTPUT_DIR"] = os.path.join(TMP, "output")

from fastapi.testclient import TestClient  # noqa: E402

from app import script, store  # noqa: E402
from app.main import app  # noqa: E402
from app.media import media_duration  # noqa: E402

client = TestClient(app)
S = store.DEFAULT_SETTINGS["script"]


def test_split_respects_paragraphs_and_limits():
    text = ("One. Two. Three. Four. Five. Six. Seven. Eight.\n\n"
            "Alpha is here. Beta follows! Gamma asks? Delta ends.")
    sc = script.split_scenes(text, {**S, "first_single_sentence_scenes": 2, "max_sentences": 3})
    texts = [s["text"] for s in sc]
    assert texts[0] == "One." and texts[1] == "Two."
    assert all(t.count(".") + t.count("!") + t.count("?") <= 3 for t in texts)
    assert not any("Eight." in t and "Alpha" in t for t in texts), "scene crossed a paragraph"
    assert " ".join(texts).split() == text.split()


def test_split_respects_max_seconds():
    long = " ".join(["This sentence is long enough to take a few seconds to read aloud."] * 6)
    sc = script.split_scenes(long, {**S, "first_single_sentence_scenes": 0, "max_sentences": 6, "max_scene_seconds": 10})
    assert all(len(s["text"]) <= 10 * 15 + 70 for s in sc)


def test_srt_timestamps():
    from app.render import _ts
    assert _ts(3725.5) == "01:02:05,500"


def test_profiles_switch():
    client.put("/api/settings", json={"script": {"language": "French"}})
    fr = client.post("/api/profiles", json={"name": "French"}).json()
    client.put("/api/settings", json={"script": {"language": "German"}})
    de = client.post("/api/profiles", json={"name": "German"}).json()
    assert client.post(f"/api/profiles/{fr['id']}/apply").json()["settings"]["script"]["language"] == "French"
    assert client.post(f"/api/profiles/{de['id']}/apply").json()["settings"]["script"]["language"] == "German"


def test_keys_are_masked():
    client.put("/api/keys", json={"openai": "sk-test-123456"})
    k = client.get("/api/settings").json()["keys"]["openai"]
    assert k.endswith("3456") and "sk-test" not in k


def _wait(pid, timeout=300):
    end = time.time() + timeout
    while time.time() < end:
        p = client.get(f"/api/projects/{pid}").json()
        if not p["running"]:
            assert p["job"]["status"] == "done", p["job"]
            return p
        time.sleep(0.5)
    raise TimeoutError


def test_full_demo_video_end_to_end():
    client.put("/api/settings", json={
        "demo_mode": True, "script": {"target_minutes": 0.5, "language": "English"},
        "subtitles": {"enabled": True, "burn_in": True},
        "transitions": {"mode": "crossfade", "duration": 0.4}, "visual": {"style_id": "base-cartoon"},
    })
    p = client.post("/api/projects", json={"title": "Why we procrastinate", "brief": "psychology", "auto": True}).json()
    p = _wait(p["id"])
    assert p["scenes"] and all(s["image"] and s["audio"] for s in p["scenes"])
    assert os.path.exists(p["output"]) and os.path.exists(p["srt"])
    voice_total = sum(s["duration"] for s in p["scenes"])
    dur = media_duration(p["output"])
    assert abs(dur - voice_total) < 0.6 * len(p["scenes"]) + 1, (dur, voice_total)
    assert p["metadata"]["title"]

    # Ken Burns: the picture must move within the first scene
    import subprocess
    from PIL import Image, ImageChops
    frames = []
    for i, t in enumerate(("0.1", "1.2")):
        f = os.path.join(TMP, f"kb{i}.png")
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", t, "-i", p["output"], "-frames:v", "1", f], check=True)
        frames.append(Image.open(f).convert("RGB"))
    assert ImageChops.difference(*frames).getbbox() is not None, "Ken Burns produced a static frame"

    # animate one scene + regenerate its frame, then re-render with fade transitions
    sid = p["scenes"][1]["id"]
    client.post(f"/api/projects/{p['id']}/scenes/{sid}/animate")
    p = _wait(p["id"])
    assert next(s for s in p["scenes"] if s["id"] == sid)["video"]
    client.post(f"/api/projects/{p['id']}/frames", json={"scene_ids": [p["scenes"][0]["id"]], "force": True})
    _wait(p["id"])
    client.put("/api/settings", json={"transitions": {"mode": "fade"}})
    client.post(f"/api/projects/{p['id']}/refresh-settings")
    client.post(f"/api/projects/{p['id']}/render")
    p = _wait(p["id"])
    assert media_duration(p["output"]) > 5
