"""Runs full pipelines offline with FakeLLM and fake tools.

    python scripts/dry_run.py --org studio|youtube [--data-dir DIR] [--verbose]

Nothing leaves the machine: no LLM calls, no Gumroad, no YouTube, no WhatsApp (console provider),
fake signals; studio publishes drafts into DIR, youtube renders a real MP4 with fake voice and images. Prints every step of every run and exits non-zero if any run
does not finish with status "done".
"""
from __future__ import annotations

import argparse
import json
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from core.bootstrap import build_runtime  # noqa: E402
from core.config import Settings  # noqa: E402
from core.testing import FakeLLM  # noqa: E402
from core.tools.whatsapp import ConsoleWhatsApp  # noqa: E402


def _drain(rt, limit: int = 500) -> None:
    for _ in range(limit):
        if not rt.runner.tick():
            return
    raise RuntimeError("runner did not settle")


def _print_run(rt, run_id: str, verbose: bool) -> bool:
    run = rt.store.get_run(run_id)
    print(f"\n=== {run.pipeline}: {run.status} ({run_id})")
    for j in rt.store.jobs_of(run_id):
        cost = (j.meta or {}).get("cost_usd", 0.0)
        print(f"  {j.id:>3} {j.step:<24} {j.status:<7} attempt={j.attempt} from={j.envelope.from_agent:<22} "
              f"cost=${cost:.4f}" + (f" error={j.error}" if j.error else ""))
        if verbose:
            print("      payload:", json.dumps(j.envelope.payload, ensure_ascii=False)[:400])
            print("      output: ", json.dumps(j.output, ensure_ascii=False)[:400])
    if run.status != "done":
        print(f"  reason: {run.reason}")
    print(f"{run.pipeline}: {run.status}")
    return run.status == "done"


def dry_run_studio(data_dir: Path, verbose: bool) -> bool:
    from orgs.studio.fakes import fake_llm_script
    from orgs.studio.webhooks import handle_gumroad_ping

    settings = Settings(_env_file=None, org="studio", data_dir=str(data_dir), signal_sources="fake",
                        gumroad_publish_mode="draft", whatsapp_provider="console", daily_budget_usd=5.0)
    notifier = ConsoleWhatsApp(org="studio")
    rt = build_runtime("studio", settings, llm=FakeLLM(fake_llm_script()), notifier=notifier,
                       db_path=data_dir / "studio.db")
    ok = True
    try:
        run = rt.runner.start_run("studio_daily", {})
        _drain(rt)
        ok &= _print_run(rt, run, verbose)

        print("\n--- simulated Gumroad ping:",
              handle_gumroad_ping({"sale_id": "DRY-1", "product_id": "P-DRY", "product_name": "Dry Run Kit",
                                   "price": "1900"}, rt))
        run = rt.runner.start_run("studio_sales_report", {})
        _drain(rt)
        ok &= _print_run(rt, run, verbose)

        run = rt.runner.start_run("studio_weekly_reflect", {})
        _drain(rt)
        ok &= _print_run(rt, run, verbose)

        print("\n--- WhatsApp (console):")
        for m in notifier.sent:
            print("  " + m.replace("\n", "\n  "))
        print("\n--- files:")
        for p in sorted((data_dir / "drafts").rglob("*")) + sorted((data_dir / "products").rglob("*")):
            if p.is_file():
                print(f"  {p.relative_to(data_dir)} ({p.stat().st_size} bytes)")
        print(f"\nbudget spent (fake): ${rt.budget.spent_today('studio'):.2f}")
    finally:
        rt.stop()
    return ok


def dry_run_youtube(data_dir: Path, verbose: bool) -> bool:
    import subprocess

    from orgs.youtube.fakes import fake_llm_script

    music = data_dir / "music"
    music.mkdir(parents=True, exist_ok=True)
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-f", "lavfi", "-i", "sine=f=330:d=20", "-af", "volume=0.5",
                    str(music / "dry_run_track.wav")], check=True)
    settings = Settings(_env_file=None, org="youtube", data_dir=str(data_dir), whatsapp_provider="console",
                        daily_budget_usd=5.0, yt_niche="personal finance explained",
                        yt_seed_keywords="budget mistakes,saving money", yt_format="shorts",
                        yt_signal_mode="fake", yt_upload_mode="fake", yt_analytics_mode="fake",
                        tts_provider="fake", media_provider="fake")
    notifier = ConsoleWhatsApp(org="youtube")
    rt = build_runtime("youtube", settings, llm=FakeLLM(fake_llm_script()), notifier=notifier,
                       db_path=data_dir / "youtube.db")
    ok = True
    try:
        run = rt.runner.start_run("youtube_daily", {})
        _drain(rt)
        ok &= _print_run(rt, run, verbose)
        render = rt.store.outputs_of(run).get("tools.render")
        qc = rt.store.outputs_of(run).get("tools.qc_measure")
        if qc:
            print("  qc_report:", json.dumps(qc["qc_report"], ensure_ascii=False))

        run = rt.runner.start_run("youtube_weekly_growth", {})
        _drain(rt)
        ok &= _print_run(rt, run, verbose)

        print("\n--- WhatsApp (console):")
        for m in notifier.sent:
            print("  " + m.replace("\n", "\n  "))
        print("\n--- files:")
        for p in sorted((data_dir / "videos").rglob("*")):
            if p.is_file() and p.suffix in (".mp4", ".png", ".wav", ".ass") and "work" not in p.parts:
                print(f"  {p.relative_to(data_dir)} ({p.stat().st_size} bytes)")
        if render:
            print(f"\nvideo: {render['video_path']} ({render['duration_s']}s, music={render['music_used']})")
        print(f"quota used (fake upload is not charged): {rt.store.get_control(_quota_key()) or 0} units")
    finally:
        rt.stop()
    return ok


def _quota_key() -> str:
    from datetime import datetime, timezone
    return f"yt_quota:{datetime.now(timezone.utc).strftime('%Y-%m-%d')}"


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--org", required=True, choices=["studio", "youtube"])
    ap.add_argument("--data-dir", type=Path, default=None)
    ap.add_argument("--verbose", action="store_true")
    args = ap.parse_args()

    data_dir = args.data_dir or Path(tempfile.mkdtemp(prefix="zt-dry-run-"))
    data_dir.mkdir(parents=True, exist_ok=True)
    print(f"dry run data dir: {data_dir}")
    ok = (dry_run_studio if args.org == "studio" else dry_run_youtube)(data_dir, args.verbose)
    print("\nRESULT:", "OK" if ok else "FAILED")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
