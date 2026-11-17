"""Orchestrates pipeline runs against the database.

The flow for one threat:

1. **Claim** the job with an atomic ``UPDATE ... WHERE status IN (...)`` so
   two workers (or an API retry racing the worker) can never analyse the same
   event concurrently.
2. Run :class:`agents.ThreatPipeline`, streaming stage progress into
   ``threat_events.current_stage`` so the dashboard can show which agent is
   working.
3. Persist enriched fields, replace generated patches, and — when severity
   crosses the threshold — dispatch alerts on every configured channel.
4. Any failure leaves the event in ``failed`` with a human-readable error.
"""

from __future__ import annotations

import logging
import uuid

from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from agents import CompanyStackProfile, PipelineConfig, PipelineError, PipelineResult, StackComponent, ThreatPipeline
from agents.stack_matching import assess_exposure, prioritized_severity
from backend.config import Settings, get_settings
from backend.db import session_scope
from backend.dispatcher import channel_configured, dispatch_alerts
from backend.models import (
    AlertChannel,
    CompanyProfile,
    MitigationPatch,
    PatchKind,
    ThreatEvent,
    ThreatStatus,
    utcnow,
)

logger = logging.getLogger("aegispulse.analysis")

CLAIMABLE = (ThreatStatus.PENDING, ThreatStatus.QUEUED, ThreatStatus.FAILED)

DEMO_COMPANY = {
    "name": "Acme Fintech",
    "industry": "Financial Services",
    "tech_stack": [
        {"key": "aws", "label": "AWS", "version": None},
        {"key": "ubuntu", "label": "Ubuntu 22.04 LTS", "version": "22.04"},
        {"key": "nginx", "label": "Nginx", "version": "1.24"},
        {"key": "postgresql", "label": "PostgreSQL", "version": "16"},
        {"key": "docker", "label": "Docker", "version": "24"},
        {"key": "react", "label": "React", "version": "18"},
        {"key": "openssh", "label": "OpenSSH", "version": "8.9p1"},
    ],
}

_pipeline: ThreatPipeline | None = None
_pipeline_injected = False


def get_pipeline(settings: Settings | None = None) -> ThreatPipeline:
    """Lazily build the process-wide pipeline (one Anthropic client, pooled)."""
    global _pipeline
    if _pipeline is None:
        settings = settings or get_settings()
        from anthropic import AsyncAnthropic

        config = PipelineConfig(
            model=settings.model,
            triage_effort=settings.triage_effort,
            context_effort=settings.context_effort,
            remediation_effort=settings.remediation_effort,
            enable_fallbacks=settings.enable_fallbacks,
        )
        api_key = settings.anthropic_api_key.get_secret_value() if settings.anthropic_api_key else None
        client = AsyncAnthropic(api_key=api_key, max_retries=config.max_retries, timeout=config.request_timeout_s)
        _pipeline = ThreatPipeline(client=client, config=config)
    return _pipeline


def set_pipeline(pipeline: ThreatPipeline | None) -> None:
    """Inject a pipeline (tests, alternative model configurations)."""
    global _pipeline, _pipeline_injected
    _pipeline = pipeline
    _pipeline_injected = pipeline is not None


def company_profile(company: CompanyProfile) -> CompanyStackProfile:
    return CompanyStackProfile(
        name=company.name,
        industry=company.industry,
        tech_stack=[StackComponent.model_validate(c) for c in company.tech_stack or []],
    )


def live_priority(event: ThreatEvent, stack: list[StackComponent]) -> tuple[float | None, str | None, list[str]]:
    """Re-score an analysed threat against the *current* stack (no model call)."""
    if event.severity_score is None:
        return None, None, []
    exposure, direct, indirect = assess_exposure(stack, event.affected_technologies or [], event.raw_text)
    matched = [c.key for c in (direct or indirect)]
    return prioritized_severity(event.severity_score, exposure), exposure, matched


async def ensure_demo_company(session: AsyncSession) -> CompanyProfile:
    existing = (await session.execute(select(CompanyProfile).order_by(CompanyProfile.created_at).limit(1))).scalar_one_or_none()
    if existing:
        return existing
    company = CompanyProfile(**DEMO_COMPANY)
    session.add(company)
    await session.commit()
    logger.info("seeded demo company profile %s", company.name)
    return company


async def _claim(threat_id: uuid.UUID) -> bool:
    async with session_scope() as session:
        result = await session.execute(
            update(ThreatEvent)
            .where(ThreatEvent.id == threat_id, ThreatEvent.status.in_(CLAIMABLE))
            .values(
                status=ThreatStatus.ANALYZING,
                current_stage="queued",
                analysis_started_at=utcnow(),
                attempts=ThreatEvent.attempts + 1,
                error=None,
                updated_at=utcnow(),
            )
        )
        return (result.rowcount or 0) == 1


async def _set_stage(threat_id: uuid.UUID, stage: str) -> None:
    async with session_scope() as session:
        await session.execute(
            update(ThreatEvent).where(ThreatEvent.id == threat_id).values(current_stage=stage, updated_at=utcnow())
        )


async def _fail(threat_id: uuid.UUID, message: str) -> None:
    async with session_scope() as session:
        await session.execute(
            update(ThreatEvent)
            .where(ThreatEvent.id == threat_id)
            .values(status=ThreatStatus.FAILED, current_stage=None, error=message[:2000], updated_at=utcnow())
        )


def _patches_from_result(threat_id: uuid.UUID, result: PipelineResult) -> list[MitigationPatch]:
    plan = result.remediation
    if plan is None:
        return []
    by_target = {v.target: v.model_dump() for v in result.script_validations}
    patches: list[MitigationPatch] = []
    for script in plan.patch_scripts:
        patches.append(
            MitigationPatch(
                threat_id=threat_id,
                kind=PatchKind(script.language),
                title=script.filename,
                description=script.purpose,
                content=script.script,
                rollback_content=script.rollback_script,
                requires_root=script.requires_root,
                validation=by_target.get(f"patch_script:{script.filename}"),
            )
        )
    for index, rule in enumerate(plan.firewall_rules):
        patches.append(
            MitigationPatch(
                threat_id=threat_id,
                kind=PatchKind(rule.platform),
                title=f"{rule.platform} rule #{index + 1}",
                description=rule.description,
                content=rule.rule,
                requires_root=rule.platform in {"iptables", "nftables", "ufw"},
                validation=by_target.get(f"firewall_rule:{index}"),
            )
        )
    for rule in plan.detection_rules:
        patches.append(
            MitigationPatch(
                threat_id=threat_id,
                kind=PatchKind.DETECTION,
                title=f"{rule.format}: {rule.name}"[:300],
                description=f"Detection rule ({rule.format})",
                content=rule.rule,
            )
        )
    return patches


def _apply_result(event: ThreatEvent, result: PipelineResult) -> None:
    triage = result.triage
    event.title = triage.title[:300]
    event.summary = triage.summary
    event.threat_category = triage.threat_category
    event.severity_score = triage.severity_score
    event.final_severity = result.final_severity
    event.severity_label = result.severity_label
    event.exposure = result.exposure
    event.threat_actor = result.context.threat_actor if result.context else None
    event.indicators = [i.model_dump() for i in result.indicators]
    event.affected_technologies = triage.affected_technologies
    event.mitre_techniques = [m.model_dump() for m in result.context.mitre_mappings] if result.context else []
    event.injection_signals = sorted(
        set(result.sanitization.injection_signals) | ({"model_detected_manipulation"} if triage.injection_attempt_detected else set())
    )
    event.requires_human_review = result.requires_human_review
    event.analysis = result.model_dump(mode="json")
    event.status = ThreatStatus.ANALYZED
    event.current_stage = None
    event.error = None
    event.analyzed_at = utcnow()


async def run_analysis(threat_id: uuid.UUID) -> None:
    """Entry point used by both the Redis worker and the in-process queue."""
    settings = get_settings()
    if not await _claim(threat_id):
        logger.info("threat %s not claimable (missing or already processed)", threat_id)
        return

    async with session_scope() as session:
        event = await session.get(ThreatEvent, threat_id, options=[selectinload(ThreatEvent.company)])
        if event is None:
            return
        raw_text, source = event.raw_text, event.source.value
        profile = company_profile(event.company)

    if not settings.ai_configured and not _pipeline_injected:
        await _fail(threat_id, "AI engine not configured: set ANTHROPIC_API_KEY and restart the backend/worker.")
        return
    pipeline = get_pipeline(settings)

    async def on_stage(stage: str) -> None:
        await _set_stage(threat_id, stage)

    try:
        result = await pipeline.run(raw_text, profile, source=source, on_stage=on_stage)
    except PipelineError as exc:
        logger.warning("analysis of %s failed: %s", threat_id, exc)
        await _fail(threat_id, str(exc))
        return
    except Exception as exc:
        logger.exception("unexpected pipeline failure for %s", threat_id)
        await _fail(threat_id, f"Internal pipeline error ({type(exc).__name__}). See server logs.")
        return

    async with session_scope() as session:
        event = await session.get(ThreatEvent, threat_id)
        if event is None:
            return
        _apply_result(event, result)
        await session.execute(delete(MitigationPatch).where(MitigationPatch.threat_id == threat_id))
        patches = _patches_from_result(threat_id, result)
        session.add_all(patches)
        await session.flush()

        if settings.auto_dispatch_alerts and result.final_severity >= settings.alert_severity_threshold:
            channels = [c for c in AlertChannel if channel_configured(c, settings)]
            if channels:
                try:
                    logs = await dispatch_alerts(event, patches, channels, settings, trigger="auto")
                    session.add_all(logs)
                except Exception:
                    logger.exception("auto-dispatch failed for %s", threat_id)
    logger.info("threat %s analysed: severity=%.1f exposure=%s", threat_id, result.final_severity, result.exposure)



async def recover_stale_jobs(max_age_minutes: int = 15) -> int:
    """Fail jobs stuck in ``analyzing`` (worker crash/redeploy) so they can be retried."""
    from datetime import timedelta

    cutoff = utcnow() - timedelta(minutes=max_age_minutes)
    async with session_scope() as session:
        result = await session.execute(
            update(ThreatEvent)
            .where(ThreatEvent.status == ThreatStatus.ANALYZING, ThreatEvent.analysis_started_at < cutoff)
            .values(
                status=ThreatStatus.FAILED,
                current_stage=None,
                error="Analysis timed out or the worker restarted mid-run; re-run analysis.",
                updated_at=utcnow(),
            )
        )
        return result.rowcount or 0
