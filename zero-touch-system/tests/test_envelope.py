"""Tests for core.envelope."""
import json

import pytest
from pydantic import ValidationError

from core.envelope import Envelope, new_envelope


def test_new_envelope_fills_defaults():
    env = new_envelope("studio", "studio-run1", step="ceo.plan", from_agent="scheduler",
                       payload={"mode": "plan"})
    assert env.envelope_version == "1.0"
    assert env.org == "studio"
    assert env.attempt == 1
    assert env.idempotency_key == "studio-run1:ceo.plan:0"
    assert env.created_at.endswith("Z")
    assert env.context == {}
    assert env.meta == {}
    assert len(env.message_id) == 26  # ULID


def test_message_ids_are_unique():
    a = new_envelope("studio", "r", step="s", from_agent="x", payload={})
    b = new_envelope("studio", "r", step="s", from_agent="x", payload={})
    assert a.message_id != b.message_id


def test_index_goes_into_idempotency_key():
    env = new_envelope("youtube", "r9", step="content.section", from_agent="ceo",
                       payload={}, index=3)
    assert env.idempotency_key == "r9:content.section:3"


def test_unknown_org_rejected():
    with pytest.raises(ValidationError):
        new_envelope("marketing", "r", step="s", from_agent="x", payload={})


def test_extra_fields_rejected():
    env = new_envelope("studio", "r", step="s", from_agent="x", payload={})
    data = env.model_dump()
    data["surprise"] = 1
    with pytest.raises(ValidationError):
        Envelope.model_validate(data)


def test_json_roundtrip():
    env = new_envelope("studio", "r", step="s", from_agent="x",
                       payload={"name": "Şablon"}, context={"market_language": "az"})
    again = Envelope.from_json(env.to_json())
    assert again == env
    assert "Şablon" in env.to_json()  # not ascii-escaped
    json.loads(env.to_json())


def test_with_attempt_returns_copy():
    env = new_envelope("studio", "r", step="s", from_agent="x", payload={})
    nxt = env.with_attempt(2)
    assert nxt.attempt == 2 and env.attempt == 1
    assert nxt.message_id == env.message_id
