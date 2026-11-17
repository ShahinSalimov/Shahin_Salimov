"""Audit trail helpers and data-retention enforcement.

``record`` adds an :class:`AuditEvent` to the caller's session (committed
with the action it describes, so an action and its audit row succeed or
fail together). Secrets are never written to ``details``.
"""

from __future__ import annotations

import logging
import uuid
from datetime import timedelta
from typing import Any

from fastapi import Request
from sqlalchemy import delete, update
from sqlalchemy.ext.asyncio import AsyncSession

from backend.config import Settings
from backend.db import session_scope
from backend.models import AuditEvent, ThreatEvent, utcnow
from backend.security import Principal

logger = logging.getLogger("aegispulse.audit")
REDACTED_MARKER = "[raw intelligence redacted by retention policy]"


def client_ip(request: Request | None) -> str | None:
    if request is None or request.client is None:
        return None
    return request.client.host


def record(
    session: AsyncSession,
    principal: Principal | None,
    action: str,
    *,
    company_id: uuid.UUID | None,
    request: Request | None = None,
    target_type: str | None = None,
    target_id: object | None = None,
    outcome: str = "success",
    details: dict[str, Any] | None = None,
    actor: str | None = None,
) -> None:
    session.add(
        AuditEvent(
            company_id=company_id,
            actor=actor or (principal.label if principal else "anonymous"),
            actor_kind=principal.kind if principal else "anonymous",
            action=action,
            outcome=outcome,
            target_type=target_type,
            target_id=str(target_id) if target_id is not None else None,
            ip=client_ip(request),
            details=details,
        )
    )


async def apply_retention(settings: Settings) -> dict[str, int]:
    """Redact old raw intel and purge expired audit events. Safe to run repeatedly."""
    redacted = purged = 0
    async with session_scope() as session:
        if settings.raw_text_retention_days > 0:
            cutoff = utcnow() - timedelta(days=settings.raw_text_retention_days)
            result = await session.execute(
                update(ThreatEvent)
                .where(ThreatEvent.ingested_at < cutoff, ThreatEvent.raw_text != REDACTED_MARKER)
                .values(raw_text=REDACTED_MARKER, updated_at=utcnow())
            )
            redacted = result.rowcount or 0
        if settings.audit_retention_days > 0:
            cutoff = utcnow() - timedelta(days=settings.audit_retention_days)
            result = await session.execute(delete(AuditEvent).where(AuditEvent.created_at < cutoff))
            purged = result.rowcount or 0
    if redacted or purged:
        logger.info("retention: redacted %d threat texts, purged %d audit events", redacted, purged)
    return {"redacted": redacted, "purged": purged}
