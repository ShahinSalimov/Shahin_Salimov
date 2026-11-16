"""Declarative Step and Pipeline definitions used by the runner to route outputs.

Agents never call each other: a step returns output, and ``Step.next(output, state)`` names the
next step (or ``None`` to finish). Payload builders decide what part of previous outputs the next
step receives (spec: 02-orchestration-architecture.md, 2.3-2.4).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable

Output = dict[str, Any]
State = dict[str, Any]
NextFn = Callable[[Output, State], "str | None"]
# builder(output_of_previous_step, run_state, outputs_of_run) -> list of payloads
PayloadBuilder = Callable[[Output, State, dict[str, Output]], list[dict[str, Any]]]


@dataclass(frozen=True)
class Step:
    next: NextFn
    agent: str | None = None
    tool: str | None = None
    mode: str | None = None
    fan_out: bool = False
    idempotent: bool = False

    def __post_init__(self) -> None:
        if (self.agent is None) == (self.tool is None):
            raise ValueError("Step needs exactly one of agent or tool")

    @property
    def is_agent(self) -> bool:
        return self.agent is not None

    @property
    def name(self) -> str:
        return self.agent or self.tool  # type: ignore[return-value]


class RunOutputs(dict):
    """Latest output per step (dict access) plus ``all(step)`` for every output of a fan-out step."""

    def __init__(self, latest: dict[str, Output], all_of: Callable[[str], list[Output]]):
        super().__init__(latest)
        self._all_of = all_of

    def all(self, step: str) -> list[Output]:
        return self._all_of(step)


def _passthrough(output: Output, state: State, outputs: dict[str, Output]) -> list[dict[str, Any]]:
    return [dict(output)]


@dataclass
class Pipeline:
    name: str
    start: str
    steps: dict[str, Step]
    payload_builders: dict[str, PayloadBuilder] = field(default_factory=dict)

    def __post_init__(self) -> None:
        if self.start not in self.steps:
            raise ValueError(f"start step {self.start!r} not in pipeline {self.name!r}")
        unknown = set(self.payload_builders) - set(self.steps)
        if unknown:
            raise ValueError(f"payload builders for unknown steps: {sorted(unknown)}")

    def route(self, step_name: str, output: Output, state: State) -> str | None:
        """Return the next step name (validated) or None when the run is finished."""
        nxt = self.steps[step_name].next(output, state)
        if nxt is not None and nxt not in self.steps:
            raise KeyError(f"{self.name}: step {step_name!r} routed to unknown step {nxt!r}")
        return nxt

    def build_payloads(self, step_name: str, output: Output, state: State,
                       outputs: dict[str, Output]) -> list[dict[str, Any]]:
        builder = self.payload_builders.get(step_name, _passthrough)
        payloads = builder(output, state, outputs)
        if not self.steps[step_name].fan_out and len(payloads) != 1:
            raise ValueError(f"{self.name}: non fan-out step {step_name!r} got {len(payloads)} payloads")
        return payloads
