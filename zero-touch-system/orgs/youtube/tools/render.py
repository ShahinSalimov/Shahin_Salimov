"""Executes the Media Producer render plan with ffmpeg.

Per scene: image -> clip with Ken Burns / pan motion (zoompan) and the scene's on-screen text
(drawtext). Clips are joined with hard cuts; ``zoom``/``whip`` transitions are rendered as cuts for
now. Scene lengths are scaled to the real voice duration. Subtitles are burned in from TTS word
timings as an ASS file with karaoke highlighting (current word yellow). Audio: voice, optional music
ducked under the voice (sidechaincompress), loudness-normalised to -14 LUFS. Output: H.264/AAC MP4.
"""
from __future__ import annotations

import json
import subprocess
from pathlib import Path
from typing import Any

from core.db import JobStore
from core.tools import ToolContext

TAIL_S = 0.4


def chunk_words(words: list[dict[str, Any]], n: int) -> list[list[dict[str, Any]]]:
    return [words[i:i + n] for i in range(0, len(words), max(1, n))]


def _ass_text(text: str) -> str:
    return text.replace("\\", "/").replace("{", "(").replace("}", ")").replace("\n", " ")


def _ts(t: float) -> str:
    cs = int(round(max(0.0, t) * 100))
    h, rem = divmod(cs, 360000)
    m, rem = divmod(rem, 6000)
    s, c = divmod(rem, 100)
    return f"{h}:{m:02d}:{s:02d}.{c:02d}"


def build_ass(words: list[dict[str, Any]], *, width: int, height: int, max_words: int, position: str,
              font_name: str = "DejaVu Sans") -> str:
    size = round(height * 0.045) if height > width else round(height * 0.06)
    margin_v = round(height * (0.22 if position == "lower_third" else 0.07))
    head = (
        "[Script Info]\nScriptType: v4.00+\nWrapStyle: 0\nScaledBorderAndShadow: yes\n"
        f"PlayResX: {width}\nPlayResY: {height}\n\n"
        "[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, "
        "Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, "
        "Alignment, MarginL, MarginR, MarginV, Encoding\n"
        f"Style: Default,{font_name},{size},&H0000FFFF,&H00FFFFFF,&H00000000,&H64000000,-1,0,0,0,100,100,0,0,1,"
        f"{max(2, size // 18)},1,2,60,60,{margin_v},1\n\n"
        "[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n"
    )
    lines = []
    for chunk in chunk_words(words, max_words):
        start, end = chunk[0]["start"], chunk[-1]["end"]
        parts = []
        for i, w in enumerate(chunk):
            nxt = chunk[i + 1]["start"] if i + 1 < len(chunk) else w["end"]
            cs = max(1, int(round((nxt - w["start"]) * 100)))
            parts.append(f"{{\\k{cs}}}{_ass_text(w['word'])}")
        lines.append(f"Dialogue: 0,{_ts(start)},{_ts(end)},Default,,0,0,0,,{' '.join(parts)}")
    return head + "\n".join(lines) + "\n"


def scale_scene_durations(scenes: list[dict[str, Any]], total_s: float) -> list[float]:
    planned = [max(0.1, float(s["end_s"]) - float(s["start_s"])) for s in scenes]
    factor = total_s / sum(planned)
    return [p * factor for p in planned]


def _run(cmd: list[str], cwd: Path | None = None) -> None:
    res = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True)
    if res.returncode != 0:
        raise RuntimeError(f"ffmpeg failed ({cmd[0]}): {res.stderr[-1500:]}")


def _motion(motion: str, frames: int) -> str:
    center = "x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'"
    if motion == "kenburns_in":
        return f"z='min(1+0.15*on/{frames},1.15)':{center}"
    if motion == "kenburns_out":
        return f"z='max(1.15-0.15*on/{frames},1.0)':{center}"
    if motion == "pan_left":
        return f"z='1.12':x='(iw-iw/zoom)*(1-on/{frames})':y='ih/2-(ih/zoom/2)'"
    if motion == "pan_right":
        return f"z='1.12':x='(iw-iw/zoom)*on/{frames}':y='ih/2-(ih/zoom/2)'"
    return f"z='1':{center}"


def _scene_clip(image: Path, scene: dict[str, Any], duration: float, w: int, h: int, fps: int,
                out: Path, font_path: str | None) -> None:
    frames = max(1, round(duration * fps))
    vf = (f"scale={w * 2}:{h * 2}:force_original_aspect_ratio=increase,crop={w * 2}:{h * 2},"
          f"zoompan={_motion(scene.get('motion', 'static'), frames)}:d={frames}:s={w}x{h}:fps={fps}")
    text = (scene.get("overlay_text") or "").strip()
    if text and font_path:
        txt = out.with_suffix(".txt")
        txt.write_text(text, encoding="utf-8")
        vf += (f",drawtext=fontfile='{font_path}':textfile='{txt}':fontsize={round(h * 0.05)}:fontcolor=white:"
               f"borderw={max(3, round(h * 0.003))}:bordercolor=black:x=(w-text_w)/2:y={round(h * 0.12)}")
    vf += ",format=yuv420p"
    _run(["ffmpeg", "-y", "-v", "error", "-loop", "1", "-i", str(image), "-vf", vf, "-frames:v", str(frames),
          "-r", str(fps), "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", str(out)])


def render_video(plan: dict[str, Any], tts: Any, images: list[Path], out_path: str | Path, *,
                 music_path: str | Path | None = None, font_path: str | None = None,
                 work_dir: str | Path | None = None) -> Path:
    out_path = Path(out_path)
    work = Path(work_dir or out_path.parent / "work")
    work.mkdir(parents=True, exist_ok=True)
    o = plan["output"]
    w, h, fps = int(o["width"]), int(o["height"]), int(o.get("fps", 30))
    total = float(tts.duration_s) + TAIL_S
    durations = scale_scene_durations(plan["scenes"], total)

    clips = []
    for i, (scene, dur) in enumerate(zip(plan["scenes"], durations)):
        clip = work / f"clip_{i:02d}.mp4"
        _scene_clip(Path(images[i]), scene, dur, w, h, fps, clip, font_path)
        clips.append(clip)
    (work / "clips.txt").write_text("".join(f"file '{c.name}'\n" for c in clips))
    _run(["ffmpeg", "-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", "clips.txt", "-c", "copy",
          "video.mp4"], cwd=work)

    subs = plan.get("subtitles") or {}
    (work / "subs.ass").write_text(build_ass(tts.words, width=w, height=h,
                                             max_words=int(subs.get("max_words_per_line", 3)),
                                             position=subs.get("position", "lower_third")), encoding="utf-8")
    fontsdir = f":fontsdir={Path(font_path).parent}" if font_path else ""
    video_filter = f"[0:v]subtitles=subs.ass{fontsdir}[v]"

    inputs = ["-i", "video.mp4", "-i", str(Path(tts.audio_path).resolve())]
    loud = "loudnorm=I=-14:TP=-1.5:LRA=11"
    if music_path:
        gain = float((plan.get("music") or {}).get("gain_db", -18))
        inputs += ["-stream_loop", "-1", "-i", str(Path(music_path).resolve())]
        audio_filter = (f"[1:a]aresample=48000,asplit=2[v1][v2];[2:a]aresample=48000,volume={gain}dB[m];"
                        f"[m][v2]sidechaincompress=threshold=0.03:ratio=8:attack=20:release=300[md];"
                        f"[v1][md]amix=inputs=2:duration=first:normalize=0,apad=pad_dur={TAIL_S},{loud}[a]")
    else:
        audio_filter = f"[1:a]aresample=48000,apad=pad_dur={TAIL_S},{loud}[a]"

    _run(["ffmpeg", "-y", "-v", "error", *inputs, "-filter_complex", f"{video_filter};{audio_filter}",
          "-map", "[v]", "-map", "[a]", "-t", f"{total:.3f}", "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
          "-pix_fmt", "yuv420p", "-r", str(fps), "-c:a", "aac", "-b:a", "192k", "-ar", "48000",
          "-movflags", "+faststart", str(out_path.resolve())], cwd=work)
    return out_path


def make_thumbnail(image: Path, text: str, out_path: Path, font_path: str | None, size=(1280, 720)) -> Path:
    w, h = size
    vf = f"scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h}"
    if text and font_path:
        txt = out_path.with_suffix(".txt")
        txt.write_text(text, encoding="utf-8")
        vf += (f",drawtext=fontfile='{font_path}':textfile='{txt}':fontsize={round(h * 0.14)}:fontcolor=yellow:"
               f"borderw=8:bordercolor=black:x=(w-text_w)/2:y=h-text_h-{round(h * 0.1)}")
    _run(["ffmpeg", "-y", "-v", "error", "-i", str(image), "-vf", vf, "-frames:v", "1", str(out_path)])
    return out_path


REALISTIC_HINTS = ("realistic", "photoreal", "photo-real", "cinematic", "lifelike")


def render_tool(tts: Any, image_gen: Any, data_dir: str | Path, *, font_path: str | None,
                tts_usd_per_1k_chars: float, image_usd_each: float):
    """Pipeline tool: voice + scene images + render. Re-render rounds only regenerate scenes in ``fixes``."""

    def render(payload: dict[str, Any], ctx: ToolContext) -> tuple[dict[str, Any], dict[str, Any]]:
        plan, script, profile = payload["plan"], payload["script"], payload["channel_profile"]
        round_ = int(ctx.state.get("render_round", 0))
        work = Path(data_dir) / "videos" / ctx.run_id / f"round-{round_}"
        work.mkdir(parents=True, exist_ok=True)
        o = plan["output"]
        w, h = int(o["width"]), int(o["height"])
        cost = 0.0
        store: JobStore = ctx.store

        voice_state = ctx.state.get("voice")
        if voice_state and Path(voice_state["audio_path"]).exists():
            from orgs.youtube.tools.tts import TTSResult
            voice = TTSResult(audio_path=Path(voice_state["audio_path"]), duration_s=voice_state["duration_s"],
                              words=voice_state["words"], characters=voice_state["characters"])
        else:
            text = " ".join(s["voiceover"].strip() for s in script["scenes"])
            voice = tts.synthesize(text, voice_id=plan["voice"]["voice_id"], speed=float(plan["voice"]["speed"]),
                                   out_path=work / ("voice.mp3" if tts.name != "fake" else "voice.wav"))
            ctx.state["voice"] = {"audio_path": str(voice.audio_path), "duration_s": voice.duration_s,
                                  "words": voice.words, "characters": voice.characters}
            c = round(voice.characters / 1000 * tts_usd_per_1k_chars, 4) if tts.name != "fake" else 0.0
            if c:
                store.insert_ledger("tts_cost", -c, ref=f"{ctx.idempotency_key}:tts", product_id=None,
                                    created_at=_now())
            cost += c

        redo = {f["scene_index"] for f in payload.get("fixes") or []}
        previous = ctx.state.get("scene_images", {})
        images, fallbacks, generated = [], [], 0
        script_types = {s["scene_index"]: s.get("visual_type") for s in script["scenes"]}
        for scene in plan["scenes"]:
            i = scene["scene_index"]
            old = previous.get(str(i))
            if old and Path(old).exists() and i not in redo:
                images.append(Path(old))
                continue
            if script_types.get(i) in ("ai_video", "stock_broll"):
                fallbacks.append({"scene_index": i, "planned": script_types[i], "used": "ai_image_kenburns"})
            prompt = scene["asset_prompt"] + (" (regenerated: fix requested)" if i in redo else "")
            images.append(image_gen.generate(prompt, w, h, work / f"scene_{i:02d}.png"))
            generated += 1
        ctx.state["scene_images"] = {str(s["scene_index"]): str(p) for s, p in zip(plan["scenes"], images)}

        thumb_src = image_gen.generate(plan["thumbnail_prompt"], 1280, 720, work / "thumb_src.png")
        generated += 1
        if image_gen.is_ai:
            c = round(generated * image_usd_each, 4)
            store.insert_ledger("media_cost", -c, ref=f"{ctx.idempotency_key}:img", product_id=None,
                                created_at=_now())
            cost += c

        music = None
        if plan.get("music"):
            candidate = Path(data_dir) / "music" / Path(plan["music"]["track"]).name
            music = candidate if candidate.is_file() else None
        video = render_video(plan, voice, images, work / "final.mp4", music_path=music, font_path=font_path,
                             work_dir=work / "work")
        thumb = make_thumbnail(thumb_src, plan["scenes"][0].get("overlay_text", ""), work / "thumbnail.png",
                               font_path)

        style = profile.get("visual_style", "").lower()
        synthetic = bool(plan.get("ai_disclosure_required")) or any(t == "ai_video" for t in script_types.values()) \
            or (image_gen.is_ai and any(k in style for k in REALISTIC_HINTS))
        return ({"status": "ok", "video_path": str(video), "thumbnail_path": str(thumb),
                 "duration_s": round(voice.duration_s + TAIL_S, 2), "width": w, "height": h,
                 "ai_disclosure_required": synthetic, "fallbacks": fallbacks, "render_round": round_,
                 "music_used": music is not None},
                {"cost_usd": cost})

    return render


def _now() -> str:
    from core.envelope import utc_now_iso
    return utc_now_iso()


def music_library(data_dir: str | Path) -> list[str]:
    d = Path(data_dir) / "music"
    return sorted(p.name for p in d.glob("*") if p.suffix.lower() in (".mp3", ".wav", ".m4a")) if d.is_dir() else []


def describe(plan: dict[str, Any]) -> str:  # pragma: no cover - debugging helper
    return json.dumps(plan, ensure_ascii=False, indent=2)
