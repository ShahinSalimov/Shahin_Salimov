"""Shared ingestion service used by the API and the collector runner.

Deduplication is per company on the normalised SHA-256 of the sanitised text
(the same hash the pipeline reports), backed by a unique constraint so two
concurrent ingests of the same content resolve to one event.
"""

from __future__ import annotations

import logging
import uuid

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from agents.sanitizer import sanitize_threat_text
from backend.models import ThreatEvent, ThreatSource, ThreatStatus
from backend.task_queue import queue

logger = logging.getLogger("aegispulse.ingestion")


async def enqueue_analysis(session: AsyncSession, event: ThreatEvent) -> None:
    """Mark the event queued, commit, then hand it to the analysis queue."""
    event.status = ThreatStatus.QUEUED
    event.current_stage = "queued"
    event.error = None
    await session.commit()
    try:
        await queue.enqueue(event.id)
    except Exception:
        logger.exception("failed to enqueue %s", event.id)
        event.status = ThreatStatus.FAILED
        event.error = "Analysis queue unavailable; retry analysis."
        await session.commit()


async def _find(session: AsyncSession, company_id: uuid.UUID, digest: str) -> ThreatEvent | None:
    return (
        await session.execute(
            select(ThreatEvent).where(ThreatEvent.company_id == company_id, ThreatEvent.content_hash == digest)
        )
    ).scalar_one_or_none()


async def ingest_text(
    session: AsyncSession,
    company_id: uuid.UUID,
    *,
    raw_text: str,
    source: ThreatSource,
    source_ref: str | None,
    analyze: bool,
) -> tuple[ThreatEvent, bool]:
    """Store raw intel for one company. Returns ``(event, duplicate)``."""
    sanitized = sanitize_threat_text(raw_text)
    digest = sanitized.content_hash
    existing = await _find(session, company_id, digest)
    if existing is not None:
        return existing, True

    event = ThreatEvent(
        company_id=company_id,
        source=source,
        source_ref=source_ref[:500] if source_ref else None,
        raw_text=raw_text,
        content_hash=digest,
        injection_signals=sanitized.injection_signals,
        status=ThreatStatus.PENDING,
    )
    session.add(event)
    try:
        await session.flush()
    except IntegrityError:
        # A concurrent ingest inserted the same content first. company_id was
        # captured as a plain value, so nothing expired by the rollback is read.
        await session.rollback()
        existing = await _find(session, company_id, digest)
        if existing is None:  # pragma: no cover - constraint fired but row vanished
            raise
        return existing, True

    if analyze:
        await enqueue_analysis(session, event)
    else:
        await session.commit()
    return event, False
