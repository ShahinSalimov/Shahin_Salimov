"""Cron schedule (UTC) for YouTube pipelines. Throttling is applied by the yt_gate tool, not here."""
from core.scheduler import ScheduleEntry

SCHEDULE: list[ScheduleEntry] = [
    ScheduleEntry(name="youtube_daily", pipeline="youtube_daily", cron="0 8 * * *"),
    ScheduleEntry(name="youtube_weekly_growth", pipeline="youtube_weekly_growth", cron="0 7 * * mon"),
]
