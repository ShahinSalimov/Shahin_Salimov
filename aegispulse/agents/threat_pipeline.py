"""AegisPulse three-agent threat analysis pipeline.

    raw intel ──► sanitize ──► Agent 1: Triage ──► Agent 2: Context (tool use) ──► Agent 3: Remediation ──► post-process
                   │             IoCs + severity     MITRE ATT&CK + stack exposure     scripts / WAF / detections      grounding,
                   │                                                                                                   validation,
                   └─ injection signals, dedup hash                                                                   final severity

Design principles
-----------------
* **Schema-constrained outputs.** Every agent answers through
  ``output_config.format`` (JSON Schema generated from the Pydantic models in
  :mod:`agents.schemas`) and the result is re-validated with Pydantic.
* **Deterministic tool use.** Agent 2 can only reach read-only, local tools
  (ATT&CK catalog search/lookup and stack-exposure scoring). No tool has side
  effects, so a manipulated model cannot act on the outside world.
* **Grounding after generation.** Indicators must occur in the source text;
  ATT&CK IDs must exist in the catalog; stack impacts must reference real
  stack components; scripts are statically validated and never executed.
* **Fail loudly, with context.** Every API failure, refusal or schema error is
  raised as a :class:`PipelineError` naming the stage, so the backend can
  persist an actionable error state.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from typing import Any, TypeVar

import anthropic
from anthropic import AsyncAnthropic, transform_schema
from pydantic import BaseModel, ValidationError

from agents import mitre_catalog
from agents.ioc_extractor import extract_indicators, ground_indicators
from agents.prompts import CONTEXT_SYSTEM, REMEDIATION_SYSTEM, TRIAGE_SYSTEM
from agents.sanitizer import SanitizedInput, sanitize_threat_text, wrap_untrusted
from agents.schemas import (
    CompanyStackProfile,
    Indicator,
    PipelineResult,
    RemediationPlan,
    SanitizationReport,
    ScriptValidation,
    StageMetric,
    ThreatContext,
    TriageResult,
    severity_label,
)
from agents.script_validator import validate_firewall_rule, validate_patch_script
from agents.stack_matching import assess_exposure, prioritized_severity

logger = logging.getLogger("aegispulse.pipeline")

PIPELINE_VERSION = "1.0.0"
FALLBACK_BETA = "server-side-fallback-2026-07-01"

ModelT = TypeVar("ModelT", bound=BaseModel)
StageCallback = Callable[[str], Awaitable[None]]
ToolHandler = Callable[[dict[str, Any]], Awaitable[str]]


# --------------------------------------------------------------------------- #
# Errors
# --------------------------------------------------------------------------- #


class PipelineError(RuntimeError):
    """Base error. ``retryable`` tells the worker whether a retry can help."""

    def __init__(self, stage: str, message: str, *, retryable: bool = False) -> None:
        super().__init__(f"[{stage}] {message}")
        self.stage = stage
        self.retryable = retryable


class AgentRefusalError(PipelineError):
    def __init__(self, stage: str, category: str | None, explanation: str | None) -> None:
        super().__init__(
            stage,
            f"model declined the request (category={category or 'unspecified'}): {explanation or 'no explanation'}",
        )
        self.category = category


class AgentOutputError(PipelineError):
    """The model returned output that could not be validated."""


# --------------------------------------------------------------------------- #
# Configuration
# --------------------------------------------------------------------------- #


@dataclass(slots=True)
class PipelineConfig:
    model: str = "claude-opus-5-5"
    triage_effort: str = "medium"
    context_effort: str = "high"
    remediation_effort: str = "high"
    max_tokens: int = 16_000
    enable_fallbacks: bool = True
    request_timeout_s: float = 300.0
    max_retries: int = 3
    max_tool_rounds: int = 6
    short_circuit_below: float = 4.0
    stage_input_char_budget: int = 20_000
    validation_repair_attempts: int = 1


@dataclass(slots=True)
class _CallOutcome:
    parsed: BaseModel
    metric: StageMetric


@dataclass(slots=True)
class _Tool:
    definition: dict[str, Any]
    handler: ToolHandler


@dataclass(slots=True)
class _Accumulator:
    input_tokens: int = 0
    output_tokens: int = 0
    tool_calls: int = 0
    fallback_used: bool = False
    served_model: str | None = None
    extra: dict[str, Any] = field(default_factory=dict)


# --------------------------------------------------------------------------- #
# Pipeline
# --------------------------------------------------------------------------- #


class ThreatPipeline:
    """Runs the three-agent analysis for one raw intelligence item."""

    def __init__(self, client: AsyncAnthropic | None = None, config: PipelineConfig | None = None) -> None:
        self.config = config or PipelineConfig()
        self._client = client or AsyncAnthropic(
            max_retries=self.config.max_retries,
            timeout=self.config.request_timeout_s,
        )

    # ------------------------------------------------------------------ API

    async def run(
        self,
        raw_text: str,
        company: CompanyStackProfile,
        *,
        source: str = "unknown",
        on_stage: StageCallback | None = None,
    ) -> PipelineResult:
        started = time.perf_counter()
        stages: list[StageMetric] = []

        async def notify(stage: str) -> None:
            if on_stage is not None:
                try:
                    await on_stage(stage)
                except Exception:  # progress reporting must never break analysis
                    logger.exception("on_stage callback failed for stage %s", stage)

        # -- Sanitize --------------------------------------------------------
        await notify("sanitize")
        t0 = time.perf_counter()
        sanitized = sanitize_threat_text(raw_text)
        if not sanitized.text:
            raise PipelineError("sanitize", "input is empty after sanitisation")
        envelope, _ = wrap_untrusted(sanitized.text, source=source)
        stages.append(StageMetric(stage="sanitize", duration_ms=_ms(t0)))

        # -- Agent 1: Triage --------------------------------------------------
        await notify("triage")
        triage_out = await self._call_agent(
            stage="triage",
            system=TRIAGE_SYSTEM,
            user_content=self._triage_prompt(sanitized, envelope, source),
            output_model=TriageResult,
            effort=self.config.triage_effort,
        )
        triage: TriageResult = triage_out.parsed  # type: ignore[assignment]
        stages.append(triage_out.metric)

        grounded, dropped = ground_indicators(triage.indicators, sanitized.text)
        triage = triage.model_copy(update={"indicators": grounded})

        short_circuit = (not triage.is_actionable) and triage.severity_score < self.config.short_circuit_below
        context: ThreatContext | None = None
        remediation: RemediationPlan | None = None
        mitre_notes: list[str] = []

        if not short_circuit:
            stage_text = self._stage_excerpt(sanitized.text)
            stage_envelope, _ = wrap_untrusted(stage_text, source=source)

            # -- Agent 2: Context & actor profiling (tool use) ---------------
            await notify("context")
            context_out = await self._call_agent(
                stage="context",
                system=CONTEXT_SYSTEM,
                user_content=self._context_prompt(triage, company, stage_envelope),
                output_model=ThreatContext,
                effort=self.config.context_effort,
                tools=self._context_tools(company),
            )
            context, mitre_notes = self._ground_context(context_out.parsed, company)  # type: ignore[arg-type]
            stages.append(context_out.metric)

            # -- Agent 3: Remediation ----------------------------------------
            await notify("remediation")
            remediation_out = await self._call_agent(
                stage="remediation",
                system=REMEDIATION_SYSTEM,
                user_content=self._remediation_prompt(triage, context, company, stage_envelope),
                output_model=RemediationPlan,
                effort=self.config.remediation_effort,
            )
            remediation = remediation_out.parsed  # type: ignore[assignment]
            stages.append(remediation_out.metric)

        # -- Post-processing ---------------------------------------------------
        await notify("postprocess")
        t0 = time.perf_counter()
        validations = await self._validate_remediation(remediation) if remediation else []
        direct_keys = [i.component_key for i in (context.stack_impacts if context else []) if i.exposure == "direct"]
        exposure, _, _ = assess_exposure(
            company.tech_stack, [*triage.affected_technologies, *direct_keys], sanitized.text
        )
        final = prioritized_severity(triage.severity_score, exposure)
        requires_review = bool(
            sanitized.injection_signals
            or triage.injection_attempt_detected
            or any(v.risk_level == "high" or not v.syntax_ok for v in validations)
        )
        stages.append(StageMetric(stage="postprocess", duration_ms=_ms(t0)))

        return PipelineResult(
            pipeline_version=PIPELINE_VERSION,
            model=self.config.model,
            content_hash=sanitized.content_hash,
            sanitization=SanitizationReport(
                original_chars=sanitized.original_chars,
                sanitized_chars=len(sanitized.text),
                truncated=sanitized.truncated,
                removed_control_chars=sanitized.removed_control_chars,
                injection_signals=sanitized.injection_signals,
            ),
            triage=triage,
            context=context,
            remediation=remediation,
            indicators=grounded,
            dropped_indicators=dropped,
            mitre_validation_notes=mitre_notes,
            script_validations=validations,
            exposure=exposure,
            final_severity=final,
            severity_label=severity_label(final),
            short_circuited=short_circuit,
            requires_human_review=requires_review,
            stages=stages,
            total_duration_ms=_ms(started),
        )

    # ------------------------------------------------------------ prompts

    @staticmethod
    def _triage_prompt(sanitized: SanitizedInput, envelope: str, source: str) -> str:
        hints = extract_indicators(sanitized.text)
        hint_lines = "\n".join(f"- {h.type}: {h.value}" for h in hints[:60]) or "- none"
        signals = ", ".join(sanitized.injection_signals) or "none"
        return (
            f"Collection channel: {source}\n"
            f"Sanitizer manipulation signals: {signals}\n"
            "Deterministic pre-extraction candidates (verify against the text; may contain false positives):\n"
            f"{hint_lines}\n\n"
            "Triage the following intelligence item.\n\n"
            f"{envelope}"
        )

    def _stage_excerpt(self, text: str) -> str:
        budget = self.config.stage_input_char_budget
        return text if len(text) <= budget else text[:budget] + "\n[... truncated for downstream agents ...]"

    @staticmethod
    def _context_prompt(triage: TriageResult, company: CompanyStackProfile, envelope: str) -> str:
        return (
            "Triage output from Agent 1 (trusted, produced by AegisPulse):\n"
            f"{triage.model_dump_json(indent=2)}\n\n"
            f"Protected company: {company.name}"
            + (f" (industry: {company.industry})" if company.industry else "")
            + "\nTechnology stack:\n"
            f"{company.stack_summary()}\n\n"
            "Original intelligence for reference:\n"
            f"{envelope}"
        )

    @staticmethod
    def _remediation_prompt(
        triage: TriageResult, context: ThreatContext, company: CompanyStackProfile, envelope: str
    ) -> str:
        indicators = "\n".join(f"- {i.type}: {i.value} ({i.confidence})" for i in triage.indicators) or "- none"
        return (
            f"Protected company: {company.name}\nTechnology stack:\n{company.stack_summary()}\n\n"
            "Grounded indicators (verified to appear in the source; only these may be blocked):\n"
            f"{indicators}\n\n"
            "Triage (Agent 1):\n"
            f"{triage.model_dump_json(indent=2, exclude={'indicators'})}\n\n"
            "Context & ATT&CK mapping (Agent 2):\n"
            f"{context.model_dump_json(indent=2)}\n\n"
            "Original intelligence for reference:\n"
            f"{envelope}\n\n"
            "Produce the remediation plan."
        )

    # -------------------------------------------------------------- tools

    def _context_tools(self, company: CompanyStackProfile) -> list[_Tool]:
        async def search(args: dict[str, Any]) -> str:
            results = mitre_catalog.search_techniques(str(args.get("query", "")))
            return json.dumps({"results": [t.to_dict() for t in results]})

        async def lookup(args: dict[str, Any]) -> str:
            ids = [str(i) for i in args.get("technique_ids", [])][:20]
            out = []
            for tid in ids:
                tech = mitre_catalog.get_technique(tid)
                out.append(tech.to_dict() if tech else {"technique_id": tid, "status": "not_found"})
            return json.dumps({"techniques": out})

        async def exposure(args: dict[str, Any]) -> str:
            techs = [str(t) for t in args.get("technologies", [])][:50]
            level, direct, indirect = assess_exposure(company.tech_stack, techs)
            return json.dumps(
                {
                    "exposure": level,
                    "matched_components": [c.model_dump() for c in direct],
                    "company_stack_keys": [c.key for c in company.tech_stack],
                    "indirect_components": [c.model_dump() for c in indirect],
                }
            )

        return [
            _Tool(
                {
                    "name": "search_mitre_techniques",
                    "description": "Search the AegisPulse MITRE ATT&CK Enterprise catalog by behaviour keywords "
                    "(e.g. 'sql injection public web app', 'stolen aws keys'). Returns candidate techniques "
                    "with IDs, names and tactics.",
                    "strict": True,
                    "input_schema": {
                        "type": "object",
                        "properties": {"query": {"type": "string", "description": "Behaviour keywords."}},
                        "required": ["query"],
                        "additionalProperties": False,
                    },
                },
                search,
            ),
            _Tool(
                {
                    "name": "lookup_mitre_techniques",
                    "description": "Confirm ATT&CK technique IDs. Returns the authoritative name and tactics "
                    "for each ID, or status 'not_found'. Always confirm IDs before using them.",
                    "strict": True,
                    "input_schema": {
                        "type": "object",
                        "properties": {
                            "technique_ids": {
                                "type": "array",
                                "items": {"type": "string"},
                                "description": "IDs such as T1190 or T1078.004.",
                            }
                        },
                        "required": ["technique_ids"],
                        "additionalProperties": False,
                    },
                },
                lookup,
            ),
            _Tool(
                {
                    "name": "assess_stack_exposure",
                    "description": "Match technologies targeted by the threat against the protected company's "
                    "deployed stack. Returns exposure level and matching component keys.",
                    "strict": True,
                    "input_schema": {
                        "type": "object",
                        "properties": {
                            "technologies": {
                                "type": "array",
                                "items": {"type": "string"},
                                "description": "Products/platforms targeted, e.g. ['nginx', 'ubuntu 22.04'].",
                            }
                        },
                        "required": ["technologies"],
                        "additionalProperties": False,
                    },
                },
                exposure,
            ),
        ]

    # ------------------------------------------------------------ the loop

    async def _call_agent(
        self,
        *,
        stage: str,
        system: str,
        user_content: str,
        output_model: type[ModelT],
        effort: str,
        tools: list[_Tool] | None = None,
    ) -> _CallOutcome:
        """Run one agent to a schema-valid answer, executing tools as needed."""
        t0 = time.perf_counter()
        acc = _Accumulator()
        messages: list[dict[str, Any]] = [{"role": "user", "content": user_content}]
        handlers = {t.definition["name"]: t.handler for t in tools or []}
        repairs_left = self.config.validation_repair_attempts

        kwargs: dict[str, Any] = {
            "model": self.config.model,
            "max_tokens": self.config.max_tokens,
            "system": [{"type": "text", "text": system, "cache_control": {"type": "ephemeral"}}],
            "output_config": {
                "effort": effort,
                "format": {"type": "json_schema", "schema": transform_schema(output_model)},
            },
        }
        if tools:
            kwargs["tools"] = [t.definition for t in tools]
        if self.config.enable_fallbacks:
            kwargs["betas"] = [FALLBACK_BETA]
            kwargs["fallbacks"] = "default"

        for _round in range(self.config.max_tool_rounds + 1 + repairs_left):
            response = await self._create(stage, messages=messages, **kwargs)
            acc.input_tokens += getattr(response.usage, "input_tokens", 0) or 0
            acc.output_tokens += getattr(response.usage, "output_tokens", 0) or 0
            acc.served_model = response.model
            if any(getattr(e, "type", None) == "fallback_message" for e in (getattr(response.usage, "iterations", None) or [])):
                acc.fallback_used = True

            if response.stop_reason == "refusal":
                details = getattr(response, "stop_details", None)
                raise AgentRefusalError(
                    stage, getattr(details, "category", None), getattr(details, "explanation", None)
                )
            if response.stop_reason == "max_tokens":
                raise AgentOutputError(stage, f"response truncated at max_tokens={self.config.max_tokens}")

            assistant_content = [_block_to_param(b) for b in response.content]

            if response.stop_reason == "tool_use":
                tool_uses = [b for b in response.content if b.type == "tool_use"]
                if not handlers:
                    raise AgentOutputError(stage, "model requested a tool but none are available")
                results = await asyncio.gather(*(self._run_tool(stage, handlers, b) for b in tool_uses))
                acc.tool_calls += len(tool_uses)
                messages.append({"role": "assistant", "content": assistant_content})
                messages.append({"role": "user", "content": list(results)})
                continue

            text = "".join(b.text for b in response.content if b.type == "text").strip()
            try:
                parsed = output_model.model_validate_json(text)
            except ValidationError as exc:
                if repairs_left <= 0:
                    raise AgentOutputError(stage, f"output failed schema validation: {exc.errors()[:3]}") from exc
                repairs_left -= 1
                logger.warning("stage %s: schema validation failed, requesting repair", stage)
                messages.append({"role": "assistant", "content": assistant_content})
                messages.append(
                    {
                        "role": "user",
                        "content": "Your previous answer did not validate against the required schema: "
                        f"{json.dumps(exc.errors(include_url=False)[:5], default=str)}. Return the corrected JSON only.",
                    }
                )
                continue

            metric = StageMetric(
                stage=stage,  # type: ignore[arg-type]
                duration_ms=_ms(t0),
                model=acc.served_model,
                input_tokens=acc.input_tokens,
                output_tokens=acc.output_tokens,
                tool_calls=acc.tool_calls,
                fallback_used=acc.fallback_used,
            )
            return _CallOutcome(parsed=parsed, metric=metric)

        raise AgentOutputError(stage, f"no final answer after {self.config.max_tool_rounds} tool rounds")

    async def _create(self, stage: str, **kwargs: Any) -> Any:
        try:
            return await self._client.beta.messages.create(**kwargs)
        except anthropic.AuthenticationError as exc:
            raise PipelineError(stage, "Anthropic authentication failed - check ANTHROPIC_API_KEY") from exc
        except anthropic.PermissionDeniedError as exc:
            raise PipelineError(stage, f"Anthropic permission denied: {exc.message}") from exc
        except anthropic.BadRequestError as exc:
            raise PipelineError(stage, f"Anthropic rejected the request: {exc.message}") from exc
        except anthropic.RateLimitError as exc:
            raise PipelineError(stage, "Anthropic rate limit exceeded after retries", retryable=True) from exc
        except anthropic.APIStatusError as exc:
            raise PipelineError(
                stage, f"Anthropic API error {exc.status_code}: {exc.message}", retryable=exc.status_code >= 500
            ) from exc
        except anthropic.APITimeoutError as exc:
            raise PipelineError(stage, "Anthropic request timed out", retryable=True) from exc
        except anthropic.APIConnectionError as exc:
            raise PipelineError(stage, "could not reach the Anthropic API", retryable=True) from exc

    @staticmethod
    async def _run_tool(stage: str, handlers: dict[str, ToolHandler], block: Any) -> dict[str, Any]:
        handler = handlers.get(block.name)
        if handler is None:
            return {
                "type": "tool_result",
                "tool_use_id": block.id,
                "content": f"Unknown tool '{block.name}'.",
                "is_error": True,
            }
        args = block.input if isinstance(block.input, dict) else {}
        try:
            content = await handler(args)
            return {"type": "tool_result", "tool_use_id": block.id, "content": content}
        except Exception as exc:  # a tool bug must not kill the analysis
            logger.exception("stage %s: tool %s failed", stage, block.name)
            return {
                "type": "tool_result",
                "tool_use_id": block.id,
                "content": f"Tool error: {type(exc).__name__}",
                "is_error": True,
            }

    # ------------------------------------------------------ post-processing

    @staticmethod
    def _ground_context(
        context: ThreatContext, company: CompanyStackProfile
    ) -> tuple[ThreatContext, list[str]]:
        notes: list[str] = []
        mappings = []
        seen: set[str] = set()
        for m in context.mitre_mappings:
            tech = mitre_catalog.get_technique(m.technique_id)
            if tech is None:
                notes.append(f"Dropped unknown ATT&CK technique {m.technique_id!r}.")
                continue
            if tech.id in seen:
                continue
            seen.add(tech.id)
            tactic_id = m.tactic_id if m.tactic_id in tech.tactic_ids else tech.tactic_ids[0]
            if tactic_id != m.tactic_id:
                notes.append(f"Corrected tactic for {tech.id} to {tactic_id}.")
            mappings.append(
                m.model_copy(
                    update={
                        "technique_id": tech.id,
                        "technique_name": tech.name,
                        "tactic_id": tactic_id,
                        "tactic": mitre_catalog.TACTICS[tactic_id],
                    }
                )
            )
        mappings.sort(key=lambda m: mitre_catalog.TACTIC_ORDER.index(m.tactic_id))

        stack_by_key = {c.key: c for c in company.tech_stack}
        impacts = []
        for impact in context.stack_impacts:
            component = stack_by_key.get(impact.component_key)
            if component is None:
                notes.append(f"Dropped stack impact for unknown component {impact.component_key!r}.")
                continue
            impacts.append(impact.model_copy(update={"component_label": component.label}))

        return context.model_copy(update={"mitre_mappings": mappings, "stack_impacts": impacts}), notes

    @staticmethod
    async def _validate_remediation(plan: RemediationPlan) -> list[ScriptValidation]:
        script_checks = await asyncio.gather(*(validate_patch_script(p) for p in plan.patch_scripts))
        rule_checks = [validate_firewall_rule(r, i) for i, r in enumerate(plan.firewall_rules)]
        return [*script_checks, *rule_checks]


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #


def _ms(t0: float) -> int:
    return int((time.perf_counter() - t0) * 1000)


def _block_to_param(block: Any) -> dict[str, Any]:
    """Convert a response content block back into a request param.

    Thinking blocks must be passed back unchanged (including signatures) so
    the conversation stays valid across tool-use rounds.
    """
    data = block.model_dump(mode="json", by_alias=True, exclude_none=True)
    data.pop("parsed_output", None)
    return data


__all__ = [
    "AgentOutputError",
    "AgentRefusalError",
    "Indicator",
    "PipelineConfig",
    "PipelineError",
    "ThreatPipeline",
]
