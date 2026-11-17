"""Settings from environment variables (and an optional .env file next to the project)."""
from __future__ import annotations

import os
from dataclasses import dataclass
from datetime import date, time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def load_dotenv(path: Path = ROOT / ".env") -> None:
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        value = value.split(" #", 1)[0].strip().strip('"').strip("'")
        os.environ.setdefault(key.strip(), value)


def _time(value: str) -> time:
    h, m = value.split(":")
    return time(int(h), int(m))


@dataclass
class Settings:
    data_dir: Path
    inbox_dir: Path
    export_dir: Path
    channel_start: date
    channel_handle: str
    language: str
    publish_long_utc: time
    publish_short_utc: time
    upload_mode: str                 # api | manual
    publish_mode: str                # private (you publish in Studio) | scheduled (YouTube publishAt)
    upload_ahead_hours: int
    yt_client_id: str
    yt_client_secret: str
    yt_refresh_token: str
    yt_daily_quota: int
    yt_upload_cost: int
    llm_enabled: bool
    llm_model: str
    subscriber_goal: int
    plan_days_ahead: int
    dashboard_password: str

    @property
    def db_path(self) -> Path:
        return self.data_dir / "channel.db"

    @property
    def youtube_ready(self) -> bool:
        return bool(self.yt_client_id and self.yt_client_secret and self.yt_refresh_token)

    def __repr__(self) -> str:      # never print secrets
        return f"Settings(upload_mode={self.upload_mode!r}, data_dir={str(self.data_dir)!r})"


def get_settings(env: dict | None = None) -> Settings:
    if env is None:
        load_dotenv()
        env = dict(os.environ)
    g = lambda k, d="": (env.get(k) or d).strip()   # noqa: E731
    llm = g("LLM_ENABLED", "auto").lower()
    has_key = bool(g("ANTHROPIC_API_KEY") or g("ANTHROPIC_AUTH_TOKEN"))
    return Settings(
        data_dir=Path(g("DATA_DIR", str(ROOT / "data"))),
        inbox_dir=Path(g("INBOX_DIR", str(ROOT / "inbox"))),
        export_dir=Path(g("EXPORT_DIR", str(ROOT / "exports"))),
        channel_start=date.fromisoformat(g("CHANNEL_START_DATE", date.today().isoformat())),
        channel_handle=g("CHANNEL_HANDLE"),
        language=g("CHANNEL_LANGUAGE", "en"),
        publish_long_utc=_time(g("PUBLISH_TIME_LONG_UTC", "16:00")),
        publish_short_utc=_time(g("PUBLISH_TIME_SHORT_UTC", "22:00")),
        upload_mode=g("UPLOAD_MODE", "api").lower(),
        publish_mode=g("PUBLISH_MODE", "private").lower(),
        upload_ahead_hours=int(g("UPLOAD_AHEAD_HOURS", "36")),
        yt_client_id=g("YT_CLIENT_ID"),
        yt_client_secret=g("YT_CLIENT_SECRET"),
        yt_refresh_token=g("YT_REFRESH_TOKEN"),
        yt_daily_quota=int(g("YT_DAILY_QUOTA", "10000")),
        yt_upload_cost=int(g("YT_UPLOAD_COST", "1600")),
        llm_enabled=(llm == "on") or (llm == "auto" and has_key),
        llm_model=g("LLM_MODEL", "claude-opus-5-5"),
        subscriber_goal=int(g("SUBSCRIBER_GOAL", "1000")),
        plan_days_ahead=int(g("PLAN_DAYS_AHEAD", "14")),
        dashboard_password=g("DASHBOARD_PASSWORD"),
    )
