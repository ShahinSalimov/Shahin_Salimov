"""AegisPulse API.

Endpoints (all under ``/api`` require ``X-API-Key``; ``/health`` is public):

    GET  /health                               liveness + dependency status
    GET  /api/telemetry                        SOC telemetry bar metrics
    GET  /api/stream                           Server-Sent Events change feed
    GET  /api/companies                        list company profiles
    POST /api/companies                        create a company profile
    GET  /api/companies/{id}                   fetch one profile
    PUT  /api/companies/{id}/stack             replace the tech stack (re-prioritises live)
    POST /api/threats/ingest                   ingest raw intel (dedup + queue analysis)
    GET  /api/threats                          list threats with live stack-aware priority
    GET  /api/threats/{id}                     full detail incl. agents' output, patches, alerts
    POST /api/threats/{id}/analyze             (re-)run the 3-agent pipeline
    POST /api/threats/{id}/dismiss             mark as dismissed
    GET  /api/threats/{id}/alert-preview       formatted Slack / WhatsApp / webhook payload
    POST /api/threats/{id}/dispatch            send alerts on chosen channels
    GET  /api/threats/{id}/export/stix         STIX 2.1 bundle download
    GET  /api/threats/{id}/export/cef          ArcSight CEF download
    POST /api/patches/{id}/approve|reject      human approval workflow
    POST /api/patches/{id}/simulate            static dry-run (never executes)
    GET  /api/alerts                           alert audit log
    GET  /api/simulate-attack/scenarios        demo scenarios
    POST /api/simulate-attack                  inject a live demo attack and analyse it
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from typing import Annotated

import httpx
from fastapi import Depends, FastAPI, HTTPException, Query, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, PlainTextResponse, StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from agents.schemas import FirewallRule, PatchScript, StackComponent
from agents.script_validator import validate_firewall_rule, validate_patch_script
from backend import simulator
from backend.analysis_service import (
    company_profile,
    live_priority,
    run_analysis,
)
from backend.bootstrap import seed
from backend.collector_runner import enabled_names
from backend.collectors import REGISTRY, build_collectors
from backend.config import Settings, get_settings
from backend.db import create_schema, dispose_engine, get_session, init_engine, ping, session_scope
from backend.dispatcher import build_preview, channel_configured, dispatch_alerts
from backend.ingestion import enqueue_analysis, ingest_text
from backend.integrations.siem_exporter import build_cef_events, build_stix_bundle
from backend.logging_setup import configure_logging
from backend.models import (
    AlertChannel,
    AlertLog,
    AlertStatus,
    CollectorState,
    CompanyProfile,
    MitigationPatch,
    PatchKind,
    PatchStatus,
    Role,
    ThreatEvent,
    ThreatStatus,
    User,
    utcnow,
)
from backend.routes_auth import router as auth_router
from backend.schemas import (
    AlertOut,
    AlertPreviewOut,
    CollectorOut,
    CompanyCreate,
    CompanyOut,
    CompanyStackUpdate,
    DispatchRequest,
    IngestResponse,
    PatchOut,
    PatchReview,
    PatchSimulationOut,
    ScenarioOut,
    SimulateAttackRequest,
    SimulateAttackResponse,
    TelemetryOut,
    ThreatDetailOut,
    ThreatIngest,
    ThreatListOut,
    ThreatSummaryOut,
    as_utc,
)
from backend.security import Admin, Analyst, AnalystExpensive, Principal, Viewer, hash_password, rate_limiter
from backend.task_queue import queue

logger = logging.getLogger("aegispulse.api")

SessionDep = Annotated[AsyncSession, Depends(get_session)]
SettingsDep = Annotated[Settings, Depends(get_settings)]
AGENT_COUNT = 3


# --------------------------------------------------------------------------- #
# App lifecycle
# --------------------------------------------------------------------------- #


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    configure_logging(settings.log_level)
    if settings.is_production and not settings.secret_key:
        raise RuntimeError("AEGIS_SECRET_KEY must be set when AEGIS_ENV=production")
    if not settings.api_keys and not settings.is_production:
        logger.warning("AEGIS_API_KEYS is empty: unauthenticated requests get operator access (development only)")
    if not settings.ai_configured:
        logger.warning("ANTHROPIC_API_KEY is not set: threat analysis will fail until it is configured")

    init_engine()
    if settings.auto_create_schema:
        await create_schema()
    await seed(settings)

    await queue.connect()
    queue.set_local_handler(run_analysis)
    rate_limiter.attach_redis(queue.redis)
    try:
        yield
    finally:
        await queue.close()
        await dispose_engine()


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="AegisPulse API",
        version="1.0.0",
        description="Autonomous AI & dark-web threat intelligence platform.",
        lifespan=lifespan,
        docs_url=None if settings.is_production else "/docs",
        redoc_url=None,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=False,
        allow_methods=["GET", "POST", "PUT", "PATCH"],
        allow_headers=["Authorization", "X-API-Key", "Content-Type"],
        max_age=600,
    )

    @app.middleware("http")
    async def security_headers(request: Request, call_next):  # noqa: ANN001, ANN202
        response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "no-referrer")
        response.headers.setdefault("Cache-Control", "no-store")
        return response

    @app.exception_handler(RequestValidationError)
    async def validation_handler(_: Request, exc: RequestValidationError) -> JSONResponse:
        errors = [{"loc": e.get("loc"), "msg": e.get("msg"), "type": e.get("type")} for e in exc.errors()]
        return JSONResponse(status_code=422, content={"detail": errors})

    @app.exception_handler(Exception)
    async def unhandled_handler(request: Request, exc: Exception) -> JSONResponse:
        logger.exception("unhandled error on %s %s", request.method, request.url.path)
        return JSONResponse(status_code=500, content={"detail": "Internal server error"})

    app.include_router(auth_router)
    _register_routes(app)
    return app


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #


async def _resolve_company(session: AsyncSession, principal: Principal, company_id: uuid.UUID | None) -> CompanyProfile:
    """Tenant principals always resolve to their own company; others' IDs look like 404s."""
    if principal.company_id is not None:
        if company_id is not None and company_id != principal.company_id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Company profile not found")
        company_id = principal.company_id
    if company_id is not None:
        company = await session.get(CompanyProfile, company_id)
        if company is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Company profile not found")
        return company
    company = (await session.execute(select(CompanyProfile).order_by(CompanyProfile.created_at).limit(1))).scalar_one_or_none()
    if company is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No company profile exists; create one first")
    return company


async def _get_threat(session: AsyncSession, principal: Principal, threat_id: uuid.UUID, *, detail: bool = False) -> ThreatEvent:
    options = [selectinload(ThreatEvent.company)]
    if detail:
        options += [selectinload(ThreatEvent.patches), selectinload(ThreatEvent.alerts)]
    event = await session.get(ThreatEvent, threat_id, options=options)
    if event is None or not principal.can_access(event.company_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Threat not found")
    return event


def _summary(event: ThreatEvent, stack: list[StackComponent]) -> ThreatSummaryOut:
    out = ThreatSummaryOut.model_validate(event)
    priority, exposure, matched = live_priority(event, stack)
    out.priority_score, out.live_exposure, out.matched_components = priority, exposure, matched
    return out


_DRY_RUN_SKIP = re.compile(r"^\s*(#|set\s+-|echo\b|printf\b|log\b|:|\}|\{|fi\b|then\b|else\b|done\b|do\b|esac\b|;;)")


def _planned_actions(patch: MitigationPatch) -> list[str]:
    if patch.kind in {PatchKind.AWS_WAF, PatchKind.AWS_SECURITY_GROUP}:
        return [f"Apply {patch.kind.value} change via AWS API (JSON validated, not submitted)"]
    if patch.kind is PatchKind.DETECTION:
        return ["Deploy detection rule to SIEM (not submitted)"]
    if patch.kind is PatchKind.NGINX:
        return ["Insert nginx configuration snippet", "Run 'nginx -t' then reload (not executed)"]
    actions = []
    for line in patch.content.splitlines():
        if not line.strip() or _DRY_RUN_SKIP.match(line):
            continue
        if patch.kind is PatchKind.PYTHON and not re.match(r"^\s*(subprocess|os\.|open\(|boto3|requests|client\.)", line):
            continue
        actions.append(line.strip()[:240])
    return actions[:40]


# --------------------------------------------------------------------------- #
# Routes
# --------------------------------------------------------------------------- #


def _register_routes(app: FastAPI) -> None:  # noqa: C901 - flat route table is clearer
    @app.get("/health", tags=["system"])
    async def health(settings: SettingsDep) -> dict[str, object]:
        db_ok = await ping()
        return {
            "status": "ok" if db_ok else "degraded",
            "database": db_ok,
            "queue": queue.backend,
            "ai_engine_configured": settings.ai_configured,
            "model": settings.model,
        }

    # ---------------------------------------------------------- telemetry

    @app.get("/api/telemetry", response_model=TelemetryOut, tags=["system"])
    async def telemetry(principal: Viewer, session: SessionDep, settings: SettingsDep) -> TelemetryOut:
        scope = [ThreatEvent.company_id == principal.company_id] if principal.company_id else []
        counts = dict(
            (await session.execute(select(ThreatEvent.status, func.count()).where(*scope).group_by(ThreatEvent.status))).all()
        )
        total = sum(counts.values())
        critical = (
            await session.execute(select(func.count()).where(ThreatEvent.final_severity >= 9.0, *scope))
        ).scalar_one()
        alerts_sent = (
            await session.execute(
                select(func.count()).select_from(AlertLog).join(ThreatEvent).where(AlertLog.status == AlertStatus.SENT, *scope)
            )
        ).scalar_one()
        recent = (
            await session.execute(
                select(ThreatEvent.ingested_at, ThreatEvent.analyzed_at)
                .where(ThreatEvent.analyzed_at.is_not(None), *scope)
                .order_by(ThreatEvent.analyzed_at.desc())
                .limit(200)
            )
        ).all()
        durations = [
            (as_utc(done) - as_utc(start)).total_seconds()  # type: ignore[operator]
            for start, done in recent
            if start and done
        ]
        analyzing = counts.get(ThreatStatus.ANALYZING, 0)
        db_ok = await ping()
        return TelemetryOut(
            status="operational" if db_ok and settings.ai_configured else "degraded",
            database=db_ok,
            queue_backend=queue.backend,  # type: ignore[arg-type]
            queue_depth=max(0, await queue.depth()),
            ai_engine_configured=settings.ai_configured,
            model=settings.model,
            agents_total=AGENT_COUNT,
            agents_active=min(AGENT_COUNT, analyzing) if analyzing else 0,
            analyzing_now=analyzing,
            mttr_seconds=round(sum(durations) / len(durations), 1) if durations else None,
            total_threats=total,
            critical_threats=critical,
            threats_mitigated=counts.get(ThreatStatus.MITIGATED, 0),
            alerts_sent=alerts_sent,
            generated_at=datetime.now(UTC),
        )

    @app.get("/api/stream", tags=["system"])
    async def stream(request: Request, principal: Viewer) -> StreamingResponse:
        scope = [ThreatEvent.company_id == principal.company_id] if principal.company_id else []

        async def events() -> AsyncIterator[str]:
            last_sig: tuple[object, ...] | None = None
            idle = 0
            yield "retry: 3000\n\n"
            while True:
                if await request.is_disconnected():
                    break
                async with session_scope() as session:
                    sig = tuple(
                        (
                            await session.execute(
                                select(func.count(ThreatEvent.id), func.max(ThreatEvent.updated_at)).where(*scope)
                            )
                        ).one()
                    ) + (
                        (await session.execute(select(func.count(AlertLog.id)).join(ThreatEvent).where(*scope))).scalar_one(),
                        (
                            await session.execute(
                                select(func.count(MitigationPatch.id))
                                .join(ThreatEvent)
                                .where(MitigationPatch.status != PatchStatus.PROPOSED, *scope)
                            )
                        ).scalar_one(),
                    )
                if sig != last_sig:
                    last_sig = sig
                    idle = 0
                    payload = {"threats": sig[0], "updated_at": str(sig[1]), "alerts": sig[2], "reviews": sig[3]}
                    yield f"event: update\ndata: {json.dumps(payload)}\n\n"
                else:
                    idle += 1
                    if idle % 8 == 0:
                        yield ": keep-alive\n\n"
                await asyncio.sleep(2)

        return StreamingResponse(
            events(),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no", "Connection": "keep-alive"},
        )

    # ---------------------------------------------------------- companies

    @app.get("/api/companies", response_model=list[CompanyOut], tags=["companies"])
    async def list_companies(principal: Viewer, session: SessionDep) -> list[CompanyProfile]:
        query = select(CompanyProfile).order_by(CompanyProfile.created_at)
        if principal.company_id:
            query = query.where(CompanyProfile.id == principal.company_id)
        return list((await session.execute(query)).scalars())

    @app.post("/api/companies", response_model=CompanyOut, status_code=201, tags=["companies"])
    async def create_company(body: CompanyCreate, principal: Admin, session: SessionDep) -> CompanyProfile:
        if not principal.is_platform:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Only platform operators can create tenants")
        company = CompanyProfile(
            name=body.name, industry=body.industry, tech_stack=[c.model_dump() for c in body.tech_stack]
        )
        session.add(company)
        if body.admin_email and body.admin_password:
            await session.flush()
            session.add(
                User(
                    company_id=company.id, email=body.admin_email.lower(), name=body.admin_name or "Administrator",
                    role=Role.ADMIN, password_hash=hash_password(body.admin_password),
                )
            )
        try:
            await session.commit()
        except IntegrityError as exc:
            await session.rollback()
            raise HTTPException(status.HTTP_409_CONFLICT, "A company or admin user with this name/email already exists") from exc
        return company

    @app.get("/api/companies/{company_id}", response_model=CompanyOut, tags=["companies"])
    async def get_company(company_id: uuid.UUID, principal: Viewer, session: SessionDep) -> CompanyProfile:
        return await _resolve_company(session, principal, company_id)

    @app.put("/api/companies/{company_id}/stack", response_model=CompanyOut, tags=["companies"])
    async def update_stack(
        company_id: uuid.UUID, body: CompanyStackUpdate, principal: Admin, session: SessionDep
    ) -> CompanyProfile:
        company = await _resolve_company(session, principal, company_id)
        seen: dict[str, dict[str, object]] = {}
        for c in body.tech_stack:
            seen[c.key] = c.model_dump()
        company.tech_stack = list(seen.values())
        company.updated_at = utcnow()
        await session.commit()
        return company

    # ------------------------------------------------------------ threats

    @app.post("/api/threats/ingest", response_model=IngestResponse, status_code=202, tags=["threats"])
    async def ingest(body: ThreatIngest, principal: Analyst, session: SessionDep, settings: SettingsDep) -> IngestResponse:
        if len(body.raw_text) > settings.max_ingest_chars:
            raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "raw_text exceeds the configured limit")
        company = await _resolve_company(session, principal, body.company_id)
        event, duplicate = await ingest_text(
            session, company.id, raw_text=body.raw_text, source=body.source, source_ref=body.source_ref, analyze=body.analyze
        )
        return IngestResponse(threat_id=event.id, duplicate=duplicate, status=event.status)

    @app.get("/api/threats", response_model=ThreatListOut, tags=["threats"])
    async def list_threats(
        principal: Viewer,
        session: SessionDep,
        company_id: uuid.UUID | None = None,
        min_severity: Annotated[float | None, Query(ge=0, le=10)] = None,
        status_filter: Annotated[ThreatStatus | None, Query(alias="status")] = None,
        sort: Annotated[str, Query(pattern="^(priority|recent)$")] = "priority",
        limit: Annotated[int, Query(ge=1, le=500)] = 100,
    ) -> ThreatListOut:
        company = await _resolve_company(session, principal, company_id)
        stack = company_profile(company).tech_stack
        query = select(ThreatEvent).where(ThreatEvent.company_id == company.id)
        if status_filter is not None:
            query = query.where(ThreatEvent.status == status_filter)
        if min_severity is not None:
            query = query.where(ThreatEvent.final_severity >= min_severity)
        total = (await session.execute(select(func.count()).select_from(query.subquery()))).scalar_one()
        rows = list((await session.execute(query.order_by(ThreatEvent.ingested_at.desc()).limit(limit))).scalars())
        items = [_summary(e, stack) for e in rows]
        if sort == "priority":
            items.sort(key=lambda t: (t.priority_score is not None, t.priority_score or 0.0), reverse=True)
            # Keep in-flight threats visible at the top so the live demo is obvious.
            items.sort(key=lambda t: t.status in (ThreatStatus.QUEUED, ThreatStatus.ANALYZING), reverse=True)
        return ThreatListOut(items=items, total=total)

    @app.get("/api/threats/{threat_id}", response_model=ThreatDetailOut, tags=["threats"])
    async def get_threat(threat_id: uuid.UUID, principal: Viewer, session: SessionDep) -> ThreatDetailOut:
        event = await _get_threat(session, principal, threat_id, detail=True)
        stack = company_profile(event.company).tech_stack
        detail = ThreatDetailOut.model_validate(event)
        detail.priority_score, detail.live_exposure, detail.matched_components = live_priority(event, stack)
        return detail

    @app.post("/api/threats/{threat_id}/analyze", response_model=IngestResponse, status_code=202, tags=["threats"])
    async def reanalyze(threat_id: uuid.UUID, principal: AnalystExpensive, session: SessionDep) -> IngestResponse:
        event = await _get_threat(session, principal, threat_id)
        if event.status in (ThreatStatus.QUEUED, ThreatStatus.ANALYZING):
            raise HTTPException(status.HTTP_409_CONFLICT, "Analysis already in progress")
        await enqueue_analysis(session, event)
        return IngestResponse(threat_id=event.id, duplicate=False, status=event.status)

    @app.post("/api/threats/{threat_id}/dismiss", response_model=ThreatSummaryOut, tags=["threats"])
    async def dismiss(threat_id: uuid.UUID, principal: Analyst, session: SessionDep) -> ThreatSummaryOut:
        event = await _get_threat(session, principal, threat_id)
        if event.status in (ThreatStatus.QUEUED, ThreatStatus.ANALYZING):
            raise HTTPException(status.HTTP_409_CONFLICT, "Cannot dismiss while analysis is running")
        event.status = ThreatStatus.DISMISSED
        await session.commit()
        return _summary(event, company_profile(event.company).tech_stack)

    @app.get("/api/threats/{threat_id}/alert-preview", response_model=AlertPreviewOut, tags=["alerts"])
    async def alert_preview(
        threat_id: uuid.UUID, principal: Viewer, session: SessionDep, settings: SettingsDep,
        channel: AlertChannel = AlertChannel.SLACK,
    ) -> AlertPreviewOut:
        event = await _get_threat(session, principal, threat_id, detail=True)
        if event.analysis is None:
            raise HTTPException(status.HTTP_409_CONFLICT, "Threat has not been analysed yet")
        summary, payload = build_preview(channel, event, list(event.patches), settings)
        return AlertPreviewOut(
            channel=channel,
            configured=channel_configured(channel, settings),
            executive_summary=summary.executive,
            technical_summary=summary.technical,
            payload=payload,
        )

    @app.post("/api/threats/{threat_id}/dispatch", response_model=list[AlertOut], tags=["alerts"])
    async def dispatch(
        threat_id: uuid.UUID, body: DispatchRequest, principal: Analyst, session: SessionDep, settings: SettingsDep
    ) -> list[AlertLog]:
        event = await _get_threat(session, principal, threat_id, detail=True)
        if event.analysis is None:
            raise HTTPException(status.HTTP_409_CONFLICT, "Threat has not been analysed yet")
        logs = await dispatch_alerts(event, list(event.patches), list(dict.fromkeys(body.channels)), settings)
        session.add_all(logs)
        await session.commit()
        return logs

    @app.get("/api/threats/{threat_id}/export/stix", tags=["integrations"])
    async def export_stix(threat_id: uuid.UUID, principal: Viewer, session: SessionDep) -> JSONResponse:
        event = await _get_threat(session, principal, threat_id)
        try:
            bundle = build_stix_bundle(event)
        except ValueError as exc:
            raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc
        return JSONResponse(
            bundle,
            media_type="application/stix+json;version=2.1",
            headers={"Content-Disposition": f'attachment; filename="aegispulse-{threat_id}.stix.json"'},
        )

    @app.get("/api/threats/{threat_id}/export/cef", tags=["integrations"])
    async def export_cef(threat_id: uuid.UUID, principal: Viewer, session: SessionDep) -> PlainTextResponse:
        event = await _get_threat(session, principal, threat_id)
        try:
            lines = build_cef_events(event)
        except ValueError as exc:
            raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc
        return PlainTextResponse(
            "\n".join(lines) + "\n",
            headers={"Content-Disposition": f'attachment; filename="aegispulse-{threat_id}.cef"'},
        )

    # ------------------------------------------------------------ patches

    async def _load_patch(session: AsyncSession, principal: Principal, patch_id: uuid.UUID) -> MitigationPatch:
        patch = await session.get(MitigationPatch, patch_id, options=[selectinload(MitigationPatch.threat)])
        if patch is None or not principal.can_access(patch.threat.company_id):
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Patch not found")
        return patch

    async def _review(patch_id: uuid.UUID, session: AsyncSession, principal: Principal, new_status: PatchStatus) -> MitigationPatch:
        patch = await _load_patch(session, principal, patch_id)
        reviewer = principal.label  # audit trail uses the authenticated identity, never client input
        if patch.status is not PatchStatus.PROPOSED:
            raise HTTPException(status.HTTP_409_CONFLICT, f"Patch already {patch.status.value}")
        patch.status = new_status
        patch.reviewed_by = reviewer
        patch.reviewed_at = utcnow()
        if new_status is PatchStatus.APPROVED and patch.threat.status is ThreatStatus.ANALYZED:
            patch.threat.status = ThreatStatus.MITIGATED
        patch.threat.updated_at = utcnow()
        await session.commit()
        return patch

    @app.post("/api/patches/{patch_id}/approve", response_model=PatchOut, tags=["patches"])
    async def approve_patch(patch_id: uuid.UUID, body: PatchReview, principal: Analyst, session: SessionDep) -> MitigationPatch:
        return await _review(patch_id, session, principal, PatchStatus.APPROVED)

    @app.post("/api/patches/{patch_id}/reject", response_model=PatchOut, tags=["patches"])
    async def reject_patch(patch_id: uuid.UUID, body: PatchReview, principal: Analyst, session: SessionDep) -> MitigationPatch:
        return await _review(patch_id, session, principal, PatchStatus.REJECTED)

    @app.post("/api/patches/{patch_id}/simulate", response_model=PatchSimulationOut, tags=["patches"])
    async def simulate_patch(patch_id: uuid.UUID, principal: Analyst, session: SessionDep) -> PatchSimulationOut:
        patch = await _load_patch(session, principal, patch_id)
        if patch.kind in (PatchKind.BASH, PatchKind.PYTHON):
            check = await validate_patch_script(
                PatchScript(
                    language=patch.kind.value, filename=patch.title, purpose=patch.description or "",
                    script=patch.content, rollback_script=patch.rollback_content or "", requires_root=patch.requires_root,
                )
            )
        elif patch.kind is PatchKind.DETECTION:
            check = None
        else:
            check = validate_firewall_rule(
                FirewallRule(platform=patch.kind.value, description=patch.description or "", rule=patch.content), 0
            )
        actions = _planned_actions(patch)
        transcript = [
            f"$ aegispulse dry-run --target {patch.title}",
            "[sandbox] static analysis only - no command is executed on any host",
            f"[check] syntax: {'OK' if (check is None or check.syntax_ok) else 'FAILED'}",
            f"[check] risk level: {check.risk_level if check else 'low'}",
            *[f"[finding] {f}" for f in (check.findings if check else [])],
            *[f"[plan {i + 1:02d}] would run: {a}" for i, a in enumerate(actions)],
            f"[result] {'ready for approval' if (check is None or check.syntax_ok) else 'fix required before approval'}",
        ]
        return PatchSimulationOut(
            patch_id=patch.id,
            syntax_ok=check.syntax_ok if check else True,
            risk_level=check.risk_level if check else "low",
            findings=check.findings if check else [],
            planned_actions=actions,
            transcript=transcript,
        )

    # ------------------------------------------------------------- alerts

    @app.get("/api/alerts", response_model=list[AlertOut], tags=["alerts"])
    async def list_alerts(
        principal: Viewer, session: SessionDep, limit: Annotated[int, Query(ge=1, le=500)] = 100
    ) -> list[AlertLog]:
        return list(
            (
                await session.execute(
                    select(AlertLog)
                    .join(ThreatEvent)
                    .where(*([ThreatEvent.company_id == principal.company_id] if principal.company_id else []))
                    .order_by(AlertLog.created_at.desc())
                    .limit(limit)
                )
            ).scalars()
        )

    # --------------------------------------------------------- collectors

    async def _collector_rows(session: AsyncSession, settings: Settings) -> list[CollectorOut]:
        rows = {r.name: r for r in (await session.execute(select(CollectorState))).scalars()}
        enabled = enabled_names(settings)
        async with httpx.AsyncClient() as http:  # instances only read settings here
            collectors = build_collectors(settings, http)
        out = []
        for c in collectors:
            row = rows.get(c.name)
            ready, reason = c.configured()
            out.append(
                CollectorOut(
                    name=c.name, source=c.source, enabled=c.name in enabled, configured=ready, config_issue=reason,
                    interval_seconds=c.interval_s, run_requested=bool(row and row.run_requested),
                    last_run_at=row.last_run_at if row else None, last_success_at=row.last_success_at if row else None,
                    last_error=row.last_error if row else None, last_items=row.last_items if row else 0,
                    items_ingested_total=row.items_ingested_total if row else 0,
                )
            )
        return out

    @app.get("/api/collectors", response_model=list[CollectorOut], tags=["collectors"])
    async def list_collectors(principal: Viewer, session: SessionDep, settings: SettingsDep) -> list[CollectorOut]:
        return await _collector_rows(session, settings)

    @app.post("/api/collectors/{name}/run", response_model=CollectorOut, status_code=202, tags=["collectors"])
    async def request_collector_run(name: str, principal: Admin, session: SessionDep, settings: SettingsDep) -> CollectorOut:
        if name not in REGISTRY:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown collector")
        row = await session.get(CollectorState, name)
        if row is None:
            row = CollectorState(name=name, state={})
            session.add(row)
        row.run_requested = True
        await session.commit()
        return next(c for c in await _collector_rows(session, settings) if c.name == name)

    # ---------------------------------------------------------- simulator

    @app.get("/api/simulate-attack/scenarios", response_model=list[ScenarioOut], tags=["simulator"])
    async def scenarios(principal: Viewer) -> list[ScenarioOut]:
        return [
            ScenarioOut(id=s.id, name=s.name, source=s.source, headline=s.headline, targets=list(s.targets))
            for s in simulator.SCENARIOS
        ]

    @app.post("/api/simulate-attack", response_model=SimulateAttackResponse, status_code=202, tags=["simulator"])
    async def simulate_attack(
        body: SimulateAttackRequest, principal: AnalystExpensive, session: SessionDep
    ) -> SimulateAttackResponse:
        try:
            scenario = simulator.pick_scenario(body.scenario_id)
        except KeyError as exc:
            raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc
        company = await _resolve_company(session, principal, body.company_id)
        event, _dup = await ingest_text(
            session, company.id, raw_text=scenario.render(simulator.new_run_id()), source=scenario.source,
            source_ref=scenario.source_ref, analyze=True,
        )
        return SimulateAttackResponse(
            scenario=ScenarioOut(
                id=scenario.id, name=scenario.name, source=scenario.source,
                headline=scenario.headline, targets=list(scenario.targets),
            ),
            threat_id=event.id,
            status=event.status,
        )


app = create_app()
