"""SQLAlchemy ORM models: CompanyProfile, ThreatEvent, MitigationPatch, AlertLog.

JSON columns use JSONB on PostgreSQL (indexable, queryable) and plain JSON
elsewhere so the test-suite can run on SQLite. ``ThreatEvent.embedding`` is a
pgvector column reserved for semantic threat correlation (nearest-neighbour
search across campaigns); it is nullable until an embedding provider is wired.
"""

from __future__ import annotations

import enum
import uuid
from datetime import UTC, datetime
from typing import Any

from pgvector.sqlalchemy import Vector
from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.db import Base

JSONType = JSON().with_variant(JSONB(), "postgresql")
EMBEDDING_DIM = 1024
EmbeddingType = JSON().with_variant(Vector(EMBEDDING_DIM), "postgresql")


def utcnow() -> datetime:
    return datetime.now(UTC)


class ThreatSource(enum.StrEnum):
    DARK_WEB = "darkweb"
    TELEGRAM = "telegram"
    PASTE_SITE = "paste"
    NVD = "nvd"
    MANUAL = "manual"
    SIMULATOR = "simulator"


class ThreatStatus(enum.StrEnum):
    PENDING = "pending"
    QUEUED = "queued"
    ANALYZING = "analyzing"
    ANALYZED = "analyzed"
    FAILED = "failed"
    MITIGATED = "mitigated"
    DISMISSED = "dismissed"


class PatchKind(enum.StrEnum):
    BASH = "bash"
    PYTHON = "python"
    IPTABLES = "iptables"
    NFTABLES = "nftables"
    UFW = "ufw"
    AWS_WAF = "aws_waf"
    AWS_SECURITY_GROUP = "aws_security_group"
    NGINX = "nginx"
    DETECTION = "detection"


class PatchStatus(enum.StrEnum):
    PROPOSED = "proposed"
    APPROVED = "approved"
    REJECTED = "rejected"


class AlertChannel(enum.StrEnum):
    SLACK = "slack"
    WHATSAPP = "whatsapp"
    WEBHOOK = "webhook"


class AlertStatus(enum.StrEnum):
    SENT = "sent"
    FAILED = "failed"
    SKIPPED = "skipped"


def _enum(e: type[enum.Enum], name: str) -> Enum:
    return Enum(e, name=name, values_callable=lambda x: [m.value for m in x], native_enum=False, length=32)


class CompanyProfile(Base):
    __tablename__ = "company_profiles"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(200), unique=True)
    industry: Mapped[str | None] = mapped_column(String(120))
    tech_stack: Mapped[list[dict[str, Any]]] = mapped_column(JSONType, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    threats: Mapped[list[ThreatEvent]] = relationship(back_populates="company", cascade="all, delete-orphan")


class ThreatEvent(Base):
    __tablename__ = "threat_events"
    __table_args__ = (
        UniqueConstraint("company_id", "content_hash", name="uq_threat_company_hash"),
        Index("ix_threat_status_updated", "status", "updated_at"),
        Index("ix_threat_company_severity", "company_id", "final_severity"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    company_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("company_profiles.id", ondelete="CASCADE"))
    source: Mapped[ThreatSource] = mapped_column(_enum(ThreatSource, "threat_source"))
    source_ref: Mapped[str | None] = mapped_column(String(500))
    raw_text: Mapped[str] = mapped_column(Text)
    content_hash: Mapped[str] = mapped_column(String(64))
    status: Mapped[ThreatStatus] = mapped_column(_enum(ThreatStatus, "threat_status"), default=ThreatStatus.PENDING)
    current_stage: Mapped[str | None] = mapped_column(String(32))

    # Analysis results (denormalised for fast dashboard queries).
    title: Mapped[str | None] = mapped_column(String(300))
    summary: Mapped[str | None] = mapped_column(Text)
    threat_category: Mapped[str | None] = mapped_column(String(64))
    severity_score: Mapped[float | None] = mapped_column(Float)
    final_severity: Mapped[float | None] = mapped_column(Float)
    severity_label: Mapped[str | None] = mapped_column(String(16))
    exposure: Mapped[str | None] = mapped_column(String(16))
    threat_actor: Mapped[str | None] = mapped_column(String(200))
    indicators: Mapped[list[dict[str, Any]]] = mapped_column(JSONType, default=list)
    affected_technologies: Mapped[list[str]] = mapped_column(JSONType, default=list)
    mitre_techniques: Mapped[list[dict[str, Any]]] = mapped_column(JSONType, default=list)
    injection_signals: Mapped[list[str]] = mapped_column(JSONType, default=list)
    requires_human_review: Mapped[bool] = mapped_column(Boolean, default=False)
    analysis: Mapped[dict[str, Any] | None] = mapped_column(JSONType)
    error: Mapped[str | None] = mapped_column(Text)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    embedding: Mapped[list[float] | None] = mapped_column(EmbeddingType, nullable=True)

    ingested_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    analysis_started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    analyzed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    company: Mapped[CompanyProfile] = relationship(back_populates="threats")
    patches: Mapped[list[MitigationPatch]] = relationship(
        back_populates="threat", cascade="all, delete-orphan", order_by="MitigationPatch.created_at"
    )
    alerts: Mapped[list[AlertLog]] = relationship(
        back_populates="threat", cascade="all, delete-orphan", order_by="AlertLog.created_at"
    )


class MitigationPatch(Base):
    __tablename__ = "mitigation_patches"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    threat_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("threat_events.id", ondelete="CASCADE"), index=True)
    kind: Mapped[PatchKind] = mapped_column(_enum(PatchKind, "patch_kind"))
    title: Mapped[str] = mapped_column(String(300))
    description: Mapped[str | None] = mapped_column(Text)
    content: Mapped[str] = mapped_column(Text)
    rollback_content: Mapped[str | None] = mapped_column(Text)
    requires_root: Mapped[bool] = mapped_column(Boolean, default=False)
    validation: Mapped[dict[str, Any] | None] = mapped_column(JSONType)
    status: Mapped[PatchStatus] = mapped_column(_enum(PatchStatus, "patch_status"), default=PatchStatus.PROPOSED)
    reviewed_by: Mapped[str | None] = mapped_column(String(200))
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    threat: Mapped[ThreatEvent] = relationship(back_populates="patches")


class AlertLog(Base):
    __tablename__ = "alert_logs"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    threat_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("threat_events.id", ondelete="CASCADE"), index=True)
    channel: Mapped[AlertChannel] = mapped_column(_enum(AlertChannel, "alert_channel"))
    status: Mapped[AlertStatus] = mapped_column(_enum(AlertStatus, "alert_status"))
    destination: Mapped[str | None] = mapped_column(String(300))
    trigger: Mapped[str] = mapped_column(String(32), default="manual")
    payload: Mapped[dict[str, Any] | None] = mapped_column(JSONType)
    response_code: Mapped[int | None] = mapped_column(Integer)
    error: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    threat: Mapped[ThreatEvent] = relationship(back_populates="alerts")


class CollectorState(Base):
    """Cursor and health for one collector (one row per collector name)."""

    __tablename__ = "collector_states"

    name: Mapped[str] = mapped_column(String(64), primary_key=True)
    state: Mapped[dict[str, Any]] = mapped_column(JSONType, default=dict)
    run_requested: Mapped[bool] = mapped_column(Boolean, default=False)
    last_run_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_success_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_error: Mapped[str | None] = mapped_column(Text)
    last_items: Mapped[int] = mapped_column(Integer, default=0)
    items_ingested_total: Mapped[int] = mapped_column(Integer, default=0)
