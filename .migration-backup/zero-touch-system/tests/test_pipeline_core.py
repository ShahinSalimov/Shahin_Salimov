"""Tests for core.pipeline (Step / Pipeline definitions)."""
import pytest

from core.pipeline import Pipeline, Step


def _end(output, state):
    return None


def test_step_requires_exactly_one_of_agent_or_tool():
    with pytest.raises(ValueError):
        Step(next=_end)
    with pytest.raises(ValueError):
        Step(agent="ceo", tool="whatsapp_send", next=_end)
    assert Step(agent="ceo", mode="plan", next=_end).is_agent
    assert not Step(tool="whatsapp_send", next=_end).is_agent


def test_pipeline_start_must_exist():
    with pytest.raises(ValueError):
        Pipeline(name="p", start="missing", steps={"a": Step(agent="x", next=_end)})


def test_pipeline_route_follows_next():
    p = Pipeline(name="p", start="a", steps={
        "a": Step(agent="x", next=lambda o, s: "b" if o["ok"] else None),
        "b": Step(tool="t", next=_end),
    })
    assert p.route("a", {"ok": True}, {}) == "b"
    assert p.route("a", {"ok": False}, {}) is None
    assert p.route("b", {}, {}) is None


def test_pipeline_route_rejects_unknown_target():
    p = Pipeline(name="p", start="a", steps={"a": Step(agent="x", next=lambda o, s: "zzz")})
    with pytest.raises(KeyError):
        p.route("a", {}, {})


def test_route_can_mutate_state():
    def nxt(o, s):
        s["revision_round"] = s.get("revision_round", 0) + 1
        return None
    p = Pipeline(name="p", start="a", steps={"a": Step(agent="x", next=nxt)})
    state = {}
    p.route("a", {}, state)
    assert state == {"revision_round": 1}


def test_payload_builder_default_passes_output_through():
    p = Pipeline(name="p", start="a", steps={
        "a": Step(agent="x", next=lambda o, s: "b"),
        "b": Step(agent="y", next=_end),
    })
    assert p.build_payloads("b", {"k": 1}, {}, {}) == [{"k": 1}]


def test_payload_builder_custom_and_fan_out():
    p = Pipeline(
        name="p", start="a",
        steps={"a": Step(agent="x", next=lambda o, s: "b"),
               "b": Step(agent="y", fan_out=True, next=_end)},
        payload_builders={"b": lambda out, state, outs: [{"i": i} for i in range(out["n"])]},
    )
    assert p.build_payloads("b", {"n": 3}, {}, {}) == [{"i": 0}, {"i": 1}, {"i": 2}]


def test_non_fan_out_builder_must_return_one_payload():
    p = Pipeline(
        name="p", start="a",
        steps={"a": Step(agent="x", next=lambda o, s: "b"), "b": Step(agent="y", next=_end)},
        payload_builders={"b": lambda out, state, outs: [{}, {}]},
    )
    with pytest.raises(ValueError):
        p.build_payloads("b", {}, {}, {})
