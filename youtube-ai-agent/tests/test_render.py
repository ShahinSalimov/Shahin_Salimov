import subprocess

from PIL import Image, ImageChops

from app import providers, render, thumbnail


def _scenes(base, n, portrait):
    out = []
    for i in range(n):
        sid = f"s{i:03d}"
        providers.image(f"scene {i}", base / f"{sid}.png", portrait=portrait)
        providers.tts("Short narration sentence number %d here." % i, base / f"{sid}.mp3")
        out.append({"id": sid, "text": f"Short narration sentence number {i} here.",
                    "image": f"{sid}.png", "audio": f"{sid}.mp3"})
    return out


def _size(path):
    o = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height",
                        "-of", "csv=p=0", str(path)], capture_output=True, text=True).stdout.strip()
    return tuple(map(int, o.split(",")))


def test_render_long_and_short(tmp_path):
    long_sc = _scenes(tmp_path, 3, False)
    res = render.render_video(long_sc, tmp_path, tmp_path / "long.mp4")
    assert _size(res["path"]) == (1920, 1080)
    speech = sum(providers.media_duration(tmp_path / s["audio"]) for s in long_sc)
    assert abs(res["duration"] - speech) < 2
    assert "-->" in open(res["srt"]).read()

    short_sc = _scenes(tmp_path, 2, True)
    for s in short_sc:
        s["id"] += "p"
    plain = render.render_video(short_sc, tmp_path, tmp_path / "plain.mp4", portrait=True)
    burned = render.render_video(short_sc, tmp_path, tmp_path / "short.mp4", portrait=True, burn_subs=True)
    assert _size(burned["path"]) == (1080, 1920)
    frames = []
    for name in ("plain.mp4", "short.mp4"):
        f = tmp_path / f"{name}.png"
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", "0.5", "-i", str(tmp_path / name), "-frames:v", "1",
                        str(f)], check=True)
        frames.append(Image.open(f).convert("RGB"))
    assert ImageChops.difference(*frames).getbbox() is not None, "subtitles were not burned in"


def test_render_uses_animated_clip(tmp_path):
    sc = _scenes(tmp_path, 2, False)
    providers.animate(tmp_path / sc[0]["image"], "move", tmp_path / "v.mp4")
    sc[0]["video"] = "v.mp4"
    assert render.render_video(sc, tmp_path, tmp_path / "a.mp4")["duration"] > 2


def test_thumbnail_size(tmp_path):
    providers.image("thumb", tmp_path / "t.png")
    out = thumbnail.compose(tmp_path / "t.png", "Split in two", tmp_path / "t.jpg")
    img = Image.open(out)
    assert img.size == (1280, 720) and out.stat().st_size < 2_000_000
