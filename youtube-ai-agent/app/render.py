"""Montage with ffmpeg: Ken Burns, animated clips, transitions, subtitles, logo, music."""
from __future__ import annotations

import random
import re
import shutil
import subprocess
from pathlib import Path

from .media import EMOTION_TAG, FRAME, media_duration

TAIL_PAD = 0.35  # silence after each scene's speech
XFADE_SAFE = ["fade", "dissolve", "smoothleft", "smoothright", "smoothup", "smoothdown",
              "circleopen", "circleclose", "wipeleft", "wiperight", "fadeblack", "radial"]
KB_MOVES = ["zoom_in", "zoom_out", "pan_left", "pan_right", "pan_up", "pan_down"]


class RenderError(RuntimeError):
    pass


def _ff(args: list[str], cwd: Path | None = None) -> None:
    p = subprocess.run(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", *args],
                       capture_output=True, text=True, cwd=cwd)
    if p.returncode != 0:
        raise RenderError(p.stderr[-1500:])


def ken_burns_filter(move: str, dur: float, w: int, h: int, fps: int, zoom_pct: float) -> str:
    n = max(1, int(dur * fps))
    z = zoom_pct / 100
    cx, cy = "iw/2-(iw/zoom/2)", "ih/2-(ih/zoom/2)"
    exprs = {
        "zoom_in": (f"1+{z}*on/{n}", cx, cy),
        "zoom_out": (f"1+{z}-{z}*on/{n}", cx, cy),
        "pan_right": (f"{1 + z}", f"(iw-iw/zoom)*on/{n}", cy),
        "pan_left": (f"{1 + z}", f"(iw-iw/zoom)*(1-on/{n})", cy),
        "pan_down": (f"{1 + z}", cx, f"(ih-ih/zoom)*on/{n}"),
        "pan_up": (f"{1 + z}", cx, f"(ih-ih/zoom)*(1-on/{n})"),
    }
    zz, xx, yy = exprs[move]
    # upscale 2x first: zoompan works on integer pixels, more pixels = smoother motion
    return (f"scale={w * 2}:{h * 2}:force_original_aspect_ratio=increase,crop={w * 2}:{h * 2},"
            f"zoompan=z='{zz}':x='{xx}':y='{yy}':d={n}:s={w}x{h}:fps={fps}")


def scene_clip(scene: dict, idx: int, work: Path, st: dict, extra: float, fade: float) -> tuple[Path, float]:
    """Render one scene (picture + voice) to an mp4 of speech + pad + extra seconds."""
    w, h = FRAME[st["visual"]["aspect"]]
    fps = int(st["output"]["fps"])
    audio = work.parent / scene["audio"]
    speech = media_duration(audio)
    dur = round(speech + TAIL_PAD + extra, 3)
    out = work / f"clip_{idx:04d}.mp4"
    vf_tail = f",fps={fps},format=yuv420p,setsar=1"
    if fade:
        vf_tail += f",fade=t=in:d={fade},fade=t=out:st={dur - fade:.3f}:d={fade}"
    if scene.get("video"):
        inputs = ["-stream_loop", "-1", "-i", str(work.parent / scene["video"])]
        vf = f"scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h}" + vf_tail
    else:
        inputs = ["-loop", "1", "-framerate", str(fps), "-i", str(work.parent / scene["image"])]
        rnd = random.Random(scene["id"])
        if st["motion"]["ken_burns"]:
            vf = ken_burns_filter(rnd.choice(KB_MOVES), dur, w, h, fps, float(st["motion"]["zoom_percent"])) + vf_tail
        else:
            vf = f"scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h}" + vf_tail
    _ff([*inputs, "-i", str(audio),
         "-filter_complex", f"[0:v]{vf}[v];[1:a]aresample=44100,aformat=channel_layouts=stereo,apad[a]",
         "-map", "[v]", "-map", "[a]", "-t", f"{dur}",
         "-c:v", "libx264", "-preset", "veryfast", "-crf", str(st["output"]["crf"]),
         "-c:a", "aac", "-b:a", st["output"]["audio_bitrate"], "-ar", "44100", str(out)])
    return out, dur


def _concat_copy(clips: list[Path], out: Path) -> None:
    lst = out.with_suffix(".txt")
    lst.write_text("".join(f"file '{c.name}'\n" for c in clips))
    _ff(["-f", "concat", "-safe", "0", "-i", lst.name, "-c", "copy", out.name], cwd=out.parent)


def _xfade_group(clips: list[tuple[Path, float]], out: Path, st: dict, rnd: random.Random) -> float:
    t = float(st["transitions"]["duration"])
    types = [x for x in st["transitions"].get("types") or ["fade"] if x in XFADE_SAFE] or ["fade"]
    if len(clips) == 1:
        shutil.copy(clips[0][0], out)
        return clips[0][1]
    args, fc = [], []
    for c, _ in clips:
        args += ["-i", str(c)]
    vprev, aprev, offset = "[0:v]", "[0:a]", 0.0
    for i in range(1, len(clips)):
        offset += clips[i - 1][1] - t
        vo, ao = f"[v{i}]", f"[a{i}]"
        fc.append(f"{vprev}[{i}:v]xfade=transition={rnd.choice(types)}:duration={t}:offset={offset:.3f}{vo}")
        fc.append(f"{aprev}[{i}:a]acrossfade=d={t}:c1=tri:c2=tri{ao}")
        vprev, aprev = vo, ao
    _ff([*args, "-filter_complex", ";".join(fc), "-map", vprev, "-map", aprev,
         "-c:v", "libx264", "-preset", "veryfast", "-crf", str(st["output"]["crf"]),
         "-c:a", "aac", "-b:a", st["output"]["audio_bitrate"], str(out)])
    return offset + clips[-1][1]


def build_srt(scenes: list[dict], starts: list[float], speech: list[float], st: dict) -> str:
    sub = st["subtitles"]
    max_chars = int(sub["chars_per_line"]) * int(sub["max_lines"])
    entries, n = [], 1
    for sc, start, dur in zip(scenes, starts, speech):
        words = EMOTION_TAG.sub("", sc["text"]).split()
        chunks, cur = [], ""
        for wd in words:
            if cur and len(cur) + 1 + len(wd) > max_chars:
                chunks.append(cur)
                cur = wd
            else:
                cur = f"{cur} {wd}".strip()
        if cur:
            chunks.append(cur)
        total = sum(len(c) for c in chunks) or 1
        t = start
        for c in chunks:
            d = dur * len(c) / total
            lines = _wrap(c, int(sub["chars_per_line"]))
            entries.append(f"{n}\n{_ts(t)} --> {_ts(t + d)}\n{lines}\n")
            n, t = n + 1, t + d
    return "\n".join(entries)


def _wrap(text: str, width: int) -> str:
    import textwrap
    return "\n".join(textwrap.wrap(text, width))


def _ts(s: float) -> str:
    ms = int(round(s * 1000))
    return f"{ms // 3600000:02d}:{ms // 60000 % 60:02d}:{ms // 1000 % 60:02d},{ms % 1000:03d}"


def render_project(proj: dict, proj_dir: Path, out_path: Path, progress=lambda pct, msg: None,
                   should_stop=lambda: False) -> dict:
    st = proj["settings"]
    scenes = [s for s in proj["scenes"] if s.get("audio") and (s.get("image") or s.get("video"))]
    if not scenes:
        raise RenderError("Montaj üçün hazır səhnə yoxdur (şəkil və səs lazımdır)")
    missing = len(proj["scenes"]) - len(scenes)
    work = proj_dir / "render"
    shutil.rmtree(work, ignore_errors=True)
    work.mkdir(parents=True)
    mode = st["transitions"]["mode"]
    t = float(st["transitions"]["duration"]) if mode == "crossfade" else 0.0
    fade = min(0.3, float(st["transitions"]["duration"])) if mode == "fade" else 0.0

    clips: list[tuple[Path, float]] = []
    speech: list[float] = []
    for i, sc in enumerate(scenes):
        if should_stop():
            raise RenderError("Dayandırıldı")
        progress(5 + 70 * i / len(scenes), f"Səhnə {i + 1}/{len(scenes)} klipə çevrilir")
        last = i == len(scenes) - 1
        clips.append(scene_clip(sc, i, work, st, 0.0 if last else t, fade))
        speech.append(media_duration(proj_dir / sc["audio"]))

    # timeline starts (for subtitles)
    starts, acc = [], 0.0
    for _, d in clips:
        starts.append(acc)
        acc += d - t
    progress(78, "Keçidlər tətbiq olunur")
    joined = work / "joined.mp4"
    if mode == "crossfade" and len(clips) > 1:
        rnd = random.Random(proj["id"])
        segs = []
        for g in range(0, len(clips), 15):  # chunk to keep filter graphs small
            if should_stop():
                raise RenderError("Dayandırıldı")
            seg = work / f"seg_{g:04d}.mp4"
            _xfade_group(clips[g:g + 15], seg, st, rnd)
            segs.append(seg)
        _concat_copy(segs, joined) if len(segs) > 1 else shutil.move(segs[0], joined)
    else:
        _concat_copy([c for c, _ in clips], joined)

    srt = build_srt(scenes, starts, speech, st)
    srt_path = out_path.with_suffix(".srt")
    out_path.parent.mkdir(parents=True, exist_ok=True)
    srt_path.write_text(srt, encoding="utf-8")

    progress(88, "Loqo, musiqi və altyazı əlavə olunur")
    w, h = FRAME[st["visual"]["aspect"]]
    inputs, fc, vlabel, alabel = ["-i", joined.name], [], "0:v", "0:a"
    idx = 1
    music = st["music"]
    if music.get("enabled") and music.get("file") and Path(music["file"]).exists():
        inputs += ["-stream_loop", "-1", "-i", str(Path(music["file"]).resolve())]
        fc.append(f"[{idx}:a]volume={float(music['volume'])}[bg];[0:a][bg]amix=inputs=2:duration=first:normalize=0[aout]")
        alabel, idx = "[aout]", idx + 1
    logo = st["branding"].get("logo")
    if logo and Path(logo).exists():
        inputs += ["-i", str(Path(logo).resolve())]
        lw = int(w * float(st["branding"]["logo_width_percent"]) / 100)
        m = int(w * 0.025)
        pos = {"top-left": f"{m}:{m}", "top-right": f"W-w-{m}:{m}",
               "bottom-left": f"{m}:H-h-{m}", "bottom-right": f"W-w-{m}:H-h-{m}"}[st["branding"]["position"]]
        fc.append(f"[{idx}:v]scale={lw}:-1[logo];[{vlabel}][logo]overlay={pos}[vl]")
        vlabel, idx = "[vl]", idx + 1
    if st["subtitles"].get("enabled") and st["subtitles"].get("burn_in"):
        shutil.copy(srt_path, work / "subs.srt")
        src = vlabel if vlabel.startswith("[") else f"[{vlabel}]"
        style = f"FontName=DejaVu Sans,FontSize={int(st['subtitles']['font_size']) // 2},Outline=2,Shadow=0,MarginV=40"
        fc.append(f"{src}subtitles=subs.srt:force_style='{style}'[vs]")
        vlabel = "[vs]"

    final_tmp = work / "final.mp4"
    if fc:
        vmap = vlabel if vlabel.startswith("[") else vlabel
        amap = alabel
        vcodec = ["-c:v", "libx264", "-preset", "medium", "-crf", str(st["output"]["crf"])] \
            if vlabel != "0:v" else ["-c:v", "copy"]
        acodec = ["-c:a", "aac", "-b:a", st["output"]["audio_bitrate"]] if alabel != "0:a" else ["-c:a", "copy"]
        _ff([*inputs, "-filter_complex", ";".join(fc), "-map", vmap, "-map", amap, *vcodec, *acodec,
             "-movflags", "+faststart", final_tmp.name], cwd=work)
    else:
        _ff(["-i", joined.name, "-c", "copy", "-movflags", "+faststart", final_tmp.name], cwd=work)
    shutil.move(final_tmp, out_path)
    progress(100, "Hazırdır")
    shutil.rmtree(work, ignore_errors=True)
    return {"path": str(out_path), "srt": str(srt_path), "duration": media_duration(out_path),
            "skipped_scenes": missing}


def safe_filename(name: str) -> str:
    return re.sub(r"[^\w\-]+", "_", name, flags=re.U).strip("_")[:60] or "video"
