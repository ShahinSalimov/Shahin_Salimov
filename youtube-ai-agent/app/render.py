"""ffmpeg montage: Ken Burns or animated clip per scene, crossfades, subtitles (.srt, optionally burned in)."""
from __future__ import annotations

import random
import shutil
import subprocess
import textwrap
from pathlib import Path

from .providers import media_duration

FPS = 30
CRF = 20
XFADE = 0.4            # crossfade seconds
TAIL_PAD = 0.3         # silence after each scene's speech
ZOOM = 0.12            # Ken Burns intensity
CHUNK = 15             # scenes per crossfade group (keeps filter graphs small)
TRANSITIONS = ["fade", "dissolve", "fadeblack", "smoothleft", "smoothright"]
MOVES = ["zoom_in", "zoom_out", "pan_left", "pan_right", "pan_up", "pan_down"]


class RenderError(RuntimeError):
    pass


def frame(portrait: bool) -> tuple[int, int]:
    return (1080, 1920) if portrait else (1920, 1080)


def _ff(args: list[str], cwd: Path | None = None) -> None:
    p = subprocess.run(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", *args],
                       capture_output=True, text=True, cwd=cwd)
    if p.returncode != 0:
        raise RenderError(p.stderr[-1500:])


def ken_burns(move: str, dur: float, w: int, h: int) -> str:
    n = max(1, int(dur * FPS))
    cx, cy = "iw/2-(iw/zoom/2)", "ih/2-(ih/zoom/2)"
    z, x, y = {
        "zoom_in": (f"1+{ZOOM}*on/{n}", cx, cy),
        "zoom_out": (f"1+{ZOOM}-{ZOOM}*on/{n}", cx, cy),
        "pan_right": (f"{1 + ZOOM}", f"(iw-iw/zoom)*on/{n}", cy),
        "pan_left": (f"{1 + ZOOM}", f"(iw-iw/zoom)*(1-on/{n})", cy),
        "pan_down": (f"{1 + ZOOM}", cx, f"(ih-ih/zoom)*on/{n}"),
        "pan_up": (f"{1 + ZOOM}", cx, f"(ih-ih/zoom)*(1-on/{n})"),
    }[move]
    return (f"scale={w * 2}:{h * 2}:force_original_aspect_ratio=increase,crop={w * 2}:{h * 2},"
            f"zoompan=z='{z}':x='{x}':y='{y}':d={n}:s={w}x{h}:fps={FPS}")


def _clip(scene: dict, idx: int, base: Path, work: Path, portrait: bool, extra: float) -> tuple[Path, float]:
    w, h = frame(portrait)
    audio = base / scene["audio"]
    dur = round(media_duration(audio) + TAIL_PAD + extra, 3)
    out = work / f"clip_{idx:04d}.mp4"
    tail = f",fps={FPS},format=yuv420p,setsar=1"
    if scene.get("video"):
        src = ["-stream_loop", "-1", "-i", str(base / scene["video"])]
        vf = f"scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h}" + tail
    else:
        src = ["-loop", "1", "-framerate", str(FPS), "-i", str(base / scene["image"])]
        vf = ken_burns(random.Random(scene["id"]).choice(MOVES), dur, w, h) + tail
    _ff([*src, "-i", str(audio),
         "-filter_complex", f"[0:v]{vf}[v];[1:a]aresample=44100,aformat=channel_layouts=stereo,apad[a]",
         "-map", "[v]", "-map", "[a]", "-t", f"{dur}",
         "-c:v", "libx264", "-preset", "veryfast", "-crf", str(CRF),
         "-c:a", "aac", "-b:a", "192k", "-ar", "44100", str(out)])
    return out, dur


def _xfade(clips: list[tuple[Path, float]], out: Path, rnd: random.Random) -> None:
    if len(clips) == 1:
        shutil.copy(clips[0][0], out)
        return
    args, fc, v, a, offset = [], [], "[0:v]", "[0:a]", 0.0
    for c, _ in clips:
        args += ["-i", str(c)]
    for i in range(1, len(clips)):
        offset += clips[i - 1][1] - XFADE
        fc.append(f"{v}[{i}:v]xfade=transition={rnd.choice(TRANSITIONS)}:duration={XFADE}:offset={offset:.3f}[v{i}]")
        fc.append(f"{a}[{i}:a]acrossfade=d={XFADE}:c1=tri:c2=tri[a{i}]")
        v, a = f"[v{i}]", f"[a{i}]"
    _ff([*args, "-filter_complex", ";".join(fc), "-map", v, "-map", a, "-c:v", "libx264", "-preset", "veryfast",
         "-crf", str(CRF), "-c:a", "aac", "-b:a", "192k", str(out)])


def _ts(s: float) -> str:
    ms = int(round(s * 1000))
    return f"{ms // 3600000:02d}:{ms // 60000 % 60:02d}:{ms // 1000 % 60:02d},{ms % 1000:03d}"


def build_srt(scenes: list[dict], starts: list[float], speech: list[float], max_chars: int, width: int) -> str:
    out, n = [], 1
    for sc, start, dur in zip(scenes, starts, speech):
        chunks, cur = [], ""
        for word in sc["text"].split():
            if cur and len(cur) + 1 + len(word) > max_chars:
                chunks.append(cur)
                cur = word
            else:
                cur = f"{cur} {word}".strip()
        if cur:
            chunks.append(cur)
        total, t = sum(len(c) for c in chunks) or 1, start
        for c in chunks:
            d = dur * len(c) / total
            out.append(f"{n}\n{_ts(t)} --> {_ts(t + d)}\n" + "\n".join(textwrap.wrap(c, width)) + "\n")
            n, t = n + 1, t + d
    return "\n".join(out)


def render_video(scenes: list[dict], base: Path, out: Path, portrait: bool = False, burn_subs: bool = False,
                 progress=lambda pct, msg: None, should_stop=lambda: False) -> dict:
    """scenes: dicts with id, text, audio, image and optional video (paths relative to base)."""
    if not scenes:
        raise RenderError("Montaj üçün səhnə yoxdur")
    work = out.parent / (out.stem + "_work")
    shutil.rmtree(work, ignore_errors=True)
    work.mkdir(parents=True)
    clips, speech = [], []
    for i, sc in enumerate(scenes):
        if should_stop():
            raise RenderError("Dayandırıldı")
        progress(100 * i / len(scenes) * 0.8, f"Montaj: səhnə {i + 1}/{len(scenes)}")
        clips.append(_clip(sc, i, base, work, portrait, 0.0 if i == len(scenes) - 1 else XFADE))
        speech.append(media_duration(base / sc["audio"]))
    starts, acc = [], 0.0
    for _, d in clips:
        starts.append(acc)
        acc += d - XFADE
    progress(85, "Keçidlər")
    rnd = random.Random(out.name)
    segs = []
    for g in range(0, len(clips), CHUNK):
        seg = work / f"seg_{g:04d}.mp4"
        _xfade(clips[g:g + CHUNK], seg, rnd)
        segs.append(seg)
    joined = work / "joined.mp4"
    if len(segs) == 1:
        shutil.move(segs[0], joined)
    else:
        (work / "list.txt").write_text("".join(f"file '{s.name}'\n" for s in segs))
        _ff(["-f", "concat", "-safe", "0", "-i", "list.txt", "-c", "copy", joined.name], cwd=work)

    srt = out.with_suffix(".srt")
    srt.write_text(build_srt(scenes, starts, speech, 32 if portrait else 84, 16 if portrait else 42),
                   encoding="utf-8")
    progress(92, "Son emal")
    if burn_subs:
        shutil.copy(srt, work / "subs.srt")
        size, margin = (13, 70) if portrait else (20, 30)
        style = (f"FontName=DejaVu Sans,FontSize={size},Bold=1,Outline=2,Shadow=0,"
                 f"Alignment=2,MarginV={margin}")
        _ff(["-i", joined.name, "-vf", f"subtitles=subs.srt:force_style='{style}'", "-c:v", "libx264",
             "-preset", "medium", "-crf", str(CRF), "-c:a", "copy", "-movflags", "+faststart", "final.mp4"], cwd=work)
    else:
        _ff(["-i", joined.name, "-c", "copy", "-movflags", "+faststart", "final.mp4"], cwd=work)
    shutil.move(work / "final.mp4", out)
    shutil.rmtree(work, ignore_errors=True)
    progress(100, "Hazırdır")
    return {"path": str(out), "srt": str(srt), "duration": media_duration(out)}
