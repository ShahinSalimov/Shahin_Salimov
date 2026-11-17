"""Analysis job queue.

With ``REDIS_URL`` set, jobs are pushed to a Redis list and consumed by the
dedicated worker process (``python -m backend.worker``), which survives API
restarts and scales horizontally. Without Redis (local dev, tests) jobs run
as in-process asyncio tasks bounded by a semaphore.

Double-processing is prevented in :mod:`backend.analysis_service` by an
atomic status transition (``queued -> analyzing``), not by the queue.
"""

from __future__ import annotations

import asyncio
import logging
import uuid
from collections.abc import Awaitable, Callable

from backend.config import get_settings

logger = logging.getLogger("aegispulse.queue")

QUEUE_KEY = "aegis:analysis:queue"
JobHandler = Callable[[uuid.UUID], Awaitable[None]]


class AnalysisQueue:
    def __init__(self) -> None:
        self._redis = None
        self._handler: JobHandler | None = None
        self._tasks: set[asyncio.Task[None]] = set()
        self._semaphore = asyncio.Semaphore(get_settings().analysis_concurrency)

    @property
    def backend(self) -> str:
        return "redis" if self._redis is not None else "in-process"

    @property
    def redis(self):  # noqa: ANN201 - redis client type is optional
        return self._redis

    async def connect(self) -> None:
        url = get_settings().redis_url
        if not url:
            logger.info("REDIS_URL not set: using in-process analysis queue")
            return
        from redis import asyncio as aioredis

        client = aioredis.from_url(url, decode_responses=True)
        await client.ping()
        self._redis = client
        logger.info("connected to Redis analysis queue")

    def set_local_handler(self, handler: JobHandler) -> None:
        self._handler = handler

    async def enqueue(self, threat_id: uuid.UUID) -> None:
        if self._redis is not None:
            await self._redis.lpush(QUEUE_KEY, str(threat_id))
            return
        if self._handler is None:
            raise RuntimeError("no local job handler registered")
        task = asyncio.create_task(self._run_local(threat_id), name=f"analysis-{threat_id}")
        self._tasks.add(task)
        task.add_done_callback(self._tasks.discard)

    async def _run_local(self, threat_id: uuid.UUID) -> None:
        assert self._handler is not None
        async with self._semaphore:
            try:
                await self._handler(threat_id)
            except Exception:
                logger.exception("in-process analysis job %s crashed", threat_id)

    async def depth(self) -> int:
        if self._redis is not None:
            try:
                return int(await self._redis.llen(QUEUE_KEY))
            except Exception:
                return -1
        return len(self._tasks)

    async def drain(self) -> None:
        """Wait for in-process jobs (used by tests and graceful shutdown)."""
        if self._tasks:
            await asyncio.gather(*list(self._tasks), return_exceptions=True)

    async def close(self) -> None:
        for task in list(self._tasks):
            task.cancel()
        await asyncio.gather(*list(self._tasks), return_exceptions=True)
        if self._redis is not None:
            await self._redis.aclose()
            self._redis = None


queue = AnalysisQueue()
