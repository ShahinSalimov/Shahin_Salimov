"""Tests for core.llm.LLMClient (Anthropic SDK is faked; no network)."""
import pytest

from core.llm import (FALLBACK_BETA, LLMClient, LLMRefusal, LLMTruncated, PRICES_PER_MTOK,
                      estimate_cost)
from tests.conftest import FakeSDK, sdk_response


def _client(*responses, **kw):
    sdk = FakeSDK(list(responses))
    return LLMClient(client=sdk, **kw), sdk


def test_returns_text_and_usage_meta():
    llm, sdk = _client(sdk_response('{"a": 1}', input_tokens=2000, output_tokens=1000))
    res = llm.complete(model="claude-opus-5-5", system="SYS", messages=[{"role": "user", "content": "hi"}],
                       effort="high", tag="ceo")
    assert res.text == '{"a": 1}'
    assert res.input_tokens == 2000 and res.output_tokens == 1000
    assert res.stop_reason == "end_turn"
    assert res.request_id == "req_test"
    # opus 5.5: $4 in / $20 out per MTok
    assert res.cost_usd == pytest.approx(2000 * 4 / 1e6 + 1000 * 20 / 1e6)
    meta = res.meta()
    assert set(meta) >= {"model", "input_tokens", "output_tokens", "cost_usd", "latency_ms"}


def test_request_shape_uses_cached_system_and_effort():
    llm, sdk = _client(sdk_response())
    llm.complete(model="claude-opus-5-5", system="SYS", messages=[{"role": "user", "content": "x"}],
                 effort="high", max_tokens=8000)
    endpoint, kwargs = sdk.calls[0]
    assert kwargs["model"] == "claude-opus-5-5"
    assert kwargs["max_tokens"] == 8000
    assert kwargs["system"] == [{"type": "text", "text": "SYS", "cache_control": {"type": "ephemeral"}}]
    assert kwargs["output_config"] == {"effort": "high"}
    assert "thinking" not in kwargs        # opus 5.5: thinking cannot be disabled; omit it
    assert "temperature" not in kwargs     # sampling params are rejected on current models


def test_server_side_fallback_enabled_by_default_for_supported_models():
    llm, sdk = _client(sdk_response(), sdk_response(model="claude-sonnet-5-5"))
    llm.complete(model="claude-opus-5-5", system="S", messages=[{"role": "user", "content": "x"}])
    llm.complete(model="claude-sonnet-5-5", system="S", messages=[{"role": "user", "content": "x"}])
    for endpoint, kwargs in sdk.calls:
        assert endpoint == "beta.messages"
        assert kwargs["betas"] == [FALLBACK_BETA]
        assert kwargs["fallbacks"] == "default"


def test_fallback_not_sent_for_unsupported_model_or_when_disabled():
    llm, sdk = _client(sdk_response(model="claude-haiku-5-5"))
    llm.complete(model="claude-haiku-5-5", system="S", messages=[{"role": "user", "content": "x"}])
    assert sdk.calls[0][0] == "messages"
    assert "fallbacks" not in sdk.calls[0][1]

    llm2, sdk2 = _client(sdk_response(), fallbacks="off")
    llm2.complete(model="claude-opus-5-5", system="S", messages=[{"role": "user", "content": "x"}])
    assert sdk2.calls[0][0] == "messages"


def test_effort_omitted_when_none():
    llm, sdk = _client(sdk_response())
    llm.complete(model="claude-opus-5-5", system="S", messages=[{"role": "user", "content": "x"}])
    assert "output_config" not in sdk.calls[0][1]


def test_multiple_text_blocks_are_joined_and_thinking_ignored():
    resp = sdk_response("part1")
    resp.content.append(type(resp.content[0])(type="text", text="part2"))
    llm, _ = _client(resp)
    assert llm.complete(model="claude-opus-5-5", system="S",
                        messages=[{"role": "user", "content": "x"}]).text == "part1part2"


def test_refusal_raises_with_category():
    from types import SimpleNamespace
    details = SimpleNamespace(type="refusal", category="cyber", explanation="no")
    llm, _ = _client(sdk_response(None, stop_reason="refusal", stop_details=details))
    with pytest.raises(LLMRefusal) as exc:
        llm.complete(model="claude-opus-5-5", system="S", messages=[{"role": "user", "content": "x"}])
    assert exc.value.category == "cyber"
    assert exc.value.cost_usd > 0  # declined requests can still be billed; budget must see it


def test_max_tokens_raises_truncated():
    llm, _ = _client(sdk_response('{"a":', stop_reason="max_tokens"))
    with pytest.raises(LLMTruncated):
        llm.complete(model="claude-opus-5-5", system="S", messages=[{"role": "user", "content": "x"}])


def test_cost_uses_served_model_after_fallback():
    llm, _ = _client(sdk_response(model="claude-opus-5", input_tokens=1_000_000, output_tokens=0))
    res = llm.complete(model="claude-opus-5-5", system="S", messages=[{"role": "user", "content": "x"}])
    assert res.model == "claude-opus-5"
    assert res.cost_usd == pytest.approx(5.0)


def test_estimate_cost_includes_cache_tokens():
    cost = estimate_cost("claude-sonnet-5-5", input_tokens=1_000_000, output_tokens=1_000_000,
                         cache_creation_input_tokens=1_000_000, cache_read_input_tokens=1_000_000)
    # in 2 + out 10 + cache write 2*1.25 + cache read 0.10
    assert cost == pytest.approx(2 + 10 + 2.5 + 0.10)


def test_unknown_model_is_priced_conservatively():
    most_expensive_out = max(p[1] for p in PRICES_PER_MTOK.values())
    cost = estimate_cost("claude-unknown-9", input_tokens=0, output_tokens=1_000_000)
    assert cost == pytest.approx(most_expensive_out)


def test_price_overrides():
    cost = estimate_cost("my-model", input_tokens=1_000_000, output_tokens=0,
                         prices={"my-model": (1.0, 2.0, 0.1)})
    assert cost == pytest.approx(1.0)
