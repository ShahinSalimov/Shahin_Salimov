"""SALIMOFFF GARAGE — free montage (ffmpeg only, no CapCut needed).

Joins raw AI clips into a finished YouTube Short:
  * scales / crops every clip to 1080x1920 (9:16), 30 fps
  * cuts the clips so the joins land exactly on the beat grid
  * keeps the clips' own ASMR sound under the music (if the clips have audio)
  * music at -14 LUFS, SALIMOFFF watermark logo on the last 2 seconds
  * H.264 + AAC, ready for upload

Usage:
  python montage.py EP001 clips/EP001_p1.mp4 clips/EP001_p2.mp4 clips/EP001_p3.mp4
  python montage.py EP001 --music out/EP001_music.mp3 --bpm 140 clips/*.mp4
Result: final/EP001.mp4
"""
from __future__ import annotations

import argparse
import json
import subprocess
from pathlib import Path

HERE = Path(__file__).resolve().parent
LOGO = HERE.parent / "12_Branding" / "watermark_150x150.png"
W, H, FPS = 1080, 1920, 30


def probe(path: Path) -> dict:
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration:stream=codec_type",
                          "-of", "json", str(path)], capture_output=True, text=True, check=True).stdout
    data = json.loads(out)
    return {"duration": float(data["format"]["duration"]),
            "audio": any(s.get("codec_type") == "audio" for s in data.get("streams", []))}


def beat_grid_lengths(durations: list[float], bpm: float, total: float) -> list[float]:
    """Trim each clip to a whole number of beats so every cut lands on a beat, never exceeding total."""
    beat = 60.0 / bpm
    lengths, used = [], 0.0
    for i, d in enumerate(durations):
        remaining = total - used
        if remaining <= 0:
            break
        if i == len(durations) - 1:
            length = min(d, remaining)
        else:
            length = max(beat, int(min(d, remaining) / beat) * beat)
        lengths.append(round(length, 3))
        used += length
    return lengths


def build(name: str, clips: list[Path], music: Path | None, bpm: float, total: float, asmr_db: float,
          out_dir: Path) -> Path:
    info = [probe(c) for c in clips]
    lengths = beat_grid_lengths([i["duration"] for i in info], bpm, total)
    clips, info = clips[: len(lengths)], info[: len(lengths)]
    final_len = sum(lengths)

    args = ["ffmpeg", "-y", "-loglevel", "error"]
    for c in clips:
        args += ["-i", str(c)]
    n = len(clips)
    music_idx = logo_idx = None
    if music:
        music_idx = n; args += ["-i", str(music)]
    if LOGO.exists():
        logo_idx = n + (1 if music else 0); args += ["-loop", "1", "-i", str(LOGO)]

    f = []
    for i, length in enumerate(lengths):
        f.append(f"[{i}:v]trim=0:{length},setpts=PTS-STARTPTS,"
                 f"scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},fps={FPS},setsar=1[v{i}]")
        if info[i]["audio"]:
            f.append(f"[{i}:a]atrim=0:{length},asetpts=PTS-STARTPTS,aresample=44100,"
                     f"aformat=channel_layouts=stereo[a{i}]")
        else:
            f.append(f"anullsrc=r=44100:cl=stereo,atrim=0:{length}[a{i}]")
    f.append("".join(f"[v{i}][a{i}]" for i in range(n)) + f"concat=n={n}:v=1:a=1[vc][asmr]")

    vlast = "vc"
    if logo_idx is not None:
        start = max(0.0, final_len - 2.0)
        f.append(f"[{logo_idx}:v]scale=260:260,format=rgba,fade=in:st=0:d=0.4:alpha=1[lg]")
        f.append(f"[vc][lg]overlay=(W-w)/2:(H-h)/2:enable='gte(t,{start})':shortest=1[vl]")
        vlast = "vl"

    if music_idx is not None:
        f.append(f"[asmr]volume={asmr_db}dB[asmr2]")
        f.append(f"[{music_idx}:a]atrim=0:{final_len},asetpts=PTS-STARTPTS,aresample=44100[mus]")
        f.append("[mus][asmr2]amix=inputs=2:duration=first:normalize=0,loudnorm=I=-14:TP=-1:LRA=9[aout]")
    else:
        f.append("[asmr]loudnorm=I=-14:TP=-1:LRA=9[aout]")

    out_dir.mkdir(parents=True, exist_ok=True)
    out = out_dir / f"{name}.mp4"
    args += ["-filter_complex", ";".join(f), "-map", f"[{vlast}]", "-map", "[aout]",
             "-t", f"{final_len}", "-c:v", "libx264", "-preset", "medium", "-crf", "18",
             "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-ar", "44100",
             "-movflags", "+faststart", str(out)]
    subprocess.run(args, check=True)
    return out


def main(argv=None):
    ap = argparse.ArgumentParser(description="SALIMOFFF GARAGE free montage")
    ap.add_argument("name", help="episode id, e.g. EP001")
    ap.add_argument("clips", nargs="+", type=Path, help="raw clips in order")
    ap.add_argument("--music", type=Path, help="music file (default: out/<name>_music.mp3 if it exists)")
    ap.add_argument("--bpm", type=float, default=140)
    ap.add_argument("--total", type=float, default=30, help="maximum length in seconds")
    ap.add_argument("--asmr-db", type=float, default=-6, help="clip sound level under the music")
    ap.add_argument("--out", type=Path, default=HERE / "final")
    a = ap.parse_args(argv)
    music = a.music or (HERE / "out" / f"{a.name}_music.mp3")
    out = build(a.name, a.clips, music if music.exists() else None, a.bpm, a.total, a.asmr_db, a.out)
    print(out)


if __name__ == "__main__":
    main()
