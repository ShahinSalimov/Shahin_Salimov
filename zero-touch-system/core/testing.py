"""Test doubles shared by the test suite and scripts/dry_run.py. Never used in production paths."""
from __future__ import annotations

import json
from typing import Any, Callable

from core.llm import LLMResult


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
