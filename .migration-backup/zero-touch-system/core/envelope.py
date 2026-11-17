"""Envelope model: the standard JSON message passed between pipeline steps, plus new_envelope().

Every message between agents and tools uses this shape (spec: 02-orchestration-architecture.md, 2.2).
Agent-specific data lives only in ``payload``.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field
from ulid import ULID

ENVELOPE_VERSION = "1.0"
Org = Literal["studio", "youtube"]


def utc_now_iso() -> str:
    """Current UTC time as ISO-8601 with microseconds and a trailing Z (lexically sortable)."""
    return to_iso(datetime.now(timezone.utc))


def to_iso(dt: datetime) -> str:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ")


class Envelope(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    envelope_version: str = ENVELOPE_VERSION
    message_id: str
    run_id: str
    org: Org
    step: str
    from_agent: str
    to_agent: str | None = None
    attempt: int = Field(default=1, ge=1)
    created_at: str
    idempotency_key: str
    prompt_version: str = "1.0.0"
    context: dict[str, Any] = Field(default_factory=dict)
    payload: dict[str, Any] = Field(default_factory=dict)
    meta: dict[str, Any] = Field(default_factory=dict)

    def to_json(self) -> str:
        return self.model_dump_json()

    @classmethod
    def from_json(cls, raw: str) -> "Envelope":
        return cls.model_validate_json(raw)

    def with_attempt(self, attempt: int) -> "Envelope":
        return self.model_copy(update={"attempt": attempt})


def idempotency_key(run_id: str, step: str, index: int = 0, round_: int = 0) -> str:
    """``{run_id}:{step}:{index}``; revision rounds > 0 add ``r{round}`` so redone work gets new keys."""
    if round_:
        return f"{run_id}:{step}:r{round_}:{index}"
    return f"{run_id}:{step}:{index}"


def new_envelope(
    org: str,
    run_id: str,
    *,
    step: str,
    from_agent: str,
    payload: dict[str, Any],
    context: dict[str, Any] | None = None,
    index: int = 0,
    round_: int = 0,
    to_agent: str | None = None,
    prompt_version: str = "1.0.0",
) -> Envelope:
    return Envelope(
        message_id=str(ULID()),
        run_id=run_id,
        org=org,  # validated against the Org literal
        step=step,
        from_agent=from_agent,
        to_agent=to_agent,
        created_at=utc_now_iso(),
        idempotency_key=idempotency_key(run_id, step, index, round_),
        prompt_version=prompt_version,
        context=dict(context or {}),
        payload=dict(payload),
    )
