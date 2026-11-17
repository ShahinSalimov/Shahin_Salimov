"""Dedicated analysis worker: consumes the Redis queue and runs the pipeline.

Run with ``python -m backend.worker``. Scale horizontally by adding replicas;
the atomic claim in :func:`backend.analysis_service.run_analysis` guarantees
each threat is analysed once even if a job id is delivered twice.
"""

from __future__ import annotations

import asyncio
import logging
import signal
import uuid

from backend.analysis_service import recover_stale_jobs, run_analysis
from backend.config import get_settings
from backend.db import create_schema, dispose_engine, init_engine
from backend.logging_setup import configure_logging
from backend.task_queue import QUEUE_KEY, queue

logger = logging.getLogger("aegispulse.worker")


async def _handle(raw_id: str, semaphore: asyncio.Semaphore) -> None:
    async with semaphore:
        try:
            await run_analysis(uuid.UUID(raw_id))
        except ValueError:
            logger.error("discarding malformed job id %r", raw_id)
        except Exception:
            logger.exception("job %s crashed", raw_id)


async def main() -> None:
    settings = get_settings()
    configure_logging(settings.log_level)
    if not settings.redis_url:
        raise SystemExit("REDIS_URL is required for the dedicated worker")
    init_engine()
    if settings.auto_create_schema:
        await create_schema()
    await queue.connect()
    redis = queue.redis
    assert redis is not None

    stop = asyncio.Event()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(sig, stop.set)

    semaphore = asyncio.Semaphore(settings.analysis_concurrency)
    tasks: set[asyncio.Task[None]] = set()
    recovered = await recover_stale_jobs()
    if recovered:
        logger.warning("marked %d stale jobs as failed", recovered)
    logger.info("worker ready (concurrency=%d, model=%s)", settings.analysis_concurrency, settings.model)

    last_recovery = loop.time()
    while not stop.is_set():
        try:
            item = await redis.brpop([QUEUE_KEY], timeout=2)
        except Exception:
            logger.exception("redis unavailable; retrying in 3s")
            await asyncio.sleep(3)
            continue
        if item:
            task = asyncio.create_task(_handle(item[1], semaphore))
            tasks.add(task)
            task.add_done_callback(tasks.discard)
        if loop.time() - last_recovery > 300:
            last_recovery = loop.time()
            await recover_stale_jobs()

    logger.info("shutting down: waiting for %d in-flight jobs", len(tasks))
    await asyncio.gather(*tasks, return_exceptions=True)
    await queue.close()
    await dispose_engine()


if __name__ == "__main__":
    asyncio.run(main())
