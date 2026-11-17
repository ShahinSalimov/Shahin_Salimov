"""JobStore on SQLite (WAL): runs, jobs, ledger, products, videos, directives, budget tables.

The jobs table is the queue. ``claim_next`` is atomic (single UPDATE ... RETURNING inside
BEGIN IMMEDIATE), so several workers never get the same job. Fan-out steps are joined with the
``step_joins`` table: ``complete`` returns True only for the job that finishes its group.
Spec: 02-orchestration-architecture.md, 2.7.
"""
from __future__ import annotations

import json
import sqlite3
import threading
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Iterable

from ulid import ULID

from core.envelope import Envelope, to_iso, utc_now_iso

RUN_STATUSES = {"running", "done", "failed", "rejected"}

SCHEMA = """
CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY, org TEXT NOT NULL, pipeline TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  state_json TEXT NOT NULL DEFAULT '{}', reason TEXT,
  created_at TEXT NOT NULL, finished_at TEXT
);
CREATE INDEX IF NOT EXISTS runs_org_created ON runs(org, created_at);
CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT, org TEXT NOT NULL, run_id TEXT NOT NULL REFERENCES runs(id),
  step TEXT NOT NULL, envelope_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  attempt INTEGER NOT NULL DEFAULT 1, run_after TEXT NOT NULL,
  output_json TEXT, meta_json TEXT, error TEXT, idempotency_key TEXT UNIQUE,
  join_group INTEGER, created_at TEXT NOT NULL, finished_at TEXT
);
CREATE INDEX IF NOT EXISTS jobs_claim ON jobs(org, status, run_after);
CREATE INDEX IF NOT EXISTS jobs_run ON jobs(run_id, step);
CREATE TABLE IF NOT EXISTS step_joins (
  id INTEGER PRIMARY KEY AUTOINCREMENT, run_id TEXT NOT NULL, step TEXT NOT NULL,
  expected INTEGER NOT NULL, done INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL,
  amount_usd REAL NOT NULL, ref TEXT UNIQUE, product_id TEXT, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS products (id TEXT PRIMARY KEY, run_id TEXT, name TEXT, topic_key TEXT UNIQUE,
  price_usd REAL, gumroad_url TEXT, status TEXT, created_at TEXT);
CREATE TABLE IF NOT EXISTS videos (id TEXT PRIMARY KEY, run_id TEXT, title TEXT, topic_key TEXT UNIQUE,
  youtube_video_id TEXT, publish_at TEXT, status TEXT, created_at TEXT);
CREATE TABLE IF NOT EXISTS directives (org TEXT, target_agent TEXT, text TEXT, created_at TEXT, expires_at TEXT);
CREATE TABLE IF NOT EXISTS budget_daily (org TEXT, day TEXT, spent_usd REAL, PRIMARY KEY (org, day));
CREATE TABLE IF NOT EXISTS effects (idempotency_key TEXT PRIMARY KEY, result_json TEXT NOT NULL,
  created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS control (key TEXT PRIMARY KEY, value_json TEXT NOT NULL, updated_at TEXT NOT NULL);
"""


@dataclass(frozen=True)
class Run:
    id: str
    org: str
    pipeline: str
    status: str
    state: dict[str, Any]
    reason: Any
    created_at: str
    finished_at: str | None


@dataclass(frozen=True)
class Job:
    id: int
    org: str
    run_id: str
    step: str
    envelope: Envelope
    status: str
    attempt: int
    run_after: str
    output: dict[str, Any] | None
    meta: dict[str, Any] | None
    error: str | None
    idempotency_key: str
    join_group: int | None


def _loads(raw: str | None) -> Any:
    return None if raw is None else json.loads(raw)


def _dumps(obj: Any) -> str:
    return json.dumps(obj, ensure_ascii=False)


class JobStore:
    def __init__(self, path: str | Path, org: str | None = None):
        """``org`` binds the store to one organization: foreign runs/envelopes are rejected."""
        self.path = str(path)
        self.org = org
        self._lock = threading.RLock()
        self._conn = sqlite3.connect(self.path, timeout=30, isolation_level=None,
                                     check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._conn.execute("PRAGMA journal_mode=WAL")
        self._conn.execute("PRAGMA busy_timeout=30000")
        self._conn.execute("PRAGMA foreign_keys=ON")
        self._conn.executescript(SCHEMA)

    # -- infrastructure -------------------------------------------------------------

    def close(self) -> None:
        self._conn.close()

    def journal_mode(self) -> str:
        return self._conn.execute("PRAGMA journal_mode").fetchone()[0]

    def tables(self) -> set[str]:
        rows = self._conn.execute("SELECT name FROM sqlite_master WHERE type='table'")
        return {r[0] for r in rows}

    def _tx(self):
        return _Transaction(self._conn, self._lock)

    def _check_org(self, org: str) -> None:
        if self.org is not None and org != self.org:
            raise ValueError(f"store bound to org {self.org!r} rejects org {org!r}")

    # -- runs -------------------------------------------------------------------------

    def create_run(self, org: str, pipeline: str, state: dict[str, Any] | None = None) -> str:
        self._check_org(org)
        run_id = f"{org}-{ULID()}"
        with self._tx() as c:
            c.execute("INSERT INTO runs (id, org, pipeline, state_json, created_at) VALUES (?,?,?,?,?)",
                      (run_id, org, pipeline, _dumps(state or {}), utc_now_iso()))
        return run_id

    def get_run(self, run_id: str) -> Run:
        row = self._conn.execute("SELECT * FROM runs WHERE id=?", (run_id,)).fetchone()
        if row is None:
            raise KeyError(run_id)
        return Run(id=row["id"], org=row["org"], pipeline=row["pipeline"], status=row["status"],
                   state=json.loads(row["state_json"]), reason=_loads(row["reason"]),
                   created_at=row["created_at"], finished_at=row["finished_at"])

    def save_state(self, run_id: str, state: dict[str, Any]) -> None:
        with self._tx() as c:
            c.execute("UPDATE runs SET state_json=? WHERE id=?", (_dumps(state), run_id))

    def finish_run(self, run_id: str, status: str, reason: Any = None) -> None:
        if status not in RUN_STATUSES - {"running"}:
            raise ValueError(f"invalid final status {status!r}")
        with self._tx() as c:
            c.execute("UPDATE runs SET status=?, reason=?, finished_at=? WHERE id=?",
                      (status, None if reason is None else _dumps(reason), utc_now_iso(), run_id))

    def last_run(self, org: str) -> dict[str, Any] | None:
        row = self._conn.execute(
            "SELECT id, pipeline, status, created_at, finished_at FROM runs WHERE org=? "
            "ORDER BY created_at DESC, id DESC LIMIT 1", (org,)).fetchone()
        return dict(row) if row else None

    # -- queue ------------------------------------------------------------------------

    def enqueue(self, env: Envelope, run_after: datetime | None = None) -> int:
        return self.enqueue_group([env], run_after=run_after)[0]

    def enqueue_group(self, envs: Iterable[Envelope], run_after: datetime | None = None) -> list[int]:
        """Enqueue jobs of one step as a join group. Duplicate idempotency keys are no-ops."""
        envs = list(envs)
        if not envs:
            return []
        steps = {e.step for e in envs}
        runs = {e.run_id for e in envs}
        if len(steps) != 1 or len(runs) != 1:
            raise ValueError("enqueue_group needs envelopes of one run and one step")
        run = self.get_run(envs[0].run_id)
        for e in envs:
            self._check_org(e.org)
            if e.org != run.org:
                raise ValueError(f"envelope org {e.org!r} does not match run org {run.org!r}")
        after = to_iso(run_after) if run_after else utc_now_iso()

        ids: list[int] = []
        with self._tx() as c:
            existing = {}
            for e in envs:
                row = c.execute("SELECT id FROM jobs WHERE idempotency_key=?",
                                (e.idempotency_key,)).fetchone()
                if row:
                    existing[e.idempotency_key] = row["id"]
            new = [e for e in envs if e.idempotency_key not in existing]
            group = None
            if new:
                group = c.execute("INSERT INTO step_joins (run_id, step, expected) VALUES (?,?,?)",
                                  (run.id, envs[0].step, len(new))).lastrowid
            for e in envs:
                if e.idempotency_key in existing:
                    ids.append(existing[e.idempotency_key])
                    continue
                ids.append(c.execute(
                    "INSERT INTO jobs (org, run_id, step, envelope_json, attempt, run_after, "
                    "idempotency_key, join_group, created_at) VALUES (?,?,?,?,?,?,?,?,?)",
                    (e.org, e.run_id, e.step, e.to_json(), e.attempt, after,
                     e.idempotency_key, group, utc_now_iso())).lastrowid)
        return ids

    def claim_next(self, org: str) -> Job | None:
        with self._tx() as c:
            row = c.execute(
                "UPDATE jobs SET status='running' WHERE id = ("
                "  SELECT id FROM jobs WHERE org=? AND status='queued' AND run_after<=? "
                "  ORDER BY run_after, id LIMIT 1) RETURNING *",
                (org, utc_now_iso())).fetchone()
        return self._job(row) if row else None

    def complete(self, job: Job, output: dict[str, Any], meta: dict[str, Any] | None = None) -> bool:
        """Mark job done. Returns True if this completion finishes the job's join group."""
        with self._tx() as c:
            c.execute("UPDATE jobs SET status='done', output_json=?, meta_json=?, finished_at=? "
                      "WHERE id=?", (_dumps(output), _dumps(meta or {}), utc_now_iso(), job.id))
            if job.join_group is None:
                return True
            c.execute("UPDATE step_joins SET done = done + 1 WHERE id=?", (job.join_group,))
            j = c.execute("SELECT expected, done FROM step_joins WHERE id=?",
                          (job.join_group,)).fetchone()
            return j["done"] == j["expected"]

    def retry(self, job: Job, delay_s: float, attempt: int, error: str | None = None) -> None:
        after = to_iso(datetime.now(timezone.utc) + timedelta(seconds=delay_s))
        env = job.envelope.with_attempt(attempt)
        with self._tx() as c:
            c.execute("UPDATE jobs SET status='queued', attempt=?, run_after=?, envelope_json=?, "
                      "error=? WHERE id=?", (attempt, after, env.to_json(), error, job.id))

    def fail(self, job: Job, error: str) -> None:
        with self._tx() as c:
            c.execute("UPDATE jobs SET status='failed', error=?, finished_at=? WHERE id=?",
                      (error, utc_now_iso(), job.id))

    def requeue_stale(self, org: str) -> int:
        """Put jobs left in 'running' by a crashed process back in the queue. Call on startup."""
        with self._tx() as c:
            return c.execute("UPDATE jobs SET status='queued' WHERE org=? AND status='running'",
                             (org,)).rowcount

    # -- reads ------------------------------------------------------------------------

    def get_job(self, job_id: int) -> Job:
        row = self._conn.execute("SELECT * FROM jobs WHERE id=?", (job_id,)).fetchone()
        if row is None:
            raise KeyError(job_id)
        return self._job(row)

    def has_completed(self, key: str) -> bool:
        row = self._conn.execute("SELECT 1 FROM jobs WHERE idempotency_key=? AND status='done'",
                                 (key,)).fetchone()
        return row is not None

    def get_output(self, key: str) -> dict[str, Any] | None:
        row = self._conn.execute("SELECT output_json FROM jobs WHERE idempotency_key=? AND status='done'",
                                 (key,)).fetchone()
        return _loads(row["output_json"]) if row else None

    def outputs_of(self, run_id: str) -> dict[str, dict[str, Any]]:
        """Latest completed output per step of a run."""
        rows = self._conn.execute("SELECT step, output_json FROM jobs WHERE run_id=? AND status='done' "
                                  "ORDER BY finished_at, id", (run_id,))
        return {r["step"]: json.loads(r["output_json"]) for r in rows}

    def outputs_list(self, run_id: str, step: str) -> list[dict[str, Any]]:
        rows = self._conn.execute("SELECT output_json FROM jobs WHERE run_id=? AND step=? AND status='done' "
                                  "ORDER BY id", (run_id, step))
        return [json.loads(r["output_json"]) for r in rows]

    def queue_depth(self, org: str) -> int:
        return self._conn.execute("SELECT COUNT(*) FROM jobs WHERE org=? AND status='queued'",
                                  (org,)).fetchone()[0]

    def jobs_of(self, run_id: str) -> list[Job]:
        rows = self._conn.execute("SELECT * FROM jobs WHERE run_id=? ORDER BY id", (run_id,))
        return [self._job(r) for r in rows]

    def pending_count(self, run_id: str) -> int:
        return self._conn.execute("SELECT COUNT(*) FROM jobs WHERE run_id=? AND status IN ('queued','running')",
                                  (run_id,)).fetchone()[0]

    def group_count(self, run_id: str, step: str) -> int:
        """How many job groups were enqueued for a step of a run (= next revision round number)."""
        return self._conn.execute("SELECT COUNT(*) FROM step_joins WHERE run_id=? AND step=?",
                                  (run_id, step)).fetchone()[0]

    def count_failed_runs(self, org: str, since: datetime) -> int:
        return self._conn.execute("SELECT COUNT(*) FROM runs WHERE org=? AND status='failed' AND finished_at>=?",
                                  (org, to_iso(since))).fetchone()[0]

    # -- side effects (idempotent tools) ----------------------------------------------

    def record_effect(self, key: str, result: dict[str, Any]) -> None:
        """Remember that an external side effect happened. First write wins."""
        with self._tx() as c:
            c.execute("INSERT OR IGNORE INTO effects (idempotency_key, result_json, created_at) VALUES (?,?,?)",
                      (key, _dumps(result), utc_now_iso()))

    def get_effect(self, key: str) -> dict[str, Any] | None:
        row = self._conn.execute("SELECT result_json FROM effects WHERE idempotency_key=?", (key,)).fetchone()
        return _loads(row["result_json"]) if row else None

    # -- spend & control ----------------------------------------------------------------

    def add_spend(self, org: str, day: str, usd: float) -> None:
        with self._tx() as c:
            c.execute("INSERT INTO budget_daily (org, day, spent_usd) VALUES (?,?,?) "
                      "ON CONFLICT(org, day) DO UPDATE SET spent_usd = spent_usd + excluded.spent_usd",
                      (org, day, float(usd)))

    def get_spend(self, org: str, day: str) -> float:
        row = self._conn.execute("SELECT spent_usd FROM budget_daily WHERE org=? AND day=?", (org, day)).fetchone()
        return float(row[0]) if row else 0.0

    def set_control(self, key: str, value: Any) -> None:
        with self._tx() as c:
            if value is None:
                c.execute("DELETE FROM control WHERE key=?", (key,))
            else:
                c.execute("INSERT INTO control (key, value_json, updated_at) VALUES (?,?,?) "
                          "ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json, updated_at=excluded.updated_at",
                          (key, _dumps(value), utc_now_iso()))

    def get_control(self, key: str) -> Any:
        row = self._conn.execute("SELECT value_json FROM control WHERE key=?", (key,)).fetchone()
        return _loads(row["value_json"]) if row else None

    def total_spend(self, org: str) -> float:
        row = self._conn.execute("SELECT COALESCE(SUM(spent_usd), 0) FROM budget_daily WHERE org=?", (org,)).fetchone()
        return float(row[0])

    def spend_by_day(self, org: str, since_day: str) -> dict[str, float]:
        rows = self._conn.execute("SELECT day, spent_usd FROM budget_daily WHERE org=? AND day>=? ORDER BY day",
                                  (org, since_day))
        return {r["day"]: float(r["spent_usd"]) for r in rows}

    # -- ledger, products, directives (org data) ---------------------------------------

    def insert_ledger(self, kind: str, amount_usd: float, *, ref: str, product_id: str | None,
                      created_at: str) -> bool:
        """Insert a ledger row. Returns False if ``ref`` was already recorded (dedup)."""
        with self._tx() as c:
            cur = c.execute("INSERT OR IGNORE INTO ledger (kind, amount_usd, ref, product_id, created_at) "
                            "VALUES (?,?,?,?,?)", (kind, float(amount_usd), ref, product_id, created_at))
            return cur.rowcount == 1

    def ledger_rows(self, since: str, until: str) -> list[dict[str, Any]]:
        rows = self._conn.execute("SELECT * FROM ledger WHERE created_at>=? AND created_at<? ORDER BY id",
                                  (since, until))
        return [dict(r) for r in rows]

    def ledger_total(self) -> float:
        return float(self._conn.execute("SELECT COALESCE(SUM(amount_usd), 0) FROM ledger").fetchone()[0])

    def insert_product(self, *, id: str, run_id: str, name: str, topic_key: str, price_usd: float,
                       gumroad_url: str | None, status: str) -> bool:
        with self._tx() as c:
            cur = c.execute("INSERT OR IGNORE INTO products (id, run_id, name, topic_key, price_usd, gumroad_url, "
                            "status, created_at) VALUES (?,?,?,?,?,?,?,?)",
                            (id, run_id, name, topic_key, price_usd, gumroad_url, status, utc_now_iso()))
            return cur.rowcount == 1

    def topic_exists(self, topic_key: str) -> bool:
        return self._conn.execute("SELECT 1 FROM products WHERE topic_key=?", (topic_key,)).fetchone() is not None

    def products(self) -> list[dict[str, Any]]:
        return [dict(r) for r in self._conn.execute("SELECT * FROM products ORDER BY created_at, id")]

    def products_created_on(self, day: str) -> list[dict[str, Any]]:
        rows = self._conn.execute("SELECT * FROM products WHERE substr(created_at, 1, 10)=? ORDER BY created_at",
                                  (day,))
        return [dict(r) for r in rows]

    def insert_video(self, *, id: str, run_id: str, title: str, topic_key: str, youtube_video_id: str | None,
                     publish_at: str | None, status: str) -> bool:
        with self._tx() as c:
            cur = c.execute("INSERT OR IGNORE INTO videos (id, run_id, title, topic_key, youtube_video_id, publish_at, "
                            "status, created_at) VALUES (?,?,?,?,?,?,?,?)",
                            (id, run_id, title, topic_key, youtube_video_id, publish_at, status, utc_now_iso()))
            return cur.rowcount == 1

    def video_topic_exists(self, topic_key: str) -> bool:
        return self._conn.execute("SELECT 1 FROM videos WHERE topic_key=?", (topic_key,)).fetchone() is not None

    def videos(self) -> list[dict[str, Any]]:
        return [dict(r) for r in self._conn.execute("SELECT * FROM videos ORDER BY created_at, id")]

    def videos_created_on(self, day: str) -> list[dict[str, Any]]:
        rows = self._conn.execute("SELECT * FROM videos WHERE substr(created_at, 1, 10)=? ORDER BY created_at", (day,))
        return [dict(r) for r in rows]

    def add_directive(self, org: str, target_agent: str, text: str, expires_at: str) -> None:
        with self._tx() as c:
            c.execute("INSERT INTO directives (org, target_agent, text, created_at, expires_at) VALUES (?,?,?,?,?)",
                      (org, target_agent, text, utc_now_iso(), expires_at))

    def active_directives(self, org: str, target_agent: str) -> list[str]:
        rows = self._conn.execute("SELECT text FROM directives WHERE org=? AND target_agent=? AND expires_at>? "
                                  "ORDER BY created_at", (org, target_agent, utc_now_iso()))
        return [r["text"] for r in rows]

    @staticmethod
    def _job(row: sqlite3.Row) -> Job:
        return Job(id=row["id"], org=row["org"], run_id=row["run_id"], step=row["step"],
                   envelope=Envelope.from_json(row["envelope_json"]), status=row["status"],
                   attempt=row["attempt"], run_after=row["run_after"],
                   output=_loads(row["output_json"]), meta=_loads(row["meta_json"]),
                   error=row["error"], idempotency_key=row["idempotency_key"],
                   join_group=row["join_group"])


class _Transaction:
    """BEGIN IMMEDIATE ... COMMIT/ROLLBACK, serialized within the process by an RLock."""

    def __init__(self, conn: sqlite3.Connection, lock: threading.RLock):
        self.conn, self.lock = conn, lock

    def __enter__(self) -> sqlite3.Connection:
        self.lock.acquire()
        try:
            self.conn.execute("BEGIN IMMEDIATE")
        except Exception:
            self.lock.release()
            raise
        return self.conn

    def __exit__(self, exc_type, exc, tb) -> None:
        try:
            self.conn.execute("ROLLBACK" if exc_type else "COMMIT")
        finally:
            self.lock.release()
