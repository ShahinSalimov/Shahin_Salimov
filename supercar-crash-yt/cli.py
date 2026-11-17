"""Command line entry point.

    python cli.py plan [--days 30]      plan and generate metadata + prompts
    python cli.py daily                 the daily job (plan ahead, scan inbox, upload, stats)
    python cli.py worker                run `daily` every few hours forever
    python cli.py upload <id>           upload one ready video now
    python cli.py published <id> [url]  mark a video as made public
    python cli.py export <id>           write the copy-paste pack for one video
    python cli.py calendar [--days 30]  print the calendar (also saved as exports/calendar.md)
    python cli.py stats                 fetch subscriber count now
    python cli.py serve [--port 8080]   start the dashboard
"""
from __future__ import annotations

import argparse
import logging
import time
from datetime import date, timedelta

from scc.config import get_settings
from scc.service import Service


def calendar_markdown(svc: Service, days: int) -> str:
    start = max(date.today(), svc.s.channel_start)
    rows = svc.store.videos(start=start.isoformat(), end=(start + timedelta(days=days - 1)).isoformat())
    lines = ["| Date | Type | Format | Cars | Title | File name | Status |", "|---|---|---|---|---|---|---|"]
    for v in rows:
        cars = ", ".join(v["plan"]["car_keys"])
        lines.append(f"| {v['publish_date']} | {v['kind']} | {v['plan']['format_key']} | {cars} | "
                     f"{v['meta']['title']} | `{v['id']}.mp4` | {v['status']} |")
    return "\n".join(lines)


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    ap = argparse.ArgumentParser(description="Supercar crash YouTube manager")
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("plan"); p.add_argument("--days", type=int, default=None)
    sub.add_parser("daily")
    w = sub.add_parser("worker"); w.add_argument("--every-hours", type=float, default=3)
    u = sub.add_parser("upload"); u.add_argument("id")
    pb = sub.add_parser("published"); pb.add_argument("id"); pb.add_argument("url", nargs="?", default="")
    e = sub.add_parser("export"); e.add_argument("id")
    c = sub.add_parser("calendar"); c.add_argument("--days", type=int, default=30)
    sub.add_parser("stats")
    s = sub.add_parser("serve"); s.add_argument("--port", type=int, default=8080); s.add_argument("--host", default="0.0.0.0")
    r = sub.add_parser("regenerate"); r.add_argument("id")
    args = ap.parse_args()

    svc = Service(get_settings())
    if args.cmd == "plan":
        created = svc.ensure_plan(args.days)
        print(f"{len(created)} videos planned")
    elif args.cmd == "daily":
        print("\n".join(svc.daily()))
    elif args.cmd == "worker":
        while True:
            try:
                print("\n".join(svc.daily()), flush=True)
            except Exception:   # keep the worker alive; the next run retries
                logging.exception("daily run failed")
            time.sleep(args.every_hours * 3600)
    elif args.cmd == "upload":
        svc.scan_inbox()
        print(svc.upload_one(args.id))
    elif args.cmd == "published":
        svc.mark_published(args.id, args.url)
        print("ok")
    elif args.cmd == "export":
        print(svc.export(args.id))
    elif args.cmd == "calendar":
        md = calendar_markdown(svc, args.days)
        svc.s.export_dir.mkdir(parents=True, exist_ok=True)
        (svc.s.export_dir / "calendar.md").write_text(md, encoding="utf-8")
        print(md)
    elif args.cmd == "stats":
        print(svc.refresh_stats())
    elif args.cmd == "regenerate":
        svc.regenerate(args.id)
        print("ok")
    elif args.cmd == "serve":
        from app import create_app
        create_app(svc).run(host=args.host, port=args.port)


if __name__ == "__main__":
    main()
