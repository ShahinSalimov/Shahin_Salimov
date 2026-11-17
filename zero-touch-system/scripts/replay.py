"""Prints every envelope of a run step by step, read from the org database.

    python scripts/replay.py --org studio                 # list recent runs
    python scripts/replay.py --org studio <run_id>        # steps of one run (payload/output truncated)
    python scripts/replay.py --org studio <run_id> --full # complete payloads and outputs
    python scripts/replay.py --db path/to/backup.db --org studio <run_id>

Read-only: nothing is executed or re-sent. Known secrets are masked in the output.
To re-execute a run's pipeline from scratch, use POST /admin/run/<pipeline> instead.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from core.db import JobStore  # noqa: E402
from core.logging import SecretMasker  # noqa: E402

TRUNCATE = 600


def _dump(obj: Any, full: bool) -> str:
    text = json.dumps(obj, ensure_ascii=False, indent=2 if full else None)
    return text if full or len(text) <= TRUNCATE else text[:TRUNCATE] + " …"


def render_run(store: JobStore, run_id: str, *, full: bool = False, secrets: list[str] | None = None) -> str:
    run = store.get_run(run_id)
    masker = SecretMasker(secrets or [])
    lines = [f"run {run.id}  pipeline={run.pipeline}  status={run.status}",
             f"created={run.created_at}  finished={run.finished_at}  reason={run.reason}",
             f"state={_dump(run.state, full)}", ""]
    total = 0.0
    for j in store.jobs_of(run_id):
        meta = j.meta or {}
        total += float(meta.get("cost_usd") or 0)
        lines.append(f"[{j.id}] {j.step}  status={j.status}  attempt={j.attempt}  "
                     f"from={j.envelope.from_agent}  key={j.idempotency_key}  cost=${float(meta.get('cost_usd') or 0):.4f}"
                     + (f"  model={meta['model']}" if meta.get("model") else ""))
        if j.error:
            lines.append(f"    error: {j.error}")
        lines.append(f"    context: {_dump(j.envelope.context, full)}")
        lines.append(f"    payload: {_dump(j.envelope.payload, full)}")
        lines.append(f"    output:  {_dump(j.output, full)}")
    lines.append(f"\ntotal recorded cost: ${total:.4f}")
    return masker.mask("\n".join(lines))


def render_list(store: JobStore, org: str, limit: int = 20) -> str:
    rows = store.recent_runs(org, limit)
    if not rows:
        return "no runs"
    return "\n".join(f"{r['created_at']}  {r['id']}  {r['pipeline']:<24} {r['status']:<8} {r['reason'] or ''}"
                     for r in rows)


def main(argv: list[str] | None = None) -> int:
    from core.config import Settings
    from core.logging import secrets_from_settings

    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("run_id", nargs="?")
    ap.add_argument("--org", choices=["studio", "youtube"], default=None)
    ap.add_argument("--db", type=Path, default=None)
    ap.add_argument("--full", action="store_true")
    ap.add_argument("--limit", type=int, default=20)
    args = ap.parse_args(argv)

    settings = Settings()
    org = args.org or settings.org
    if org is None:
        print("set --org or ORG", file=sys.stderr)
        return 2
    db = args.db or Path(settings.db_path or Path(settings.data_dir or ROOT / "data") / f"{org}.db")
    if not db.exists():
        print(f"database not found: {db}", file=sys.stderr)
        return 2
    store = JobStore(db, org=org)
    try:
        if not args.run_id:
            print(render_list(store, org, args.limit))
            return 0
        try:
            print(render_run(store, args.run_id, full=args.full, secrets=secrets_from_settings(settings)))
        except KeyError:
            print(f"run not found: {args.run_id}", file=sys.stderr)
            return 1
        return 0
    finally:
        store.close()


if __name__ == "__main__":
    sys.exit(main())
