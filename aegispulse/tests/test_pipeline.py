"""Multi-agent pipeline: request shape, schema validation, grounding, failures."""

from __future__ import annotations

import pytest

from agents import (
    AgentOutputError,
    AgentRefusalError,
    CompanyStackProfile,
    PipelineConfig,
    PipelineResult,
    StackComponent,
    ThreatPipeline,
)
from agents.threat_pipeline import FALLBACK_BETA
from backend.simulator import SCENARIOS_BY_ID
from tests.fakes import HALLUCINATED_IP, FakeAnthropic

COMPANY = CompanyStackProfile(
    name="Acme",
    industry="Fintech",
    tech_stack=[
        StackComponent(key="nginx", label="Nginx 1.24", version="1.24"),
        StackComponent(key="ubuntu", label="Ubuntu 22.04"),
        StackComponent(key="aws", label="AWS"),
    ],
)
NGINX_INTEL = SCENARIOS_BY_ID["darkweb-nginx-0day"].payload


async def test_full_pipeline_produces_schema_valid_grounded_result(pipeline: ThreatPipeline, fake_anthropic: FakeAnthropic) -> None:
    stages_seen: list[str] = []

    async def on_stage(stage: str) -> None:
        stages_seen.append(stage)

    result = await pipeline.run(NGINX_INTEL, COMPANY, source="darkweb", on_stage=on_stage)

    # Round-trips through the public schema (what the DB and SIEM export consume).
    assert PipelineResult.model_validate(result.model_dump(mode="json")) == result
    assert stages_seen == ["sanitize", "triage", "context", "remediation", "postprocess"]
    assert [s.stage for s in result.stages] == ["sanitize", "triage", "context", "remediation", "postprocess"]

    # Grounding: hallucinated IoC dropped, real ones kept.
    assert HALLUCINATED_IP in {d.value for d in result.dropped_indicators}
    assert HALLUCINATED_IP not in {i.value for i in result.indicators}
    assert "203.0.113.45" in {i.value for i in result.indicators}

    # MITRE grounding: unknown technique dropped, wrong tactic corrected, names authoritative, kill-chain order.
    assert result.context is not None
    ids = [m.technique_id for m in result.context.mitre_mappings]
    assert "T9999" not in ids
    t1190 = next(m for m in result.context.mitre_mappings if m.technique_id == "T1190")
    assert (t1190.tactic_id, t1190.tactic, t1190.technique_name) == ("TA0001", "Initial Access", "Exploit Public-Facing Application")
    assert ids == ["T1588.005", "T1190", "T1071.001"]
    assert any("T9999" in n for n in result.mitre_validation_notes)

    # Stack impacts limited to real components, labels from the profile.
    assert [i.component_key for i in result.context.stack_impacts] == ["nginx"]
    assert result.context.stack_impacts[0].component_label == "Nginx 1.24"

    # Remediation present and statically validated.
    assert result.remediation is not None
    assert result.remediation.patch_scripts[0].script.startswith("#!/usr/bin/env bash")
    targets = {v.target: v for v in result.script_validations}
    assert targets["patch_script:contain_nginx_0day.sh"].syntax_ok
    assert targets["firewall_rule:0"].syntax_ok and targets["firewall_rule:1"].syntax_ok

    # Severity: 8.6 base + 1.5 for direct exposure.
    assert result.exposure == "direct"
    assert result.final_severity == 10.0
    assert result.severity_label == "critical"
    assert result.stages[2].tool_calls == 3


async def test_request_shape_uses_structured_outputs_fallbacks_and_envelope(pipeline: ThreatPipeline, fake_anthropic: FakeAnthropic) -> None:
    await pipeline.run(NGINX_INTEL, COMPANY, source="darkweb")
    first = fake_anthropic.requests[0]
    assert first["model"] == "claude-opus-5-5"
    assert first["output_config"]["format"]["type"] == "json_schema"
    assert first["output_config"]["format"]["schema"]["additionalProperties"] is False
    assert first["output_config"]["effort"] == "medium"
    assert first["fallbacks"] == "default"
    assert FALLBACK_BETA in fake_anthropic.headers[0]["anthropic-beta"]
    assert first["system"][0]["cache_control"] == {"type": "ephemeral"}
    assert "thinking" not in first and "temperature" not in first
    user = first["messages"][0]["content"]
    assert '<untrusted_threat_intel nonce="' in user and 'source="darkweb"' in user

    context_calls = [r for r in fake_anthropic.requests if "Agent 2" in r["system"][0]["text"]]
    assert len(context_calls) == 2
    assert all(t["strict"] is True for t in context_calls[0]["tools"])
    # The second call must echo the assistant turn (incl. thinking signature) and all tool results in one message.
    follow_up = context_calls[1]["messages"]
    assert follow_up[1]["role"] == "assistant"
    assert follow_up[1]["content"][0] == {"type": "thinking", "thinking": "", "signature": "sig-ctx-1"}
    results = follow_up[2]["content"]
    assert [r["tool_use_id"] for r in results] == ["toolu_1", "toolu_2", "toolu_3"]
    assert '"status": "not_found"' in results[1]["content"]  # T9999 rejected by the lookup tool
    assert '"exposure": "direct"' in results[2]["content"]


async def test_noise_short_circuits_without_calling_agents_2_and_3(fake_anthropic: FakeAnthropic) -> None:
    fake_anthropic.behaviour["triage"] = "noise"
    pipe = ThreatPipeline(client=fake_anthropic.client())
    result = await pipe.run("Cheap VPN accounts for sale, best prices, DM me on forum", COMPANY)
    assert result.short_circuited
    assert result.context is None and result.remediation is None
    assert len(fake_anthropic.requests) == 1
    assert result.exposure == "none"


async def test_refusal_raises_typed_error(fake_anthropic: FakeAnthropic) -> None:
    fake_anthropic.behaviour["remediation"] = "refusal"
    pipe = ThreatPipeline(client=fake_anthropic.client())
    with pytest.raises(AgentRefusalError) as exc:
        await pipe.run(NGINX_INTEL, COMPANY)
    assert exc.value.stage == "remediation" and exc.value.category == "cyber"


async def test_truncated_output_raises(fake_anthropic: FakeAnthropic) -> None:
    fake_anthropic.behaviour["triage"] = "max_tokens"
    pipe = ThreatPipeline(client=fake_anthropic.client())
    with pytest.raises(AgentOutputError, match="max_tokens"):
        await pipe.run(NGINX_INTEL, COMPANY)


async def test_schema_violation_is_repaired_once(fake_anthropic: FakeAnthropic) -> None:
    fake_anthropic.behaviour["triage"] = "invalid_json_once"
    pipe = ThreatPipeline(client=fake_anthropic.client())
    result = await pipe.run(NGINX_INTEL, COMPANY)
    assert result.triage.title
    triage_calls = [r for r in fake_anthropic.requests if "Agent 1" in r["system"][0]["text"]]
    assert len(triage_calls) == 2
    assert "did not validate" in triage_calls[1]["messages"][-1]["content"]


async def test_schema_violation_without_repair_budget_fails(fake_anthropic: FakeAnthropic) -> None:
    fake_anthropic.behaviour["triage"] = "invalid_json_once"
    pipe = ThreatPipeline(client=fake_anthropic.client(), config=PipelineConfig(validation_repair_attempts=0))
    with pytest.raises(AgentOutputError, match="schema validation"):
        await pipe.run(NGINX_INTEL, COMPANY)


async def test_prompt_injection_is_flagged_and_forces_review(pipeline: ThreatPipeline) -> None:
    intel = SCENARIOS_BY_ID["telegram-aws-iam-dump"].payload
    result = await pipeline.run(intel, COMPANY, source="telegram")
    assert "override_instructions" in result.sanitization.injection_signals
    assert "fake_role_marker" in result.sanitization.injection_signals
    assert result.triage.injection_attempt_detected
    assert result.requires_human_review
    # The injection asked for severity 0; the analysis did not comply.
    assert result.final_severity >= 7.0


async def test_empty_input_rejected(pipeline: ThreatPipeline) -> None:
    from agents import PipelineError

    with pytest.raises(PipelineError, match="empty"):
        await pipeline.run("​​\x00", COMPANY)


async def test_severity_is_clamped() -> None:
    from agents.schemas import TriageResult

    triage = TriageResult.model_validate(
        {"is_actionable": True, "noise_reason": "", "title": "t", "summary": "s", "threat_category": "other",
         "severity_score": 14.2, "severity_rationale": "r", "cvss_vector": None, "indicators": [],
         "affected_technologies": [], "injection_attempt_detected": False}
    )
    assert triage.severity_score == 10.0
