"""Shared building blocks for agent output schemas (used by orgs/<org>/schemas.py).

All models forbid extra keys. Agent-specific fields are Optional at the type level and declared in
``REQUIRED_WHEN_OK``: they must be present when ``status == "ok"`` and may be omitted when the
agent reports ``needs_input`` / ``rejected`` / ``retry`` (which in turn require ``errors``).
"""
from __future__ import annotations

import re
from typing import Annotated, Any, ClassVar, Literal

from pydantic import AfterValidator, BaseModel, ConfigDict, Field, model_validator

Status = Literal["ok", "needs_input", "rejected", "retry"]
Score10 = Annotated[float, Field(ge=0, le=10)]
Level = Literal["low", "medium", "high"]
AlertLevel = Literal["none", "warning", "critical"]

_ISO_UTC = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?Z$")


def _iso_utc(v: str) -> str:
    if not _ISO_UTC.match(v):
        raise ValueError("must be ISO-8601 UTC like 2026-11-16T17:00:00Z")
    return v


IsoUtc = Annotated[str, AfterValidator(_iso_utc)]
WhatsAppText = Annotated[str, Field(min_length=1, max_length=900)]


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class AgentOutput(Strict):
    REQUIRED_WHEN_OK: ClassVar[tuple[str, ...]] = ()

    status: Status
    errors: list[str] = Field(default_factory=list)
    confidence: float = Field(ge=0, le=1)

    @model_validator(mode="after")
    def _status_contract(self) -> "AgentOutput":
        if self.status == "ok":
            missing = [f for f in self.REQUIRED_WHEN_OK if getattr(self, f) is None]
            if missing:
                raise ValueError(f"status 'ok' requires fields: {', '.join(missing)}")
        elif not self.errors:
            raise ValueError(f"status {self.status!r} requires a non-empty errors list")
        return self

    @property
    def is_ok(self) -> bool:
        return self.status == "ok"


def require(cond: bool, message: str) -> None:
    if not cond:
        raise ValueError(message)


def ok_and(model: Any, *fields: str) -> bool:
    """True when status is ok and all given fields are present (guards business-rule validators)."""
    return model.status == "ok" and all(getattr(model, f) is not None for f in fields)
