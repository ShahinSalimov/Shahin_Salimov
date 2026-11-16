"""APScheduler wiring that starts pipelines on cron schedules defined per org (UTC)."""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

log = logging.getLogger(__name__)


@dataclass(frozen=True)
class ScheduleEntry:
    name: str
    pipeline: str
    cron: str                                   # standard 5-field crontab, UTC
    payload: dict[str, Any] = field(default_factory=dict)
    context: dict[str, Any] = field(default_factory=dict)


def fire(runner: Any, entry: ScheduleEntry) -> str | None:
    """Start one scheduled run. Errors (kill switch, etc.) are logged, never raised into APScheduler."""
    try:
        return runner.start_run(entry.pipeline, dict(entry.payload), context=dict(entry.context))
    except Exception as e:
        log.warning("scheduled run %s not started: %s", entry.name, e)
        return None


def build_scheduler(runner: Any, entries: list[ScheduleEntry], timezone: str = "UTC") -> BackgroundScheduler:
    sched = BackgroundScheduler(timezone=timezone)
    for entry in entries:
        if entry.pipeline not in runner.pipelines:
            raise KeyError(f"schedule {entry.name!r} references unknown pipeline {entry.pipeline!r}")
        trigger = CronTrigger.from_crontab(entry.cron, timezone=timezone)  # ValueError on bad cron
        sched.add_job(fire, trigger, args=[runner, entry], id=entry.name, name=entry.name,
                      coalesce=True, max_instances=1, misfire_grace_time=3600, replace_existing=True)
    return sched
