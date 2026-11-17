"""Pydantic v2 request/response models for the public API.

Every inbound model forbids unknown fields and bounds string lengths so a
caller cannot smuggle oversized payloads or unexpected keys into the pipeline.
"""

from __future__ import annotations

import re
import uuid
from datetime import UTC, datetime
from typing import Annotated, Any, Literal

from pydantic import (
    AfterValidator,
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    field_serializer,
    field_validator,
)

from backend.models import AlertChannel, PatchStatus, ThreatSource, ThreatStatus

_SAFE_KEY = re.compile(r"^[a-z0-9_]{1,40}$")


def _no_control_chars(value: str) -> str:
    if re.search(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", value):
        raise ValueError("control characters are not allowed")
    return value


ShortText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200), AfterValidator(_no_control_chars)]


def as_utc(dt: datetime | None) -> datetime | None:
    """SQLite returns naive datetimes; normalise everything to aware UTC."""
    if dt is None:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=UTC)


class _In(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class _Out(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# --------------------------------------------------------------------------- #
# Company profiles
# --------------------------------------------------------------------------- #


class StackComponentIn(_In):
    key: str = Field(min_length=1, max_length=40)
    label: ShortText
    version: Annotated[str, StringConstraints(max_length=40)] | None = None

    @field_validator("key")
    @classmethod
    def _key(cls, v: str) -> str:
        v = v.lower()
        if not _SAFE_KEY.match(v):
            raise ValueError("key must be lowercase letters, digits or underscore")
        return v


class CompanyCreate(_In):
    name: ShortText
    industry: ShortText | None = None
    tech_stack: list[StackComponentIn] = Field(default_factory=list, max_length=60)
    # Optional first admin for the new tenant.
    admin_email: Annotated[str, StringConstraints(max_length=320, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")] | None = None
    admin_name: ShortText | None = None
    admin_password: Annotated[str, StringConstraints(min_length=12, max_length=256)] | None = None


class CompanyStackUpdate(_In):
    tech_stack: list[StackComponentIn] = Field(max_length=60)


class CompanyOut(_Out):
    id: uuid.UUID
    name: str
    industry: str | None
    tech_stack: list[dict[str, Any]]
    created_at: datetime
    updated_at: datetime

    @field_serializer("created_at", "updated_at")
    def _ser_dt(self, dt: datetime) -> str:
        return as_utc(dt).isoformat()  # type: ignore[union-attr]


# --------------------------------------------------------------------------- #
# Threats
# --------------------------------------------------------------------------- #


class ThreatIngest(_In):
    company_id: uuid.UUID | None = Field(default=None, description="Defaults to the first company profile.")
    source: ThreatSource = ThreatSource.MANUAL
    source_ref: Annotated[str, StringConstraints(max_length=500)] | None = None
    raw_text: str = Field(min_length=20, max_length=50_000)
    analyze: bool = True

    @field_validator("raw_text")
    @classmethod
    def _raw(cls, v: str) -> str:
        v = v.replace("\x00", "")
        if len(v.strip()) < 20:
            raise ValueError("raw_text must contain at least 20 non-whitespace characters")
        return v


class IngestResponse(BaseModel):
    threat_id: uuid.UUID
    duplicate: bool
    status: ThreatStatus


class PatchOut(_Out):
    id: uuid.UUID
    kind: str
    title: str
    description: str | None
    content: str
    rollback_content: str | None
    requires_root: bool
    validation: dict[str, Any] | None
    status: PatchStatus
    reviewed_by: str | None
    reviewed_at: datetime | None
    created_at: datetime

    @field_serializer("reviewed_at", "created_at")
    def _ser_dt(self, dt: datetime | None) -> str | None:
        v = as_utc(dt)
        return v.isoformat() if v else None


class AlertOut(_Out):
    id: uuid.UUID
    threat_id: uuid.UUID
    channel: AlertChannel
    status: str
    destination: str | None
    trigger: str
    response_code: int | None
    error: str | None
    created_at: datetime

    @field_serializer("created_at")
    def _ser_dt(self, dt: datetime) -> str:
        return as_utc(dt).isoformat()  # type: ignore[union-attr]


class ThreatSummaryOut(_Out):
    id: uuid.UUID
    company_id: uuid.UUID
    source: ThreatSource
    source_ref: str | None
    status: ThreatStatus
    current_stage: str | None
    title: str | None
    summary: str | None
    threat_category: str | None
    severity_score: float | None
    final_severity: float | None
    severity_label: str | None
    exposure: str | None
    threat_actor: str | None
    indicators: list[dict[str, Any]]
    affected_technologies: list[str]
    mitre_techniques: list[dict[str, Any]]
    injection_signals: list[str]
    requires_human_review: bool
    error: str | None
    ingested_at: datetime
    analyzed_at: datetime | None
    updated_at: datetime
    # Live, stack-aware prioritisation (computed per request, not stored).
    priority_score: float | None = None
    live_exposure: str | None = None
    matched_components: list[str] = Field(default_factory=list)

    @field_serializer("ingested_at", "analyzed_at", "updated_at")
    def _ser_dt(self, dt: datetime | None) -> str | None:
        v = as_utc(dt)
        return v.isoformat() if v else None


class ThreatDetailOut(ThreatSummaryOut):
    raw_text: str
    analysis: dict[str, Any] | None
    patches: list[PatchOut]
    alerts: list[AlertOut]


class ThreatListOut(BaseModel):
    items: list[ThreatSummaryOut]
    total: int


# --------------------------------------------------------------------------- #
# Patches & alerts
# --------------------------------------------------------------------------- #


class PatchReview(_In):
    """Optional reviewer note. The reviewer identity always comes from authentication."""

    comment: Annotated[str, StringConstraints(max_length=1000)] | None = None


class PatchSimulationOut(BaseModel):
    patch_id: uuid.UUID
    executed: Literal[False] = False
    syntax_ok: bool
    risk_level: str
    findings: list[str]
    planned_actions: list[str]
    transcript: list[str]


class DispatchRequest(_In):
    channels: list[AlertChannel] = Field(default_factory=lambda: list(AlertChannel), min_length=1, max_length=3)


class AlertPreviewOut(BaseModel):
    channel: AlertChannel
    configured: bool
    executive_summary: str
    technical_summary: str
    payload: dict[str, Any]


# --------------------------------------------------------------------------- #
# Telemetry & simulator
# --------------------------------------------------------------------------- #


class TelemetryOut(BaseModel):
    status: Literal["operational", "degraded"]
    database: bool
    queue_backend: Literal["redis", "in-process"]
    queue_depth: int
    ai_engine_configured: bool
    model: str
    agents_total: int
    agents_active: int
    analyzing_now: int
    mttr_seconds: float | None
    total_threats: int
    critical_threats: int
    threats_mitigated: int
    alerts_sent: int
    generated_at: datetime


class SimulateAttackRequest(_In):
    scenario_id: Annotated[str, StringConstraints(max_length=64)] | None = None
    company_id: uuid.UUID | None = None


class ScenarioOut(BaseModel):
    id: str
    name: str
    source: ThreatSource
    headline: str
    targets: list[str]


class SimulateAttackResponse(BaseModel):
    scenario: ScenarioOut
    threat_id: uuid.UUID
    status: ThreatStatus


class CollectorOut(BaseModel):
    name: str
    source: ThreatSource
    enabled: bool
    configured: bool
    config_issue: str | None
    interval_seconds: int
    run_requested: bool
    last_run_at: datetime | None
    last_success_at: datetime | None
    last_error: str | None
    last_items: int
    items_ingested_total: int

    @field_serializer("last_run_at", "last_success_at")
    def _ser_dt(self, dt: datetime | None) -> str | None:
        v = as_utc(dt)
        return v.isoformat() if v else None
