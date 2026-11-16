"""Cron schedule (UTC) for studio pipelines."""
from core.scheduler import ScheduleEntry

SCHEDULE: list[ScheduleEntry] = [
    ScheduleEntry(name="studio_daily", pipeline="studio_daily", cron="0 6 * * *"),
    ScheduleEntry(name="studio_sales_report", pipeline="studio_sales_report", cron="0 20 * * *"),
    ScheduleEntry(name="studio_weekly_reflect", pipeline="studio_weekly_reflect", cron="0 18 * * sun"),
]
