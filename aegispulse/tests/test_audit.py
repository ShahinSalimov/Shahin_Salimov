"""Audit trail coverage, tenant scoping of the log, and data-retention enforcement."""

from __future__ import annotations

import uuid
from datetime import timedelta

import httpx

from backend.simulator import SCENARIOS_BY_ID
from tests.test_auth import PASSWORD, _anon, _login, _tenant

INTEL = SCENARIOS_BY_ID["darkweb-nginx-0day"].payload


async def test_security_actions_are_audited(app_client: httpx.AsyncClient, drain) -> None:  # noqa: ANN001
    await _tenant(app_client, "Audited Co", "admin@audited.example")
    async with _anon(app_client) as anon:
        await anon.post("/api/auth/login", json={"email": "admin@audited.example", "password": "Wrong-password-9"})
    async with await _login(app_client, "admin@audited.example") as admin:
        await admin.post("/api/users", json={"email": "a2@audited.example", "name": "A2", "role": "viewer", "password": PASSWORD})
        key = (await admin.post("/api/api-keys", json={"name": "siem", "role": "analyst"})).json()
        await admin.post(f"/api/api-keys/{key['id']}/revoke")
        sim = await admin.post("/api/simulate-attack", json={"scenario_id": "darkweb-nginx-0day"})
        await drain()
        threat = (await admin.get(f"/api/threats/{sim.json()['threat_id']}")).json()
        await admin.post(f"/api/patches/{threat['patches'][0]['id']}/approve", json={"comment": "reviewed"})
        await admin.get(f"/api/threats/{threat['id']}/export/stix")
        company = (await admin.get("/api/companies")).json()[0]
        await admin.put(f"/api/companies/{company['id']}/stack", json={"tech_stack": [{"key": "aws", "label": "AWS"}]})

        log = (await admin.get("/api/audit-log")).json()
        actions = [(e["action"], e["outcome"]) for e in reversed(log)]
        assert actions == [
            ("company.create", "success"),  # tenant provisioning by the platform operator
            ("auth.login", "failure"),
            ("auth.login", "success"),
            ("user.create", "success"),
            ("api_key.create", "success"),
            ("api_key.revoke", "success"),
            ("simulator.attack", "success"),
            ("patch.approve", "success"),
            ("threat.export", "success"),
            ("company.stack_update", "success"),
        ]
        approve = next(e for e in log if e["action"] == "patch.approve")
        assert approve["actor"] == "admin@audited.example" and approve["details"]["comment"] == "reviewed"
        stack = next(e for e in log if e["action"] == "company.stack_update")
        assert stack["details"]["after"] == ["aws"]
        # No secret material in the audit trail.
        assert key["key"] not in str(log) and PASSWORD not in str(log)
        assert (await admin.get("/api/audit-log", params={"action": "patch.approve"})).json()[0]["id"] == approve["id"]

    async with await _login(app_client, "a2@audited.example") as viewer:
        assert (await viewer.get("/api/audit-log")).status_code == 403


async def test_audit_log_is_tenant_scoped(app_client: httpx.AsyncClient) -> None:
    await _tenant(app_client, "Tenant A", "admin@a.example")
    await _tenant(app_client, "Tenant B", "admin@b.example")
    async with await _login(app_client, "admin@a.example") as a:
        await a.post("/api/api-keys", json={"name": "only-a"})
        my_company = (await a.get("/api/auth/me")).json()["company_id"]
        assert all(e["company_id"] == my_company for e in (await a.get("/api/audit-log")).json())
    async with await _login(app_client, "admin@b.example") as b:
        assert "only-a" not in str((await b.get("/api/audit-log")).json())
    assert "only-a" in str((await app_client.get("/api/audit-log")).json())  # platform sees all


async def test_retention_redacts_old_raw_text_and_purges_audit(app_client: httpx.AsyncClient) -> None:
    from sqlalchemy import select, update

    from backend.audit import REDACTED_MARKER, apply_retention
    from backend.config import Settings
    from backend.db import session_scope
    from backend.models import AuditEvent, ThreatEvent, utcnow

    old = (await app_client.post("/api/threats/ingest", json={"raw_text": INTEL, "analyze": False})).json()["threat_id"]
    new = (await app_client.post("/api/threats/ingest", json={"raw_text": INTEL + " fresh", "analyze": False})).json()["threat_id"]
    async with session_scope() as session:
        await session.execute(update(ThreatEvent).where(ThreatEvent.id == uuid.UUID(old)).values(ingested_at=utcnow() - timedelta(days=45)))
        session.add(AuditEvent(actor="x", actor_kind="test", action="old.event", created_at=utcnow() - timedelta(days=500)))

    settings = Settings(_env_file=None, AEGIS_RAW_TEXT_RETENTION_DAYS=30, AEGIS_AUDIT_RETENTION_DAYS=400)
    assert await apply_retention(settings) == {"redacted": 1, "purged": 1}
    assert await apply_retention(settings) == {"redacted": 0, "purged": 0}  # idempotent

    assert (await app_client.get(f"/api/threats/{old}")).json()["raw_text"] == REDACTED_MARKER
    assert (await app_client.get(f"/api/threats/{new}")).json()["raw_text"].endswith("fresh")
    async with session_scope() as session:
        assert (await session.execute(select(AuditEvent).where(AuditEvent.action == "old.event"))).first() is None
