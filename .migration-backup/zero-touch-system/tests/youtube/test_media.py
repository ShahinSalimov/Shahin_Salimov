"""Tests for TTS, image generation, subtitles, ffmpeg render and QC (real ffmpeg, small fake assets)."""
import base64
import json
import subprocess

import pytest
import responses

from orgs.youtube.tools.media_gen import FakeImageGen, OpenAIImageGen, pick_openai_size
from orgs.youtube.tools.qc import hard_failures, measure
from orgs.youtube.tools.render import (build_ass, chunk_words, render_video, scale_scene_durations)
from orgs.youtube.tools.tts import ElevenLabsTTS, FakeTTS, alignment_to_words

FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"


def _probe(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-print_format", "json", "-show_streams", "-show_format",
                          str(path)], capture_output=True, text=True, check=True).stdout
    return json.loads(out)


# --- TTS -----------------------------------------------------------------------------------------

def test_fake_tts_creates_audio_with_word_timings(tmp_path):
    res = FakeTTS().synthesize("Your budget is not failing because of you", voice_id="v", speed=1.0,
                               out_path=tmp_path / "voice.wav")
    assert res.audio_path.exists()
    assert [w["word"] for w in res.words][:2] == ["Your", "budget"]
    assert res.words[0]["start"] == 0 and res.words[-1]["end"] == pytest.approx(res.duration_s, abs=0.05)
    dur = float(_probe(res.audio_path)["format"]["duration"])
    assert dur == pytest.approx(res.duration_s, abs=0.1)
    assert res.characters == len("Your budget is not failing because of you")


def test_alignment_to_words():
    text = "Hi there"
    alignment = {"characters": list(text),
                 "character_start_times_seconds": [0.0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7],
                 "character_end_times_seconds": [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8]}
    assert alignment_to_words(alignment) == [{"word": "Hi", "start": 0.0, "end": 0.2},
                                             {"word": "there", "start": 0.3, "end": 0.8}]


@responses.activate
def test_elevenlabs_request_and_decode(tmp_path):
    fake = FakeTTS().synthesize("hi there", voice_id="v", speed=1, out_path=tmp_path / "src.wav")
    audio_b64 = base64.b64encode(fake.audio_path.read_bytes()).decode()
    responses.post("https://api.elevenlabs.io/v1/text-to-speech/VOICE/with-timestamps",
                   json={"audio_base64": audio_b64,
                         "alignment": {"characters": list("hi there"),
                                       "character_start_times_seconds": [i * 0.1 for i in range(8)],
                                       "character_end_times_seconds": [(i + 1) * 0.1 for i in range(8)]}})
    res = ElevenLabsTTS(api_key="k").synthesize("hi there", voice_id="VOICE", speed=1.0,
                                                out_path=tmp_path / "voice.mp3")
    req = responses.calls[0].request
    assert req.headers["xi-api-key"] == "k"
    assert json.loads(req.body)["text"] == "hi there"
    assert res.audio_path.read_bytes() == fake.audio_path.read_bytes()
    assert [w["word"] for w in res.words] == ["hi", "there"]


# --- images ------------------------------------------------------------------------------------------

def test_fake_image_has_requested_size(tmp_path):
    p = FakeImageGen().generate("a receipt on a desk", 1080, 1920, tmp_path / "s0.png")
    s = _probe(p)["streams"][0]
    assert (s["width"], s["height"]) == (1080, 1920)


@pytest.mark.parametrize("w,h,size", [(1080, 1920, "1024x1536"), (1920, 1080, "1536x1024"),
                                      (1080, 1080, "1024x1024"), (1280, 720, "1536x1024")])
def test_pick_openai_size(w, h, size):
    assert pick_openai_size(w, h) == size


@responses.activate
def test_openai_image_request(tmp_path):
    png = FakeImageGen().generate("x", 64, 64, tmp_path / "x.png").read_bytes()
    responses.post("https://api.openai.com/v1/images/generations",
                   json={"data": [{"b64_json": base64.b64encode(png).decode()}]})
    p = OpenAIImageGen(api_key="sk").generate("calendar top-down", 1080, 1920, tmp_path / "s.png")
    body = json.loads(responses.calls[0].request.body)
    assert body["size"] == "1024x1536" and body["prompt"] == "calendar top-down"
    assert responses.calls[0].request.headers["Authorization"] == "Bearer sk"
    assert p.read_bytes() == png


# --- subtitles & timing ------------------------------------------------------------------------------

WORDS = [{"word": w, "start": i * 0.5, "end": i * 0.5 + 0.4} for i, w in enumerate(
    "Your budget is not failing because of {you}".split())]


def test_chunk_words():
    chunks = chunk_words(WORDS, 3)
    assert [len(c) for c in chunks] == [3, 3, 2]


def test_build_ass_karaoke_and_escaping():
    ass = build_ass(WORDS, width=1080, height=1920, max_words=3, position="lower_third", font_name="DejaVu Sans")
    assert "PlayResX: 1080" in ass and "PlayResY: 1920" in ass
    dialogues = [l for l in ass.splitlines() if l.startswith("Dialogue:")]
    assert len(dialogues) == 3
    assert "{\\k" in dialogues[0]
    assert "\\{you\\}" in dialogues[-1] or "(you)" in dialogues[-1]   # braces must not open ASS tags
    assert dialogues[0].split(",")[1] == "0:00:00.00"


def test_scale_scene_durations_to_voice():
    scenes = [{"scene_index": 0, "start_s": 0, "end_s": 3}, {"scene_index": 1, "start_s": 3, "end_s": 9}]
    out = scale_scene_durations(scenes, 12.0)
    assert [round(d, 2) for d in out] == [4.0, 8.0]
    assert sum(scale_scene_durations(scenes, 4.5)) == pytest.approx(4.5)


# --- render + QC --------------------------------------------------------------------------------------

PLAN = {
    "output": {"width": 1080, "height": 1920, "fps": 30, "container": "mp4", "codec": "h264"},
    "voice": {"provider": "fake", "voice_id": "v", "speed": 1.0},
    "scenes": [
        {"scene_index": 0, "start_s": 0, "end_s": 2, "asset_provider": "fake", "asset_prompt": "receipt",
         "motion": "kenburns_in", "overlay_text": "It's not you", "transition_in": "cut"},
        {"scene_index": 1, "start_s": 2, "end_s": 4, "asset_provider": "fake", "asset_prompt": "calendar",
         "motion": "pan_left", "overlay_text": "Irregular costs: 100%", "transition_in": "cut"},
    ],
    "music": None,
    "subtitles": {"style": "word_highlight", "max_words_per_line": 3, "position": "lower_third"},
    "thumbnail_prompt": "bold card", "ai_disclosure_required": False,
}


@pytest.fixture(scope="module")
def rendered(tmp_path_factory):
    d = tmp_path_factory.mktemp("render")
    tts = FakeTTS().synthesize("Your budget is not failing because of you", voice_id="v", speed=1.0,
                               out_path=d / "voice.wav")
    images = [FakeImageGen().generate(s["asset_prompt"], 1080, 1920, d / f"s{i}.png")
              for i, s in enumerate(PLAN["scenes"])]
    music = d / "music.wav"
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-f", "lavfi", "-i", "sine=f=440:d=10", str(music)], check=True)
    out = render_video(PLAN, tts, images, d / "final.mp4", music_path=music, font_path=FONT)
    return out, tts


def test_render_produces_valid_video(rendered):
    out, tts = rendered
    info = _probe(out)
    v = next(s for s in info["streams"] if s["codec_type"] == "video")
    a = next(s for s in info["streams"] if s["codec_type"] == "audio")
    assert (v["width"], v["height"], v["codec_name"]) == (1080, 1920, "h264")
    assert v["pix_fmt"] == "yuv420p" and a["codec_name"] == "aac"
    assert float(info["format"]["duration"]) == pytest.approx(tts.duration_s + 0.4, abs=0.3)


def test_qc_measure_on_rendered_video(rendered):
    out, tts = rendered
    rep = measure(out)
    assert rep["width"] == 1080 and rep["height"] == 1920 and rep["has_audio"]
    assert -16.5 < rep["integrated_lufs"] < -11.5
    assert rep["black_segments"] == []
    assert hard_failures(rep, PLAN["output"], fmt="shorts") == []


def test_qc_detects_black_video_wrong_size_and_silence(tmp_path):
    bad = tmp_path / "bad.mp4"
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-f", "lavfi", "-i", "color=c=black:s=640x360:d=3:r=30",
                    "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo", "-t", "3", "-c:v", "libx264",
                    "-pix_fmt", "yuv420p", "-c:a", "aac", str(bad)], check=True)
    rep = measure(bad)
    problems = hard_failures(rep, PLAN["output"], fmt="shorts")
    text = " ".join(problems)
    assert "resolution" in text and "black" in text and "loudness" in text


def test_qc_shorts_max_duration():
    rep = {"width": 1080, "height": 1920, "duration_s": 200.0, "has_audio": True, "integrated_lufs": -14.0,
           "black_segments": [], "file_size_mb": 50, "video_codec": "h264"}
    assert any("duration" in p for p in hard_failures(rep, PLAN["output"], fmt="shorts"))
    assert hard_failures(rep, {"width": 1080, "height": 1920}, fmt="longform") == []
