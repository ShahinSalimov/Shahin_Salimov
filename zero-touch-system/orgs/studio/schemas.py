"""Pydantic models for the output schemas of the 5 studio agents (extra='forbid').

Source of truth: ../zero-touch/01-agent-system-prompts.md (OUTPUT SCHEMA blocks). Business rules
that the prompts state (thresholds, limits, formulas) are re-checked here in code, so a model that
ignores them gets a validation error and a corrective retry instead of moving the run forward.
"""
from __future__ import annotations

from typing import Annotated, ClassVar, Literal

from pydantic import Field, model_validator

from core.schema_base import (AgentOutput, AlertLevel, IsoUtc, Level, Score10, Strict, WhatsAppText,
                              ok_and, require)

Category = Literal["ebook", "notion_template", "spreadsheet_template", "prompt_pack", "code_script",
                   "checklist", "mini_course_pdf", "design_asset_pack"]
FileFormat = Literal["pdf", "md", "csv", "xlsx", "json", "zip", "py", "txt"]

AGENT_TIER = {"ceo": "heavy", "research": "light", "content": "light",
              "philosopher": "heavy", "banker": "light"}

DECIDE_THRESHOLD = 6.5
WEIGHTS = {"demand_score": 0.35, "competition_score": 0.25,
           "production_feasibility": 0.25, "fit_with_portfolio": 0.15}


# --- CEO -------------------------------------------------------------------------------

class ResearchDirection(Strict):
    direction_id: str
    buyer_persona: str
    category: Category
    hypothesis: str
    keywords: list[str] = Field(min_length=1)


class CeoPlan(AgentOutput):
    REQUIRED_WHEN_OK: ClassVar = ("research_brief", "portfolio_notes")
    mode: Literal["plan"] = "plan"
    research_brief: Annotated[list[ResearchDirection], Field(min_length=3, max_length=5)] | None = None
    portfolio_notes: str | None = None


class OpportunityScore(Strict):
    opportunity_id: str
    demand_score: Score10
    competition_score: Score10
    production_feasibility: Score10
    fit_with_portfolio: Score10
    weighted_score: Score10

    @model_validator(mode="after")
    def _formula(self) -> "OpportunityScore":
        expected = sum(getattr(self, k) * w for k, w in WEIGHTS.items())
        require(abs(expected - self.weighted_score) <= 0.06,
                f"weighted_score for {self.opportunity_id} must be {expected:.2f} "
                f"(0.35*demand + 0.25*competition + 0.25*feasibility + 0.15*fit)")
        return self


class Deliverable(Strict):
    file_name: str
    format: FileFormat
    description: str


class ProductSpec(Strict):
    working_title: str
    category: Category
    buyer_persona: str
    core_promise: str
    deliverables: list[Deliverable] = Field(min_length=1)
    outline: list[str] = Field(min_length=1)
    length_target: str
    tone: str
    market_language: str
    must_not_include: list[str]


class CeoDecide(AgentOutput):
    REQUIRED_WHEN_OK: ClassVar = ("scores", "selected_opportunity_id", "product_spec")
    mode: Literal["decide"] = "decide"
    scores: list[OpportunityScore] | None = None
    selected_opportunity_id: str | None = None
    product_spec: ProductSpec | None = None

    @model_validator(mode="after")
    def _selection(self) -> "CeoDecide":
        if ok_and(self, "scores", "selected_opportunity_id"):
            by_id = {s.opportunity_id: s for s in self.scores}
            chosen = by_id.get(self.selected_opportunity_id)
            require(chosen is not None, "selected_opportunity_id must be one of the scored opportunities")
            require(chosen.weighted_score >= DECIDE_THRESHOLD,
                    f"selected opportunity needs weighted_score >= {DECIDE_THRESHOLD}; "
                    "if none qualifies return status 'rejected'")
        return self


# --- Research ----------------------------------------------------------------------------

class Evidence(Strict):
    evidence_ref: str
    source: str
    insight: str


class PriceBand(Strict):
    min: float = Field(ge=0)
    max: float = Field(ge=0)

    @model_validator(mode="after")
    def _order(self) -> "PriceBand":
        require(self.min <= self.max, "price_band.min must be <= price_band.max")
        return self


class Competitor(Strict):
    title: str
    url: str
    price: float | None


class Opportunity(Strict):
    opportunity_id: str
    direction_id: str
    title: str
    buyer_problem: str
    category: Category
    evidence: list[Evidence] = Field(min_length=1)
    demand_estimate: Level
    competition_estimate: Level
    price_band: PriceBand | None
    differentiation_angle: str
    top_competitors: list[Competitor]


class Research(AgentOutput):
    REQUIRED_WHEN_OK: ClassVar = ("opportunities", "market_summary")
    opportunities: list[Opportunity] | None = None
    market_summary: str | None = None

    @model_validator(mode="after")
    def _count(self) -> "Research":
        if ok_and(self, "opportunities"):
            require(3 <= len(self.opportunities) <= 6, "return 3 to 6 opportunities")
        return self


# --- Content -----------------------------------------------------------------------------

class ContentSection(AgentOutput):
    REQUIRED_WHEN_OK: ClassVar = ("section_index", "section_title", "target_file", "content_format",
                                  "content", "section_summary")
    build_step: Literal["section"] = "section"
    section_index: int | None = Field(default=None, ge=0)
    section_title: str | None = None
    target_file: str | None = None
    content_format: Literal["markdown", "csv", "json", "python", "txt"] | None = None
    content: Annotated[str, Field(min_length=1)] | None = None
    section_summary: str | None = None
    revision_log: list[str] = Field(default_factory=list)


class Listing(Strict):
    name: str = Field(min_length=1, max_length=70)
    summary: str = Field(min_length=1, max_length=160)
    description_html: str
    tags: list[str] = Field(min_length=5, max_length=8)
    custom_permalink: str = Field(pattern=r"^[a-z0-9][a-z0-9-]*$")
    thumbnail_prompt: str
    cover_prompt: str
    what_is_included: list[str] = Field(min_length=1)


class ContentListing(AgentOutput):
    REQUIRED_WHEN_OK: ClassVar = ("listing",)
    build_step: Literal["listing"] = "listing"
    listing: Listing | None = None
    revision_log: list[str] = Field(default_factory=list)


# --- Philosopher -------------------------------------------------------------------------

class ReviewScores(Strict):
    buyer_value: Score10
    promise_match: Score10
    originality: Score10
    policy_risk: Score10
    craft: Score10


class PhilosopherReview(AgentOutput):
    REQUIRED_WHEN_OK: ClassVar = ("scores", "decision")
    mode: Literal["review"] = "review"
    scores: ReviewScores | None = None
    decision: Literal["approve", "revise", "reject"] | None = None
    revision_notes: list[str] = Field(default_factory=list)
    blocking_issues: list[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def _gate(self) -> "PhilosopherReview":
        if not ok_and(self, "scores", "decision"):
            return self
        s = self.scores
        if self.decision == "approve":
            require(all(v >= 7 for v in s.model_dump().values()) and s.policy_risk >= 9,
                    "approve requires every score >= 7 and policy_risk >= 9")
        if s.policy_risk < 6:
            require(self.decision == "reject", "policy_risk < 6 must reject")
        if self.decision == "revise":
            require(bool(self.revision_notes), "revise requires concrete revision_notes")
        return self


class Experiment(Strict):
    hypothesis: str
    metric: str
    success_threshold: str


class PhilosopherReflect(AgentOutput):
    REQUIRED_WHEN_OK: ClassVar = ("critique", "next_experiment", "stop_doing")
    mode: Literal["reflect"] = "reflect"
    critique: str | None = None
    next_experiment: Experiment | None = None
    stop_doing: str | None = None


# --- Banker ------------------------------------------------------------------------------

class OfferCode(Strict):
    code: str = Field(pattern=r"^[A-Z0-9_-]{3,30}$")
    percent_off: float = Field(gt=0, le=30)
    expires_at: IsoUtc


class BankerPricing(AgentOutput):
    REQUIRED_WHEN_OK: ClassVar = ("price_usd", "pay_what_you_want", "rationale")
    mode: Literal["pricing"] = "pricing"
    price_usd: float | None = Field(default=None, gt=0)
    pay_what_you_want: bool | None = None
    min_price_usd: float | None = Field(default=None, gt=0)
    offer_code: OfferCode | None = None
    rationale: str | None = None

    @model_validator(mode="after")
    def _pwyw(self) -> "BankerPricing":
        if ok_and(self, "pay_what_you_want") and self.pay_what_you_want:
            require(self.min_price_usd is not None, "pay_what_you_want requires min_price_usd")
        return self


class BankerReport(AgentOutput):
    REQUIRED_WHEN_OK: ClassVar = ("whatsapp_message", "alert_level")
    mode: Literal["report"] = "report"
    whatsapp_message: WhatsAppText | None = None
    alert_level: AlertLevel | None = None
    recommendations: list[str] = Field(default_factory=list)


SCHEMAS = {
    ("ceo", "plan"): CeoPlan,
    ("ceo", "decide"): CeoDecide,
    ("research", None): Research,
    ("content", "section"): ContentSection,
    ("content", "listing"): ContentListing,
    ("philosopher", "review"): PhilosopherReview,
    ("philosopher", "reflect"): PhilosopherReflect,
    ("banker", "pricing"): BankerPricing,
    ("banker", "report"): BankerReport,
}
