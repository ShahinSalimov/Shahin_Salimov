"""LLMClient wrapping the Claude API; returns text plus token and cost metadata.

- The system prompt is sent as a cached block (it is identical on every call of an agent).
- Thinking is left at the model default; depth is controlled with ``output_config.effort``.
- On models that support it, server-side refusal fallback is on by default
  (beta ``server-side-fallback-2026-07-01`` with ``fallbacks="default"``); turn it off with
  LLM_FALLBACKS=off.
- ``stop_reason == "refusal"`` raises LLMRefusal, ``"max_tokens"`` raises LLMTruncated.
- Cost is computed in code from usage and a price table (USD per million tokens), using the model
  that actually served the request. Unknown models are priced at the most expensive known rate so
  the budget guard errs on the safe side.
"""
from __future__ import annotations

import json
import logging
import time
from dataclasses import asdict, dataclass
from typing import Any

log = logging.getLogger(__name__)

FALLBACK_BETA = "server-side-fallback-2026-07-01"
FALLBACK_MODELS = {"claude-opus-5-5", "claude-sonnet-5-5", "claude-opus-5",
                   "claude-fable-5-2", "claude-fable-5-1"}
CACHE_WRITE_MULTIPLIER = 1.25  # 5-minute cache writes cost 1.25x base input

# (input, output, cache_read) USD per million tokens. Verify against current pricing;
# override with LLM_PRICES_JSON.
PRICES_PER_MTOK: dict[str, tuple[float, float, float]] = {
    "claude-fable-5-2": (8.00, 40.00, 0.20),
    "claude-opus-5-5": (4.00, 20.00, 0.20),
    "claude-opus-5": (5.00, 25.00, 0.50),
    "claude-opus-4-8": (5.00, 25.00, 0.50),
    "claude-sonnet-5-5": (2.00, 10.00, 0.10),
    "claude-sonnet-5": (2.00, 10.00, 0.20),
    "claude-haiku-5-5": (0.10, 0.50, 0.01),
}


class LLMError(Exception):
    def __init__(self, message: str, *, cost_usd: float = 0.0, model: str | None = None):
        super().__init__(message)
        self.cost_usd = cost_usd
        self.model = model


class LLMRefusal(LLMError):
    def __init__(self, message: str, *, category: str | None = None, cost_usd: float = 0.0,
                 model: str | None = None):
        super().__init__(message, cost_usd=cost_usd, model=model)
        self.category = category


class LLMTruncated(LLMError):
    """Output hit max_tokens; the JSON is incomplete."""


@dataclass(frozen=True)
class LLMResult:
    text: str
    model: str
    stop_reason: str
    input_tokens: int
    output_tokens: int
    cache_creation_input_tokens: int
    cache_read_input_tokens: int
    cost_usd: float
    latency_ms: int
    request_id: str | None = None

    def meta(self) -> dict[str, Any]:
        d = asdict(self)
        d.pop("text")
        return d


def _price(model: str, prices: dict[str, tuple[float, float, float]] | None) -> tuple[float, float, float]:
    table = {**PRICES_PER_MTOK, **(prices or {})}
    if model in table:
        return table[model]
    log.warning("no price for model %s; using most expensive known rate", model)
    return max(table.values(), key=lambda p: p[1])


def estimate_cost(model: str, *, input_tokens: int = 0, output_tokens: int = 0,
                  cache_creation_input_tokens: int = 0, cache_read_input_tokens: int = 0,
                  prices: dict[str, tuple[float, float, float]] | None = None) -> float:
    p_in, p_out, p_cache_read = _price(model, prices)
    return (input_tokens * p_in
            + cache_creation_input_tokens * p_in * CACHE_WRITE_MULTIPLIER
            + cache_read_input_tokens * p_cache_read
            + output_tokens * p_out) / 1_000_000


def parse_prices_json(raw: str | None) -> dict[str, tuple[float, float, float]] | None:
    if not raw:
        return None
    return {k: tuple(float(x) for x in v) for k, v in json.loads(raw).items()}  # type: ignore[misc]


class LLMClient:
    def __init__(self, client: Any = None, *, fallbacks: str = "default",
                 prices: dict[str, tuple[float, float, float]] | None = None):
        if client is None:
            import anthropic  # imported lazily so tests never need credentials
            client = anthropic.Anthropic()
        self.client = client
        self.fallbacks = fallbacks
        self.prices = prices

    def complete(self, *, model: str, system: str, messages: list[dict[str, Any]],
                 max_tokens: int = 16000, effort: str | None = None,
                 tag: str | None = None) -> LLMResult:
        kwargs: dict[str, Any] = {
            "model": model,
            "max_tokens": max_tokens,
            "system": [{"type": "text", "text": system, "cache_control": {"type": "ephemeral"}}],
            "messages": messages,
        }
        if effort:
            kwargs["output_config"] = {"effort": effort}

        started = time.monotonic()
        if self.fallbacks == "default" and model in FALLBACK_MODELS:
            response = self.client.beta.messages.create(betas=[FALLBACK_BETA], fallbacks="default", **kwargs)
        else:
            response = self.client.messages.create(**kwargs)
        latency_ms = int((time.monotonic() - started) * 1000)

        usage = response.usage
        served = getattr(response, "model", None) or model
        tokens = {
            "input_tokens": getattr(usage, "input_tokens", 0) or 0,
            "output_tokens": getattr(usage, "output_tokens", 0) or 0,
            "cache_creation_input_tokens": getattr(usage, "cache_creation_input_tokens", 0) or 0,
            "cache_read_input_tokens": getattr(usage, "cache_read_input_tokens", 0) or 0,
        }
        cost = estimate_cost(served, prices=self.prices, **tokens)
        text = "".join(b.text for b in response.content if getattr(b, "type", None) == "text")
        log.info("llm call", extra={"tag": tag, "model": served, "cost_usd": round(cost, 6),
                                    "stop_reason": response.stop_reason, **tokens})

        if response.stop_reason == "refusal":
            details = getattr(response, "stop_details", None)
            raise LLMRefusal(f"{tag or model}: request declined",
                             category=getattr(details, "category", None), cost_usd=cost, model=served)
        if response.stop_reason == "max_tokens":
            raise LLMTruncated(f"{tag or model}: output hit max_tokens={max_tokens}", cost_usd=cost, model=served)

        return LLMResult(text=text, model=served, stop_reason=response.stop_reason, cost_usd=cost,
                         latency_ms=latency_ms, request_id=getattr(response, "_request_id", None), **tokens)
