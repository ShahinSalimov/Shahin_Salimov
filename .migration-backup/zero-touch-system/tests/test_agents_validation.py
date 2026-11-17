"""Tests for JSON validation and corrective retries in core.agents."""
import json

import pytest

from core.agents import AgentOutputError, AgentRegistry, extract_json
from core.llm import LLMRefusal
from core.prompts import PromptLoader
from orgs.studio import schemas as studio_schemas
from tests.conftest import FakeLLM, load_fixture

ROUTING = {"ceo": ("heavy-model", "high"), "research": ("light-model", "medium"),
           "content": ("light-model", "medium"), "philosopher": ("heavy-model", "high"),
           "banker": ("light-model", "medium")}


def _registry(llm, prompts_dir, **kw):
    return AgentRegistry(org="studio", llm=llm, prompts=PromptLoader(prompts_dir),
                         schemas=studio_schemas.SCHEMAS, routing=ROUTING, **kw)


def test_valid_json_passes(prompts_dir):
    good = load_fixture("studio", "ceo.plan")
    llm = FakeLLM({"ceo": [good]})
    res = _registry(llm, prompts_dir).call("ceo", "plan", {"date": "2026-11-16"}, {"market_language": "en"})
    assert res.output == good
    assert res.meta["attempts"] == 1
    assert res.meta["prompt_version"] == "1.0.0"
    assert res.meta["model"] == "heavy-model"
    call = llm.calls[0]
    assert call["model"] == "heavy-model" and call["effort"] == "high" and call["tag"] == "ceo"
    assert "ROLE: You are the CEO" in call["system"]
    sent = json.loads(call["messages"][0]["content"])
    assert sent["payload"] == {"date": "2026-11-16", "mode": "plan"}
    assert sent["context"] == {"market_language": "en"}


def test_json_in_code_fences_accepted(prompts_dir):
    good = load_fixture("studio", "research")
    llm = FakeLLM({"research": ["```json\n" + json.dumps(good) + "\n```"]})
    assert _registry(llm, prompts_dir).call("research", None, {}, {}).output == good


def test_prose_around_json_accepted(prompts_dir):
    good = load_fixture("studio", "research")
    llm = FakeLLM({"research": ["Here you go:\n" + json.dumps(good) + "\nThanks"]})
    assert _registry(llm, prompts_dir).call("research", None, {}, {}).output == good


def test_invalid_json_triggers_corrective_retry(prompts_dir):
    good = load_fixture("studio", "ceo.plan")
    llm = FakeLLM({"ceo": ["not json at all", good]})
    res = _registry(llm, prompts_dir).call("ceo", "plan", {}, {})
    assert res.output == good
    assert res.meta["attempts"] == 2
    assert res.meta["cost_usd"] == pytest.approx(0.02)  # both attempts are billed
    retry_msg = llm.calls[1]["messages"]
    assert len(retry_msg) == 1  # single-turn: no edited assistant history is replayed
    assert "failed validation" in retry_msg[0]["content"]
    assert "not json at all" in retry_msg[0]["content"]


def test_schema_violation_triggers_retry_with_error_text(prompts_dir):
    bad = load_fixture("studio", "ceo.plan")
    del bad["portfolio_notes"]
    bad["surprise"] = 1
    good = load_fixture("studio", "ceo.plan")
    llm = FakeLLM({"ceo": [bad, good]})
    res = _registry(llm, prompts_dir).call("ceo", "plan", {}, {})
    assert res.meta["attempts"] == 2
    assert "surprise" in llm.calls[1]["messages"][0]["content"]


def test_three_invalid_outputs_raise(prompts_dir):
    llm = FakeLLM({"ceo": ["x", "y", "z"]})
    with pytest.raises(AgentOutputError) as exc:
        _registry(llm, prompts_dir).call("ceo", "plan", {}, {})
    assert len(llm.calls) == 3
    assert exc.value.meta["cost_usd"] == pytest.approx(0.03)


def test_max_attempts_configurable(prompts_dir):
    llm = FakeLLM({"ceo": ["x"]})
    with pytest.raises(AgentOutputError):
        _registry(llm, prompts_dir, max_attempts=1).call("ceo", "plan", {}, {})
    assert len(llm.calls) == 1


def test_extra_keys_rejected(prompts_dir):
    bad = dict(load_fixture("studio", "banker.pricing"), extra_key=True)
    llm = FakeLLM({"banker": [bad, bad, bad]})
    with pytest.raises(AgentOutputError):
        _registry(llm, prompts_dir).call("banker", "pricing", {}, {})


def test_json_array_is_rejected(prompts_dir):
    good = load_fixture("studio", "ceo.plan")
    llm = FakeLLM({"ceo": ["[1, 2]", good]})
    assert _registry(llm, prompts_dir).call("ceo", "plan", {}, {}).meta["attempts"] == 2


def test_unknown_agent_or_mode_raises_before_calling_llm(prompts_dir):
    llm = FakeLLM({})
    reg = _registry(llm, prompts_dir)
    with pytest.raises(KeyError):
        reg.call("ceo", "dance", {}, {})
    with pytest.raises(KeyError):
        reg.call("trend_scout", None, {}, {})
    assert llm.calls == []


def test_refusal_propagates_without_retry(prompts_dir):
    llm = FakeLLM({"ceo": [LLMRefusal("declined", category="cyber", cost_usd=0.01)]})
    with pytest.raises(LLMRefusal):
        _registry(llm, prompts_dir).call("ceo", "plan", {}, {})
    assert len(llm.calls) == 1


def test_non_ok_status_with_minimal_fields_is_valid(prompts_dir):
    out = {"status": "needs_input", "errors": ["raw_signals empty"], "confidence": 0.0}
    llm = FakeLLM({"research": [out]})
    assert _registry(llm, prompts_dir).call("research", None, {}, {}).output["status"] == "needs_input"


def test_user_message_is_deterministic(prompts_dir):
    """Same input must produce byte-identical requests (prompt-cache friendly, replayable)."""
    good = load_fixture("studio", "ceo.plan")
    llm = FakeLLM({"ceo": [good, good]})
    reg = _registry(llm, prompts_dir)
    reg.call("ceo", "plan", {"b": 1, "a": 2}, {"y": 1, "x": 2})
    reg.call("ceo", "plan", {"a": 2, "b": 1}, {"x": 2, "y": 1})
    assert llm.calls[0]["messages"] == llm.calls[1]["messages"]
    assert llm.calls[0]["system"] == llm.calls[1]["system"]


@pytest.mark.parametrize("raw,expected", [
    ('{"a": 1}', {"a": 1}),
    ('```json\n{"a": 1}\n```', {"a": 1}),
    ('```\n{"a": 1}\n```', {"a": 1}),
    ('text {"a": {"b": 2}} more', {"a": {"b": 2}}),
])
def test_extract_json(raw, expected):
    assert extract_json(raw) == expected


def test_extract_json_errors():
    with pytest.raises(ValueError):
        extract_json("nothing here")
    with pytest.raises(ValueError):
        extract_json("[1,2]")
