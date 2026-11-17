"""Collector runner: schedules collectors, persists cursors, fans out to companies.

Run with ``python -m backend.collector_runner`` (the ``collector`` service in
docker-compose). Exactly one runner should be active per deployment; cursors
are stored in ``collector_states`` so restarts resume where they stopped.

Per item the runner:
1. caps volume per run (``AEGIS_COLLECTOR_MAX_ITEMS_PER_RUN``) to bound model spend;
2. picks target companies — every company, or only companies whose stack the
   item touches when the collector marks it ``stack_gated`` (NVD);
3. ingests through the shared dedup path and queues analysis.
"""

from __future__ import annotations

import asyncio
import logging
import signal
from datetime import UTC, datetime
from typing import Any

import httpx
from sqlalchemy import select

from agents.schemas import StackComponent
from agents.stack_matching import assess_exposure
from backend.collectors import Collector, CollectorError, build_collectors
from backend.config import Settings, get_settings
from backend.db import create_schema, dispose_engine, init_engine, session_scope
from backend.ingestion import ingest_text
from backend.logging_setup import configure_logging
from backend.models import CollectorState, CompanyProfile
from backend.schemas import as_utc
from backend.task_queue import queue

logger = logging.getLogger("aegispulse.collectors")
TICK_SECONDS = 5


def enabled_names(settings: Settings) -> set[str]:
    return {n.strip().lower() for n in settings.collectors_enabled}


async def _load_state(name: str) -> CollectorState:
    async with session_scope() as session:
        row = await session.get(CollectorState, name)
        if row is None:
            row = CollectorState(name=name, state={})
            session.add(row)
            await session.flush()
        return row


async def _targets(item_text: str, technologies: list[str], gated: bool) -> list[Any]:
    async with session_scope() as session:
        companies = list((await session.execute(select(CompanyProfile))).scalars())
    if not gated:
        return [c.id for c in companies]
    targets = []
    for company in companies:
        stack = [StackComponent.model_validate(c) for c in company.tech_stack or []]
        exposure, _, _ = assess_exposure(stack, technologies, item_text)
        if exposure != "none":
            targets.append(company.id)
    return targets


async def run_collector(collector: Collector, settings: Settings) -> dict[str, Any]:
    """Run one collector once. Never raises; failures are recorded on its state."""
    row = await _load_state(collector.name)
    started = datetime.now(UTC)
    ingested = 0
    error: str | None = None
    new_state = row.state or {}
    try:
        ready, reason = collector.configured()
        if not ready:
            raise CollectorError(f"{collector.name}: not configured ({reason})")
        items, new_state = await collector.collect(dict(row.state or {}))
        for item in items[: settings.collector_max_items_per_run]:
            for company_id in await _targets(item.text, item.technologies, item.stack_gated):
                async with session_scope() as session:
                    _event, duplicate = await ingest_text(
                        session, company_id, raw_text=item.text, source=collector.source,
                        source_ref=item.source_ref, analyze=settings.collector_analyze,
                    )
                ingested += 0 if duplicate else 1
        if len(items) > settings.collector_max_items_per_run:
            logger.warning("%s: %d items over the per-run cap were skipped", collector.name, len(items) - settings.collector_max_items_per_run)
    except CollectorError as exc:
        error = str(exc)
        new_state = row.state or {}
    except Exception as exc:  # a broken collector must not stop the others
        logger.exception("collector %s crashed", collector.name)
        error = f"{collector.name}: internal error ({type(exc).__name__})"
        new_state = row.state or {}

    async with session_scope() as session:
        state = await session.get(CollectorState, collector.name)
        assert state is not None
        state.state = new_state
        state.run_requested = False
        state.last_run_at = started
        state.last_error = error
        state.last_items = ingested
        state.items_ingested_total = (state.items_ingested_total or 0) + ingested
        if error is None:
            state.last_success_at = started
    if error:
        logger.warning("collector %s failed: %s", collector.name, error)
    else:
        logger.info("collector %s ingested %d new events", collector.name, ingested)
    return {"name": collector.name, "ingested": ingested, "error": error}


async def due_collectors(collectors: list[Collector], settings: Settings) -> list[Collector]:
    enabled = enabled_names(settings)
    now = datetime.now(UTC)
    due = []
    async with session_scope() as session:
        rows = {r.name: r for r in (await session.execute(select(CollectorState))).scalars()}
    for c in collectors:
        row = rows.get(c.name)
        if row is not None and row.run_requested:
            due.append(c)  # manual "Run now" works even for disabled collectors
            continue
        if c.name not in enabled:
            continue
        last = as_utc(row.last_run_at) if row else None
        if last is None or (now - last).total_seconds() >= c.interval_s:
            due.append(c)
    return due


async def main() -> None:
    settings = get_settings()
    configure_logging(settings.log_level)
    init_engine()
    if settings.auto_create_schema:
        await create_schema()
    await queue.connect()
    if queue.redis is None:
        from backend.analysis_service import run_analysis

        queue.set_local_handler(run_analysis)

    stop = asyncio.Event()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(sig, stop.set)

    async with httpx.AsyncClient(timeout=httpx.Timeout(30.0), follow_redirects=True) as http:
        collectors = build_collectors(settings, http)
        logger.info("collector runner ready: enabled=%s", sorted(enabled_names(settings)) or "none")
        while not stop.is_set():
            for collector in await due_collectors(collectors, settings):
                if stop.is_set():
                    break
                await run_collector(collector, settings)
            try:
                await asyncio.wait_for(stop.wait(), timeout=TICK_SECONDS)
            except TimeoutError:
                pass

    await queue.drain()
    await queue.close()
    await dispose_engine()


if __name__ == "__main__":
    asyncio.run(main())
