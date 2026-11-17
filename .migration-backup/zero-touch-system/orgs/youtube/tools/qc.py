"""Measures the rendered video (duration, loudness, black frames, size) into a qc_report, and applies
hard rules in code. The Media Producer's QC verdict can fail a video, but it can never pass a video
that breaks a hard rule: the pipeline routes on both (see orgs.youtube.pipeline.route_after_qc).
"""
from __future__ import annotations

import json
import re
import subprocess
from pathlib import Path
from typing import Any

from core.tools import ToolContext

SHORTS_MAX_S = 180          # YouTube Shorts may be up to 3 minutes
MIN_DURATION_S = 3
LUFS_RANGE = (-17.0, -11.0)
MAX_BLACK_S = 1.0


def _ffprobe(path: Path) -> dict[str, Any]:
    out = subprocess.run(["ffprobe", "-v", "error", "-print_format", "json", "-show_streams", "-show_format",
                          str(path)], capture_output=True, text=True, check=True).stdout
    return json.loads(out)


def _stderr(cmd: list[str]) -> str:
    return subprocess.run(cmd, capture_output=True, text=True).stderr


def measure(path: str | Path) -> dict[str, Any]:
    path = Path(path)
    info = _ffprobe(path)
    v = next((s for s in info["streams"] if s["codec_type"] == "video"), {})
    a = next((s for s in info["streams"] if s["codec_type"] == "audio"), None)
    lufs = None
    if a is not None:
        m = re.findall(r"I:\s+(-?[\d.]+) LUFS", _stderr(["ffmpeg", "-nostats", "-i", str(path), "-vn",
                                                         "-af", "ebur128=framelog=quiet", "-f", "null", "-"]))
        lufs = float(m[-1]) if m else None
    black = [{"start": float(s), "end": float(e), "duration": float(d)} for s, e, d in re.findall(
        r"black_start:([\d.]+) black_end:([\d.]+) black_duration:([\d.]+)",
        _stderr(["ffmpeg", "-nostats", "-i", str(path), "-an", "-vf", "blackdetect=d=0.5:pix_th=0.10",
                 "-f", "null", "-"]))]
    fps = v.get("r_frame_rate", "0/1").split("/")
    return {
        "duration_s": round(float(info["format"].get("duration", 0)), 2),
        "width": v.get("width"), "height": v.get("height"),
        "fps": round(int(fps[0]) / max(1, int(fps[1])), 2) if len(fps) == 2 else None,
        "video_codec": v.get("codec_name"), "audio_codec": a.get("codec_name") if a else None,
        "has_audio": a is not None, "integrated_lufs": lufs, "black_segments": black,
        "file_size_mb": round(path.stat().st_size / 1_048_576, 2),
    }


def hard_failures(report: dict[str, Any], output: dict[str, Any], fmt: str) -> list[str]:
    problems = []
    if (report.get("width"), report.get("height")) != (output.get("width"), output.get("height")):
        problems.append(f"resolution {report.get('width')}x{report.get('height')} != "
                        f"{output.get('width')}x{output.get('height')}")
    if report.get("video_codec") not in (None, "h264"):
        problems.append(f"video codec {report.get('video_codec')} is not h264")
    if not report.get("has_audio"):
        problems.append("no audio track")
    lufs = report.get("integrated_lufs")
    if report.get("has_audio") and (lufs is None or not LUFS_RANGE[0] <= lufs <= LUFS_RANGE[1]):
        problems.append(f"loudness {lufs} LUFS outside {LUFS_RANGE[0]}..{LUFS_RANGE[1]}")
    black = sum(b["duration"] for b in report.get("black_segments", []))
    if black > MAX_BLACK_S:
        problems.append(f"{black:.1f}s of black frames")
    dur = float(report.get("duration_s") or 0)
    if dur < MIN_DURATION_S:
        problems.append(f"duration {dur}s is too short")
    if fmt == "shorts" and dur > SHORTS_MAX_S:
        problems.append(f"duration {dur}s exceeds the {SHORTS_MAX_S}s Shorts limit")
    return problems


def qc_measure_tool():
    def qc(payload: dict[str, Any], ctx: ToolContext) -> dict[str, Any]:
        report = measure(payload["video_path"])
        failures = hard_failures(report, payload["output"], payload.get("format", "shorts"))
        ctx.state["qc_hard_failures"] = failures
        return {"status": "ok", "qc_report": {**report, "hard_failures": failures}}

    return qc
