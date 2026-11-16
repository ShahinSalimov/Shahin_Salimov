"""ToolRegistry: maps tool names used in pipelines to adapter callables.

A tool is ``fn(payload: dict, ctx: ToolContext) -> dict | (dict, meta)``. Tools are plain code (no
LLM); they may mutate ``ctx.state`` (persisted by the runner) and report spend via ``meta["cost_usd"]``.
Raise ``NonRetryable`` for errors that a retry cannot fix.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable

ToolFn = Callable[[dict[str, Any], "ToolContext"], Any]


class NonRetryable(Exception):
    """Raised by a tool when retrying the same input is pointless (bad config, invalid input)."""


@dataclass
class ToolContext:
    org: str
    run_id: str
    step: str
    idempotency_key: str
    state: dict[str, Any]
    store: Any


class ToolRegistry:
    def __init__(self) -> None:
        self._tools: dict[str, ToolFn] = {}

    def register(self, name: str, fn: ToolFn) -> None:
        if name in self._tools:
            raise ValueError(f"tool {name!r} already registered")
        self._tools[name] = fn

    def __contains__(self, name: str) -> bool:
        return name in self._tools

    def names(self) -> set[str]:
        return set(self._tools)

    def call(self, name: str, payload: dict[str, Any], ctx: ToolContext) -> tuple[dict[str, Any], dict[str, Any]]:
        fn = self._tools[name]
        result = fn(payload, ctx)
        meta: dict[str, Any] = {}
        if isinstance(result, tuple):
            result, meta = result
        if not isinstance(result, dict):
            raise TypeError(f"tool {name!r} must return a dict, got {type(result).__name__}")
        result.setdefault("status", "ok")
        return result, {"tool": name, "cost_usd": 0.0, **meta}
