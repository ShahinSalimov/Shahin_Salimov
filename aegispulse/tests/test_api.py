"""End-to-end API tests: auth, ingestion, dedup, analysis, simulator, approval, alerts, rate limits."""

from __future__ import annotations

import httpx
import pytest

from backend.simulator import SCENARIOS, SCENARIOS_BY_ID
from tests.fakes import FakeAnthropic

INTEL = SCENARIOS_BY_ID["darkweb-nginx-0day"].payload


async def _analysed_threat(client: httpx.AsyncClient, drain, text: str = INTEL) -> dict:  # noqa: ANN001
    r = await client.post("/api/threats/ingest", json={"raw_text": text, "source": "darkweb"})
    assert r.status_code == 202, r.text
    await drain()
    detail = await client.get(f"/api/threats/{r.json()['threat_id']}")
    assert detail.status_code == 200
    return detail.json()


# ------------------------------------------------------------------ security


async def test_health_is_public(app_client: httpx.AsyncClient) -> None:
    r = await app_client.get("/health", headers={"X-API-Key": ""})
    assert r.status_code == 200 and r.json()["database"] is True
    assert r.headers["x-content-type-options"] == "nosniff"


@pytest.mark.parametrize("headers", [{}, {"X-API-Key": "wrong"}])
async def test_api_requires_valid_key(app_client: httpx.AsyncClient, headers: dict) -> None:
    async with httpx.AsyncClient(transport=app_client._transport, base_url="http://test", headers=headers) as anon:
        for method, path in [("GET", "/api/threats"), ("POST", "/api/threats/ingest"), ("POST", "/api/simulate-attack"), ("GET", "/api/telemetry")]:
            r = await anon.request(method, path, json={})
            assert r.status_code == 401, (method, path)


async def test_second_key_accepted(app_client: httpx.AsyncClient) -> None:
    r = await app_client.get("/api/telemetry", headers={"X-API-Key": "test-key-2"})
    assert r.status_code == 200


async def test_cors_only_allows_configured_origin(app_client: httpx.AsyncClient) -> None:
    ok = await app_client.options("/api/threats", headers={"Origin": "http://localhost:3000", "Access-Control-Request-Method": "GET"})
    assert ok.headers.get("access-control-allow-origin") == "http://localhost:3000"
    bad = await app_client.options("/api/threats", headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "GET"})
    assert "access-control-allow-origin" not in bad.headers


async def test_expensive_endpoints_are_rate_limited(app_client: httpx.AsyncClient, drain) -> None:  # noqa: ANN001
    from backend.config import get_settings

    get_settings().expensive_rate_limit_per_minute = 2
    codes = []
    for _ in range(3):
        codes.append((await app_client.post("/api/simulate-attack", json={})).status_code)
    await drain()
    assert codes == [202, 202, 429]
    r = await app_client.post("/api/simulate-attack", json={})
    assert r.headers["retry-after"]


# -------------------------------------------------------- input validation


@pytest.mark.parametrize(
    "body",
    [
        {"raw_text": "too short"},
        {"raw_text": " " * 100},
        {"raw_text": INTEL, "unexpected": "field"},
        {"raw_text": INTEL, "source": "not-a-source"},
        {"raw_text": "x" * 50_001},
    ],
)
async def test_ingest_validation(app_client: httpx.AsyncClient, body: dict) -> None:
    r = await app_client.post("/api/threats/ingest", json=body)
    assert r.status_code == 422


async def test_stack_update_validation(app_client: httpx.AsyncClient) -> None:
    company = (await app_client.get("/api/companies")).json()[0]
    r = await app_client.put(f"/api/companies/{company['id']}/stack", json={"tech_stack": [{"key": "Bad Key!", "label": "x"}]})
    assert r.status_code == 422
    r = await app_client.put(f"/api/companies/{company['id']}/stack", json={"tech_stack": [{"key": "nginx", "label": "ok\x07"}]})
    assert r.status_code == 422


# ---------------------------------------------------- ingestion & dedup


async def test_ingest_deduplicates_normalised_content(app_client: httpx.AsyncClient, drain) -> None:  # noqa: ANN001
    first = await app_client.post("/api/threats/ingest", json={"raw_text": INTEL, "analyze": False})
    second = await app_client.post("/api/threats/ingest", json={"raw_text": "  " + INTEL.upper().replace("\n", "\n\n"), "analyze": False})
    assert first.json()["duplicate"] is False
    assert second.json() == {**first.json(), "duplicate": True}
    listing = (await app_client.get("/api/threats")).json()
    assert listing["total"] == 1


async def test_ingest_without_analysis_stays_pending(app_client: httpx.AsyncClient, fake_anthropic: FakeAnthropic) -> None:
    r = await app_client.post("/api/threats/ingest", json={"raw_text": INTEL, "analyze": False})
    assert r.json()["status"] == "pending"
    assert fake_anthropic.requests == []


async def test_unknown_company_404(app_client: httpx.AsyncClient) -> None:
    r = await app_client.post("/api/threats/ingest", json={"raw_text": INTEL, "company_id": "00000000-0000-0000-0000-000000000000"})
    assert r.status_code == 404


# ------------------------------------------------------- analysis flow


async def test_ingest_triggers_full_analysis_and_persists(app_client: httpx.AsyncClient, drain, fake_anthropic: FakeAnthropic) -> None:  # noqa: ANN001
    t = await _analysed_threat(app_client, drain)
    assert t["status"] == "analyzed", t["error"]
    assert t["current_stage"] is None
    assert t["severity_label"] == "critical" and t["final_severity"] == 10.0
    assert t["exposure"] == "direct" and t["live_exposure"] == "direct"
    assert {m["technique_id"] for m in t["mitre_techniques"]} == {"T1588.005", "T1190", "T1071.001"}
    assert any(i["value"] == "203.0.113.45" for i in t["indicators"])
    kinds = sorted(p["kind"] for p in t["patches"])
    assert kinds == ["aws_waf", "bash", "detection", "iptables"]
    bash = next(p for p in t["patches"] if p["kind"] == "bash")
    assert bash["validation"]["syntax_ok"] is True and bash["status"] == "proposed"
    assert t["analysis"]["triage"]["severity_score"] == 8.6
    assert len(fake_anthropic.requests) == 4  # triage, context x2 (tool round), remediation


async def test_reanalyze_replaces_patches_and_blocks_concurrent_runs(app_client: httpx.AsyncClient, drain) -> None:  # noqa: ANN001
    t = await _analysed_threat(app_client, drain)
    r = await app_client.post(f"/api/threats/{t['id']}/analyze")
    assert r.status_code == 202 and r.json()["status"] == "queued"
    again = await app_client.post(f"/api/threats/{t['id']}/analyze")
    assert again.status_code == 409
    await drain()
    detail = (await app_client.get(f"/api/threats/{t['id']}")).json()
    assert detail["status"] == "analyzed" and len(detail["patches"]) == 4


async def test_pipeline_failure_marks_threat_failed(app_client: httpx.AsyncClient, drain, fake_anthropic: FakeAnthropic) -> None:  # noqa: ANN001
    fake_anthropic.behaviour["context"] = "refusal"
    t = await _analysed_threat(app_client, drain)
    assert t["status"] == "failed"
    assert "[context]" in t["error"] and "declined" in t["error"]
    # A failed threat can be retried once the cause is fixed.
    fake_anthropic.behaviour.clear()
    assert (await app_client.post(f"/api/threats/{t['id']}/analyze")).status_code == 202
    await drain()
    assert (await app_client.get(f"/api/threats/{t['id']}")).json()["status"] == "analyzed"


async def test_missing_ai_key_gives_actionable_error(app_client: httpx.AsyncClient, drain) -> None:  # noqa: ANN001
    from backend import analysis_service

    analysis_service.set_pipeline(None)
    t = await _analysed_threat(app_client, drain)
    assert t["status"] == "failed" and "ANTHROPIC_API_KEY" in t["error"]


async def test_concurrent_claims_analyse_once(app_client: httpx.AsyncClient, drain, fake_anthropic: FakeAnthropic) -> None:  # noqa: ANN001
    import asyncio

    from backend.analysis_service import run_analysis

    r = await app_client.post("/api/threats/ingest", json={"raw_text": INTEL, "analyze": False})
    tid = r.json()["threat_id"]
    import uuid

    await asyncio.gather(*(run_analysis(uuid.UUID(tid)) for _ in range(4)))
    assert len([q for q in fake_anthropic.requests if "Agent 1" in q["system"][0]["text"]]) == 1


# -------------------------------------------------------------- simulator


async def test_scenarios_listed(app_client: httpx.AsyncClient) -> None:
    r = await app_client.get("/api/simulate-attack/scenarios")
    assert [s["id"] for s in r.json()] == [s.id for s in SCENARIOS]


@pytest.mark.parametrize("scenario_id", [s.id for s in SCENARIOS])
async def test_simulate_attack_runs_all_three_agents(app_client: httpx.AsyncClient, drain, fake_anthropic: FakeAnthropic, scenario_id: str) -> None:  # noqa: ANN001
    r = await app_client.post("/api/simulate-attack", json={"scenario_id": scenario_id})
    assert r.status_code == 202 and r.json()["status"] == "queued"
    await drain()
    t = (await app_client.get(f"/api/threats/{r.json()['threat_id']}")).json()
    assert t["status"] == "analyzed", t["error"]
    assert t["source"] == SCENARIOS_BY_ID[scenario_id].source.value
    agents = {req["system"][0]["text"].split(" of AegisPulse")[0][-7:] for req in fake_anthropic.requests}
    assert agents == {"Agent 1", "Agent 2", "Agent 3"}
    assert t["patches"] and t["mitre_techniques"] and t["indicators"]


async def test_simulate_same_scenario_twice_creates_two_events(app_client: httpx.AsyncClient, drain) -> None:  # noqa: ANN001
    a = await app_client.post("/api/simulate-attack", json={"scenario_id": "paste-pg-sqli-kit"})
    b = await app_client.post("/api/simulate-attack", json={"scenario_id": "paste-pg-sqli-kit"})
    await drain()
    assert a.json()["threat_id"] != b.json()["threat_id"]


async def test_unknown_scenario_404(app_client: httpx.AsyncClient) -> None:
    assert (await app_client.post("/api/simulate-attack", json={"scenario_id": "nope"})).status_code == 404


# ------------------------------------------------ live stack prioritisation


async def test_stack_toggle_reprioritises_without_model_calls(app_client: httpx.AsyncClient, drain, fake_anthropic: FakeAnthropic) -> None:  # noqa: ANN001
    t = await _analysed_threat(app_client, drain)
    calls_before = len(fake_anthropic.requests)
    company = (await app_client.get("/api/companies")).json()[0]
    r = await app_client.put(f"/api/companies/{company['id']}/stack", json={"tech_stack": [{"key": "windows_server", "label": "Windows Server"}]})
    assert r.status_code == 200
    item = (await app_client.get("/api/threats")).json()["items"][0]
    assert item["id"] == t["id"]
    assert item["live_exposure"] == "none" and item["priority_score"] == pytest.approx(5.6)
    await app_client.put(f"/api/companies/{company['id']}/stack", json={"tech_stack": [{"key": "nginx", "label": "Nginx"}]})
    item = (await app_client.get("/api/threats")).json()["items"][0]
    assert item["live_exposure"] == "direct" and item["matched_components"] == ["nginx"]
    assert len(fake_anthropic.requests) == calls_before


# ------------------------------------------------------ patches & alerts


async def test_patch_approval_workflow(app_client: httpx.AsyncClient, drain) -> None:  # noqa: ANN001
    t = await _analysed_threat(app_client, drain)
    patch = next(p for p in t["patches"] if p["kind"] == "bash")
    sim = await app_client.post(f"/api/patches/{patch['id']}/simulate")
    body = sim.json()
    assert sim.status_code == 200 and body["executed"] is False and body["syntax_ok"] is True
    assert any("no command is executed" in line for line in body["transcript"])
    assert any("iptables" in a for a in body["planned_actions"])

    ok = await app_client.post(f"/api/patches/{patch['id']}/approve", json={"reviewer": "alice"})
    assert ok.status_code == 200 and ok.json()["status"] == "approved" and ok.json()["reviewed_by"] == "alice"
    assert (await app_client.post(f"/api/patches/{patch['id']}/approve", json={})).status_code == 409
    assert (await app_client.get(f"/api/threats/{t['id']}")).json()["status"] == "mitigated"
    tel = (await app_client.get("/api/telemetry")).json()
    assert tel["threats_mitigated"] == 1 and tel["total_threats"] == 1 and tel["mttr_seconds"] is not None


async def test_reject_patch(app_client: httpx.AsyncClient, drain) -> None:  # noqa: ANN001
    t = await _analysed_threat(app_client, drain)
    waf = next(p for p in t["patches"] if p["kind"] == "aws_waf")
    r = await app_client.post(f"/api/patches/{waf['id']}/reject", json={"reviewer": "bob"})
    assert r.json()["status"] == "rejected"
    sim = (await app_client.post(f"/api/patches/{waf['id']}/simulate")).json()
    assert sim["syntax_ok"] is True


async def test_alert_preview_and_dispatch_without_channels(app_client: httpx.AsyncClient, drain) -> None:  # noqa: ANN001
    t = await _analysed_threat(app_client, drain)
    preview = (await app_client.get(f"/api/threats/{t['id']}/alert-preview", params={"channel": "whatsapp"})).json()
    assert preview["configured"] is False and len(preview["payload"]["Body"]) <= 1600
    assert "[CRITICAL]" in preview["executive_summary"]
    logs = (await app_client.post(f"/api/threats/{t['id']}/dispatch", json={"channels": ["slack", "whatsapp"]})).json()
    assert [(log["channel"], log["status"]) for log in logs] == [("slack", "skipped"), ("whatsapp", "skipped")]
    assert len((await app_client.get("/api/alerts")).json()) == 2


async def test_auto_dispatch_on_critical_when_webhook_configured(app_client: httpx.AsyncClient, drain, monkeypatch) -> None:  # noqa: ANN001
    from backend import analysis_service
    from backend.config import get_settings

    sent: list = []

    async def fake_dispatch(event, patches, channels, settings, *, trigger="manual", client=None):  # noqa: ANN001, ANN202
        from backend.models import AlertLog, AlertStatus

        sent.append((trigger, channels))
        return [AlertLog(threat_id=event.id, channel=c, status=AlertStatus.SENT, trigger=trigger) for c in channels]

    get_settings().generic_webhook_url = "https://soar.example.com/hook"
    monkeypatch.setattr(analysis_service, "dispatch_alerts", fake_dispatch)
    t = await _analysed_threat(app_client, drain)
    assert sent and sent[0][0] == "auto"
    assert [a["status"] for a in t["alerts"]] == ["sent"]


async def test_dismiss(app_client: httpx.AsyncClient, drain) -> None:  # noqa: ANN001
    t = await _analysed_threat(app_client, drain)
    r = await app_client.post(f"/api/threats/{t['id']}/dismiss")
    assert r.json()["status"] == "dismissed"


async def test_exports_require_analysis(app_client: httpx.AsyncClient) -> None:
    r = await app_client.post("/api/threats/ingest", json={"raw_text": INTEL, "analyze": False})
    tid = r.json()["threat_id"]
    assert (await app_client.get(f"/api/threats/{tid}/export/stix")).status_code == 409
    assert (await app_client.get(f"/api/threats/{tid}/export/cef")).status_code == 409


async def test_export_endpoints(app_client: httpx.AsyncClient, drain) -> None:  # noqa: ANN001
    t = await _analysed_threat(app_client, drain)
    stix = await app_client.get(f"/api/threats/{t['id']}/export/stix")
    assert stix.status_code == 200
    assert stix.headers["content-type"].startswith("application/stix+json")
    assert "attachment" in stix.headers["content-disposition"]
    assert stix.json()["type"] == "bundle"
    cef = await app_client.get(f"/api/threats/{t['id']}/export/cef")
    assert cef.status_code == 200 and cef.text.startswith("CEF:0|AegisPulse|")


async def test_list_filters(app_client: httpx.AsyncClient, drain) -> None:  # noqa: ANN001
    await _analysed_threat(app_client, drain)
    assert (await app_client.get("/api/threats", params={"min_severity": 9.5})).json()["total"] == 1
    assert (await app_client.get("/api/threats", params={"status": "pending"})).json()["total"] == 0
    assert (await app_client.get("/api/threats", params={"sort": "bogus"})).status_code == 422
