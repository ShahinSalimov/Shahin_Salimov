"""Authentication, roles, tenant isolation, API keys and session tokens."""

from __future__ import annotations

import time

import httpx
import pytest

from backend.config import Settings
from backend.models import Role, User
from backend.security import check_password_strength, hash_password, issue_token, verify_password, verify_token
from backend.simulator import SCENARIOS_BY_ID

PASSWORD = "Correct-Horse-42"
INTEL = SCENARIOS_BY_ID["darkweb-nginx-0day"].payload


def _anon(app_client: httpx.AsyncClient, **headers: str) -> httpx.AsyncClient:
    return httpx.AsyncClient(transport=app_client._transport, base_url="http://test", headers=headers)


async def _tenant(app_client: httpx.AsyncClient, name: str, email: str) -> dict:
    r = await app_client.post(
        "/api/companies",
        json={"name": name, "tech_stack": [{"key": "nginx", "label": "Nginx"}], "admin_email": email, "admin_password": PASSWORD},
    )
    assert r.status_code == 201, r.text
    return r.json()


async def _login(app_client: httpx.AsyncClient, email: str, password: str = PASSWORD) -> httpx.AsyncClient:
    async with _anon(app_client) as anon:
        r = await anon.post("/api/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return _anon(app_client, Authorization=f"Bearer {r.json()['token']}")


# ----------------------------------------------------------------- units


def test_password_hashing() -> None:
    stored = hash_password(PASSWORD)
    assert stored.startswith("scrypt$") and PASSWORD not in stored
    assert verify_password(PASSWORD, stored)
    assert not verify_password("wrong-password-1", stored)
    assert not verify_password(PASSWORD, "garbage")
    assert hash_password(PASSWORD) != stored  # salted


@pytest.mark.parametrize("weak", ["short1A", "alllowercaseletters", "111111111111"])
def test_weak_passwords_rejected(weak: str) -> None:
    with pytest.raises(ValueError):
        check_password_strength(weak)


def test_token_signature_and_expiry() -> None:
    settings = Settings(_env_file=None, AEGIS_SECRET_KEY="x" * 40, AEGIS_SESSION_TTL_HOURS=1)
    import uuid

    user = User(id=uuid.uuid4(), company_id=uuid.uuid4(), email="a@b.co", name="A", role=Role.ADMIN, password_hash="x")
    token, expires = issue_token(user, settings)
    assert verify_token(token, settings)["sub"] == str(user.id)
    assert expires > time.time()
    payload, sig = token.split(".")
    assert verify_token(payload + "." + sig[:-2] + "AA", settings) is None
    assert verify_token(token, Settings(_env_file=None, AEGIS_SECRET_KEY="y" * 40)) is None
    expired = Settings(_env_file=None, AEGIS_SECRET_KEY="x" * 40, AEGIS_SESSION_TTL_HOURS=-1)
    assert verify_token(issue_token(user, expired)[0], settings) is None


# ------------------------------------------------------------------- API


async def test_login_and_me(app_client: httpx.AsyncClient) -> None:
    tenant = await _tenant(app_client, "Globex", "ciso@globex.example")
    async with await _login(app_client, "CISO@globex.example") as client:
        me = (await client.get("/api/auth/me")).json()
    assert me == {"kind": "user", "role": "admin", "email": "ciso@globex.example", "company_id": tenant["id"], "company_name": "Globex"}


async def test_login_failures_are_uniform_and_rate_limited(app_client: httpx.AsyncClient) -> None:
    await _tenant(app_client, "Initech", "admin@initech.example")
    async with _anon(app_client) as anon:
        wrong = await anon.post("/api/auth/login", json={"email": "admin@initech.example", "password": "nope-nope-nope"})
        missing = await anon.post("/api/auth/login", json={"email": "ghost@initech.example", "password": "nope-nope-nope"})
        assert wrong.status_code == missing.status_code == 401
        assert wrong.json() == missing.json()
        codes = [(await anon.post("/api/auth/login", json={"email": "admin@initech.example", "password": "x"})).status_code for _ in range(10)]
    assert codes[-1] == 429


async def test_bad_bearer_token_rejected(app_client: httpx.AsyncClient) -> None:
    async with _anon(app_client, Authorization="Bearer not.a-token") as client:
        assert (await client.get("/api/threats")).status_code == 401


async def test_tenant_isolation(app_client: httpx.AsyncClient, drain) -> None:  # noqa: ANN001
    # Platform key ingests a threat for the demo tenant (the first company).
    r = await app_client.post("/api/threats/ingest", json={"raw_text": INTEL})
    demo_threat = r.json()["threat_id"]
    await drain()
    demo_company = (await app_client.get("/api/companies")).json()[0]["id"]

    await _tenant(app_client, "Umbrella", "admin@umbrella.example")
    async with await _login(app_client, "admin@umbrella.example") as other:
        assert (await other.get("/api/threats")).json()["total"] == 0
        assert (await other.get(f"/api/threats/{demo_threat}")).status_code == 404
        assert (await other.get(f"/api/threats/{demo_threat}/export/stix")).status_code == 404
        assert (await other.post(f"/api/threats/{demo_threat}/dismiss")).status_code == 404
        assert (await other.get(f"/api/companies/{demo_company}")).status_code == 404
        assert (await other.get("/api/threats", params={"company_id": demo_company})).status_code == 404
        assert [c["name"] for c in (await other.get("/api/companies")).json()] == ["Umbrella"]
        assert (await other.get("/api/telemetry")).json()["total_threats"] == 0
        assert (await other.get("/api/alerts")).json() == []
        detail = (await app_client.get(f"/api/threats/{demo_threat}")).json()
        patch_id = detail["patches"][0]["id"]
        assert (await other.post(f"/api/patches/{patch_id}/approve", json={})).status_code == 404
        # Their own ingest lands in their own tenant.
        mine = await other.post("/api/threats/ingest", json={"raw_text": INTEL, "analyze": False})
        assert mine.json()["duplicate"] is False  # dedup is per tenant
        assert (await other.get("/api/threats")).json()["total"] == 1
        # Tenant admins cannot create tenants.
        assert (await other.post("/api/companies", json={"name": "Evil Corp"})).status_code == 403


async def test_roles_enforced(app_client: httpx.AsyncClient, drain) -> None:  # noqa: ANN001
    await _tenant(app_client, "Hooli", "admin@hooli.example")
    async with await _login(app_client, "admin@hooli.example") as admin:
        for email, role in (("viewer@hooli.example", "viewer"), ("analyst@hooli.example", "analyst")):
            r = await admin.post("/api/users", json={"email": email, "name": role, "role": role, "password": PASSWORD})
            assert r.status_code == 201, r.text
        assert (await admin.post("/api/users", json={"email": "x@hooli.example", "name": "x", "password": "weak"})).status_code == 422
        assert (await admin.post("/api/users", json={"email": "viewer@hooli.example", "name": "dup", "password": PASSWORD})).status_code == 409

    async with await _login(app_client, "viewer@hooli.example") as viewer:
        assert (await viewer.get("/api/threats")).status_code == 200
        assert (await viewer.post("/api/threats/ingest", json={"raw_text": INTEL})).status_code == 403
        assert (await viewer.post("/api/simulate-attack", json={})).status_code == 403
        assert (await viewer.get("/api/users")).status_code == 403

    async with await _login(app_client, "analyst@hooli.example") as analyst:
        r = await analyst.post("/api/simulate-attack", json={"scenario_id": "darkweb-nginx-0day"})
        assert r.status_code == 202
        await drain()
        t = (await analyst.get(f"/api/threats/{r.json()['threat_id']}")).json()
        approved = await analyst.post(f"/api/patches/{t['patches'][0]['id']}/approve", json={})
        assert approved.json()["reviewed_by"] == "analyst@hooli.example"
        company = (await analyst.get("/api/companies")).json()[0]
        assert (await analyst.put(f"/api/companies/{company['id']}/stack", json={"tech_stack": []})).status_code == 403
        assert (await analyst.post("/api/collectors/nvd/run")).status_code == 403


async def test_user_admin_guards_and_deactivation(app_client: httpx.AsyncClient) -> None:
    await _tenant(app_client, "Stark", "admin@stark.example")
    async with await _login(app_client, "admin@stark.example") as admin:
        users = (await admin.get("/api/users")).json()
        me = users[0]["id"]
        assert (await admin.patch(f"/api/users/{me}", json={"role": "viewer"})).status_code == 409
        assert (await admin.patch(f"/api/users/{me}", json={"is_active": False})).status_code == 409
        new = (await admin.post("/api/users", json={"email": "temp@stark.example", "name": "T", "password": PASSWORD})).json()
    async with await _login(app_client, "temp@stark.example") as temp:
        assert (await temp.get("/api/threats")).status_code == 200
        async with await _login(app_client, "admin@stark.example") as admin:
            assert (await admin.patch(f"/api/users/{new['id']}", json={"is_active": False})).json()["is_active"] is False
        # Existing session dies immediately once the account is deactivated.
        assert (await temp.get("/api/threats")).status_code == 401


async def test_api_key_lifecycle(app_client: httpx.AsyncClient) -> None:
    tenant = await _tenant(app_client, "Wayne", "admin@wayne.example")
    async with await _login(app_client, "admin@wayne.example") as admin:
        created = await admin.post("/api/api-keys", json={"name": "siem-forwarder", "role": "analyst"})
        assert created.status_code == 201
        key = created.json()["key"]
        assert key.startswith("ap_") and created.json()["prefix"] == key[:10]
        listed = (await admin.get("/api/api-keys")).json()
        assert "key" not in listed[0] and listed[0]["name"] == "siem-forwarder"

        async with _anon(app_client, **{"X-API-Key": key}) as machine:
            r = await machine.post("/api/threats/ingest", json={"raw_text": INTEL, "analyze": False})
            assert r.status_code == 202
            assert (await machine.get("/api/companies")).json()[0]["id"] == tenant["id"]
            assert (await machine.get("/api/users")).status_code == 403  # analyst key, not admin

            await admin.post(f"/api/api-keys/{listed[0]['id']}/revoke")
            assert (await machine.get("/api/threats")).status_code == 401
        assert (await admin.get("/api/api-keys")).json()[0]["last_used_at"] is not None


async def test_platform_key_must_target_tenant_for_user_admin(app_client: httpx.AsyncClient) -> None:
    tenant = await _tenant(app_client, "Cyberdyne", "admin@cyberdyne.example")
    assert (await app_client.get("/api/users")).status_code == 400
    users = (await app_client.get("/api/users", params={"company_id": tenant["id"]})).json()
    assert [u["email"] for u in users] == ["admin@cyberdyne.example"]


async def test_concurrent_seeding_is_idempotent(tmp_path) -> None:  # noqa: ANN001
    """Regression: several API workers seeding at once crashed on the unique email constraint."""
    import asyncio

    from sqlalchemy import func, select

    from backend import db
    from backend.bootstrap import seed
    from backend.models import CompanyProfile

    settings = Settings(_env_file=None, AEGIS_BOOTSTRAP_ADMIN_EMAIL="boss@acme.example", AEGIS_BOOTSTRAP_ADMIN_PASSWORD=PASSWORD)
    db.init_engine(f"sqlite+aiosqlite:///{tmp_path / 'seed.db'}")
    try:
        await db.create_schema()
        await asyncio.gather(*(seed(settings) for _ in range(5)))
        async with db.get_sessionmaker()() as session:
            assert (await session.execute(select(func.count(CompanyProfile.id)))).scalar_one() == 1
            assert (await session.execute(select(func.count(User.id)))).scalar_one() == 1
    finally:
        await db.dispose_engine()
