"""SQLite storage: videos, daily channel stats, and a small key/value control table."""
from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

# planned -> ready (video file found) -> uploaded (private, waiting for you to make it public) -> published
#                                     -> scheduled (PUBLISH_MODE=scheduled: YouTube publishes at publishAt)
# any state -> failed (error stored); manual uploads go planned/ready -> published via the dashboard
STATUSES = ("planned", "ready", "uploaded", "scheduled", "published", "failed")

SCHEMA = """
CREATE TABLE IF NOT EXISTS videos (
    id TEXT PRIMARY KEY,
    publish_date TEXT NOT NULL,
    kind TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'planned',
    plan_json TEXT NOT NULL,
    production_json TEXT NOT NULL,
    meta_json TEXT NOT NULL,
    video_file TEXT,
    thumb_file TEXT,
    youtube_id TEXT,
    publish_at TEXT,
    error TEXT,
    updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS videos_date ON videos(publish_date);
CREATE TABLE IF NOT EXISTS stats (
    day TEXT PRIMARY KEY,
    subscribers INTEGER, views INTEGER, videos INTEGER
);
CREATE TABLE IF NOT EXISTS control (key TEXT PRIMARY KEY, value TEXT);
"""

JSON_COLS = ("plan_json", "production_json", "meta_json")


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


class Store:
    def __init__(self, path: Path | str):
        self.path = str(path)
        if self.path != ":memory:":
            Path(self.path).parent.mkdir(parents=True, exist_ok=True)
        self.conn = sqlite3.connect(self.path, check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        self.conn.executescript(SCHEMA)

    # -- videos ------------------------------------------------------------------
    def _row(self, r: sqlite3.Row | None) -> dict | None:
        if r is None:
            return None
        d = dict(r)
        for col in JSON_COLS:
            d[col.removesuffix("_json")] = json.loads(d.pop(col))
        return d

    def upsert_video(self, vid: str, publish_date: str, kind: str, plan: dict, production: dict, meta: dict) -> None:
        self.conn.execute(
            """INSERT INTO videos (id, publish_date, kind, plan_json, production_json, meta_json, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(id) DO UPDATE SET plan_json=excluded.plan_json,
                 production_json=excluded.production_json, meta_json=excluded.meta_json,
                 updated_at=excluded.updated_at
               WHERE videos.status IN ('planned', 'ready', 'failed')""",
            (vid, publish_date, kind, json.dumps(plan), json.dumps(production), json.dumps(meta), now_iso()))
        self.conn.commit()

    def update(self, vid: str, **fields) -> None:
        if "status" in fields and fields["status"] not in STATUSES:
            raise ValueError(f"unknown status {fields['status']}")
        if "meta" in fields:
            fields["meta_json"] = json.dumps(fields.pop("meta"))
        fields["updated_at"] = now_iso()
        cols = ", ".join(f"{k}=?" for k in fields)
        self.conn.execute(f"UPDATE videos SET {cols} WHERE id=?", (*fields.values(), vid))
        self.conn.commit()

    def get(self, vid: str) -> dict | None:
        return self._row(self.conn.execute("SELECT * FROM videos WHERE id=?", (vid,)).fetchone())

    def videos(self, start: str | None = None, end: str | None = None, status: str | None = None) -> list[dict]:
        q, args = "SELECT * FROM videos WHERE 1=1", []
        if start:
            q, args = q + " AND publish_date>=?", args + [start]
        if end:
            q, args = q + " AND publish_date<=?", args + [end]
        if status:
            q, args = q + " AND status=?", args + [status]
        rows = self.conn.execute(q + " ORDER BY publish_date, kind", args).fetchall()
        return [self._row(r) for r in rows]

    def counts(self) -> dict[str, int]:
        rows = self.conn.execute("SELECT status, COUNT(*) n FROM videos GROUP BY status").fetchall()
        return {r["status"]: r["n"] for r in rows}

    # -- stats -------------------------------------------------------------------
    def save_stats(self, day: str, subscribers: int, views: int, videos: int) -> None:
        self.conn.execute("INSERT OR REPLACE INTO stats VALUES (?, ?, ?, ?)", (day, subscribers, views, videos))
        self.conn.commit()

    def stats(self, limit: int = 120) -> list[dict]:
        rows = self.conn.execute("SELECT * FROM stats ORDER BY day DESC LIMIT ?", (limit,)).fetchall()
        return [dict(r) for r in reversed(rows)]

    # -- control -----------------------------------------------------------------
    def get_control(self, key: str, default=None):
        r = self.conn.execute("SELECT value FROM control WHERE key=?", (key,)).fetchone()
        return json.loads(r["value"]) if r else default

    def set_control(self, key: str, value) -> None:
        self.conn.execute("INSERT OR REPLACE INTO control VALUES (?, ?)", (key, json.dumps(value)))
        self.conn.commit()
