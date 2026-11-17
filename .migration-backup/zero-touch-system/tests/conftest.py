"""Shared fixtures: FakeLLM, fake Anthropic SDK client, temporary database."""
from __future__ import annotations

import json
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import pytest


ROOT = Path(__file__).resolve().parents[1]
FIXTURES = Path(__file__).resolve().parent / "fixtures"


def load_fixture(org: str, name: str) -> dict[str, Any]:
    return json.loads((FIXTURES / org / f"{name}.json").read_text())


# --- fake Anthropic SDK (for core.llm tests) --------------------------------------

def sdk_response(text: str = '{"ok": true}', *, stop_reason: str = "end_turn",
                 model: str = "claude-opus-5-5", input_tokens: int = 1000,
                 output_tokens: int = 500, cache_creation: int = 0, cache_read: int = 0,
                 stop_details: Any = None, with_thinking: bool = True) -> SimpleNamespace:
    content = []
    if with_thinking:
        content.append(SimpleNamespace(type="thinking", thinking=""))
    if text is not None:
        content.append(SimpleNamespace(type="text", text=text))
    return SimpleNamespace(
        content=content, stop_reason=stop_reason, stop_details=stop_details, model=model,
        usage=SimpleNamespace(input_tokens=input_tokens, output_tokens=output_tokens,
                              cache_creation_input_tokens=cache_creation,
                              cache_read_input_tokens=cache_read),
        _request_id="req_test",
    )


class _Endpoint:
    def __init__(self, parent: "FakeSDK", name: str):
        self.parent, self.name = parent, name

    def create(self, **kwargs):
        self.parent.calls.append((self.name, kwargs))
        return self.parent.responses.pop(0)


class FakeSDK:
    """Mimics anthropic.Anthropic: .messages.create and .beta.messages.create."""

    def __init__(self, responses: list[SimpleNamespace]):
        self.responses = list(responses)
        self.calls: list[tuple[str, dict]] = []
        self.messages = _Endpoint(self, "messages")
        self.beta = SimpleNamespace(messages=_Endpoint(self, "beta.messages"))


from core.testing import FakeLLM  # noqa: E402,F401  (re-exported for tests)


@pytest.fixture
def fake_sdk_factory():
    return FakeSDK


@pytest.fixture
def prompts_dir() -> Path:
    return ROOT / "prompts"
