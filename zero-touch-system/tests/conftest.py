"""Shared fixtures: FakeLLM, fake Anthropic SDK client, temporary database."""
from __future__ import annotations

import json
from pathlib import Path
from types import SimpleNamespace
from typing import Any, Callable

import pytest

from core.llm import LLMResult

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


# --- FakeLLM (for agent tests) ------------------------------------------------------

class FakeLLM:
    """Scripted stand-in for core.llm.LLMClient.

    ``script`` maps an agent tag to a list of responses (str, dict or Exception) consumed in
    order, or to a callable(system, messages) -> str.
    """

    def __init__(self, script: dict[str, list[Any] | Callable[..., str]], cost_per_call: float = 0.01):
        self.script = {k: (v if callable(v) else list(v)) for k, v in script.items()}
        self.cost_per_call = cost_per_call
        self.calls: list[dict[str, Any]] = []

    def complete(self, *, model: str, system: str, messages: list[dict], max_tokens: int = 16000,
                 effort: str | None = None, tag: str | None = None) -> LLMResult:
        self.calls.append({"model": model, "system": system, "messages": messages,
                           "effort": effort, "tag": tag})
        entry = self.script[tag]
        if callable(entry):
            item = entry(system, messages)
        else:
            if not entry:
                raise AssertionError(f"FakeLLM: no scripted response left for {tag!r}")
            item = entry.pop(0)
        if isinstance(item, Exception):
            raise item
        text = item if isinstance(item, str) else json.dumps(item)
        return LLMResult(text=text, model=model, stop_reason="end_turn", input_tokens=100,
                         output_tokens=50, cache_creation_input_tokens=0, cache_read_input_tokens=0,
                         cost_usd=self.cost_per_call, latency_ms=1, request_id="req_fake")


@pytest.fixture
def fake_sdk_factory():
    return FakeSDK


@pytest.fixture
def prompts_dir() -> Path:
    return ROOT / "prompts"
