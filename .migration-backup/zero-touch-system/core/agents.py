"""AgentRegistry: builds prompts, calls the LLM and validates JSON output against Pydantic schemas.

Each call is single-turn. When the output is not valid JSON or fails the schema, the agent is asked
again with its previous output and the validation error in a new single user message (previous
assistant turns are never replayed, so no thinking history is edited). After ``max_attempts``
invalid outputs AgentOutputError is raised. LLM refusals and transport errors propagate unchanged;
the runner decides about retries.
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any

from pydantic import BaseModel, ValidationError

from core.llm import LLMError
from core.prompts import PromptLoader

MAX_ERROR_CHARS = 2000
MAX_ECHO_CHARS = 6000


class AgentOutputError(Exception):
    def __init__(self, message: str, meta: dict[str, Any]):
        super().__init__(message)
        self.meta = meta


@dataclass
class AgentResult:
    output: dict[str, Any]
    meta: dict[str, Any] = field(default_factory=dict)


def extract_json(text: str) -> dict[str, Any]:
    """Parse a JSON object from model text: plain, fenced, or surrounded by stray prose."""
    t = text.strip()
    if t.startswith("```"):
        t = t.split("\n", 1)[1] if "\n" in t else ""
        t = t.rsplit("```", 1)[0].strip()
    try:
        data = json.loads(t)
    except json.JSONDecodeError:
        start, end = t.find("{"), t.rfind("}")
        if start == -1 or end <= start:
            raise ValueError("no JSON object found in output") from None
        try:
            data = json.loads(t[start:end + 1])
        except json.JSONDecodeError as e:
            raise ValueError(f"invalid JSON: {e}") from None
    if not isinstance(data, dict):
        raise ValueError(f"expected a JSON object, got {type(data).__name__}")
    return data


def _canonical(obj: Any) -> str:
    return json.dumps(obj, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


class AgentRegistry:
    def __init__(self, *, org: str, llm: Any, prompts: PromptLoader,
                 schemas: dict[tuple[str, str | None], type[BaseModel]],
                 routing: dict[str, tuple[str, str | None]],
                 max_attempts: int = 3, max_tokens: int = 16000):
        self.org, self.llm, self.prompts = org, llm, prompts
        self.schemas, self.routing = schemas, routing
        self.max_attempts, self.max_tokens = max_attempts, max_tokens

    def call(self, agent: str, mode: str | None, payload: dict[str, Any],
             context: dict[str, Any]) -> AgentResult:
        schema = self.schemas[(agent, mode)]          # KeyError before any spend
        model, effort = self.routing[agent]
        system, version = self.prompts.system_for(self.org, agent)
        body = dict(payload)
        if mode is not None:
            body["mode"] = mode
        request = _canonical({"context": context, "payload": body})

        meta: dict[str, Any] = {"agent": agent, "mode": mode, "model": model, "prompt_version": version,
                                "attempts": 0, "cost_usd": 0.0, "input_tokens": 0, "output_tokens": 0,
                                "latency_ms": 0}
        content = request
        last_error = ""
        for attempt in range(1, self.max_attempts + 1):
            meta["attempts"] = attempt
            try:
                res = self.llm.complete(model=model, system=system,
                                        messages=[{"role": "user", "content": content}],
                                        max_tokens=self.max_tokens, effort=effort, tag=agent)
            except LLMError as e:
                meta["cost_usd"] += e.cost_usd
                raise
            meta["cost_usd"] += res.cost_usd
            meta["input_tokens"] += res.input_tokens
            meta["output_tokens"] += res.output_tokens
            meta["latency_ms"] += res.latency_ms
            meta["model"] = res.model
            try:
                data = extract_json(res.text)
                output = schema.model_validate(data).model_dump(mode="json")
                return AgentResult(output=output, meta=meta)
            except (ValueError, ValidationError) as e:   # ValidationError subclasses ValueError
                last_error = str(e)[:MAX_ERROR_CHARS]
                content = (
                    f"{request}\n\n"
                    f"Your previous output failed validation.\n"
                    f"PREVIOUS OUTPUT:\n{res.text[:MAX_ECHO_CHARS]}\n\n"
                    f"VALIDATION ERROR:\n{last_error}\n\n"
                    f"Return the corrected JSON object only."
                )
        raise AgentOutputError(f"{agent}/{mode}: invalid output after {self.max_attempts} attempts: "
                               f"{last_error}", meta)
