"""Pydantic models for the output schemas of the 5 YouTube agents (extra='forbid').

Source of truth: ../zero-touch/01-agent-system-prompts.md (OUTPUT SCHEMA blocks). YouTube limits
(title length, tag budget, chapters, scheduled private upload) are enforced here in code.
"""
from __future__ import annotations

import re
from typing import ClassVar, Literal

from pydantic import Field, model_validator

from core.schema_base import (AgentOutput, AlertLevel, IsoUtc, Score10, Strict, WhatsAppText,
                              ok_and, require)

AGENT_TIER = {"trend_scout": "light", "script_writer": "heavy", "media_producer": "light",
              "seo_upload": "light", "growth_banker": "light"}

TAGS_MAX_CHARS = 450
_CHAPTER_TIME = re.compile(r"^(\d{1,2}:)?\d{2}:\d{2}$")


# --- Trend Scout -------------------------------------------------------------------------

class Idea(Strict):
    idea_id: str
    working_title: str
    hook_angle: str
    pattern_source_refs: list[str]
    outlier_ratio_max: float | None = Field(ge=0)
    evergreen: bool
    view_potential_score: Score10
    production_difficulty: Literal["low", "medium", "high"]
    why_it_works: str


class TrendScout(AgentOutput):
    REQUIRED_WHEN_OK: ClassVar = ("ideas", "selected_idea_id")
    ideas: list[Idea] | None = Field(default=None, min_length=1)
    selected_idea_id: str | None = None

    @model_validator(mode="after")
    def _selected(self) -> "TrendScout":
        if ok_and(self, "ideas", "selected_idea_id"):
            require(self.selected_idea_id in {i.idea_id for i in self.ideas},
                    "selected_idea_id must be one of ideas")
        return self


# --- Script Writer -----------------------------------------------------------------------

class Scene(Strict):
    scene_index: int = Field(ge=0)
    start_s: float = Field(ge=0)
    end_s: float = Field(gt=0)
    voiceover: str
    on_screen_text: str
    visual_prompt: str
    visual_type: Literal["ai_video", "ai_image_kenburns", "stock_broll", "text_card"]
    sfx: str | None


def _check_timeline(scenes: list) -> None:
    prev_end = 0.0
    for i, s in enumerate(scenes):
        require(s.scene_index == i, "scene_index must be 0, 1, 2, ... in order")
        require(s.end_s > s.start_s, f"scene {i}: end_s must be greater than start_s")
        require(s.start_s >= prev_end - 0.01, f"scene {i}: scenes must not overlap")
        prev_end = s.end_s


class ScriptWriter(AgentOutput):
    REQUIRED_WHEN_OK: ClassVar = ("title_draft", "total_duration_s", "word_count", "scenes")
    title_draft: str | None = None
    total_duration_s: float | None = Field(default=None, gt=0)
    word_count: int | None = Field(default=None, gt=0)
    scenes: list[Scene] | None = Field(default=None, min_length=1)
    fact_checks: list[str] = Field(default_factory=list)
    revision_log: list[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def _timeline(self) -> "ScriptWriter":
        if ok_and(self, "scenes"):
            _check_timeline(self.scenes)
        return self


# --- Media Producer ----------------------------------------------------------------------

class OutputSpec(Strict):
    width: int = Field(gt=0)
    height: int = Field(gt=0)
    fps: Literal[30]
    container: Literal["mp4"]
    codec: Literal["h264"]


class Voice(Strict):
    provider: str
    voice_id: str
    speed: float = Field(gt=0.5, le=2.0)


class RenderScene(Strict):
    scene_index: int = Field(ge=0)
    start_s: float = Field(ge=0)
    end_s: float = Field(gt=0)
    asset_provider: str
    asset_prompt: str
    motion: Literal["static", "kenburns_in", "kenburns_out", "pan_left", "pan_right", "none"]
    overlay_text: str
    transition_in: Literal["cut", "zoom", "whip"]


class Music(Strict):
    track: str
    gain_db: float = Field(le=0)


class Subtitles(Strict):
    style: Literal["word_highlight"]
    max_words_per_line: int = Field(ge=1, le=5)
    position: Literal["lower_third", "bottom"]


class MediaProducerPlan(AgentOutput):
    REQUIRED_WHEN_OK: ClassVar = ("output", "voice", "scenes", "subtitles", "thumbnail_prompt",
                                  "ai_disclosure_required")
    mode: Literal["plan"] = "plan"
    output: OutputSpec | None = None
    voice: Voice | None = None
    scenes: list[RenderScene] | None = Field(default=None, min_length=1)
    music: Music | None = None
    subtitles: Subtitles | None = None
    thumbnail_prompt: str | None = None
    ai_disclosure_required: bool | None = None

    @model_validator(mode="after")
    def _timeline(self) -> "MediaProducerPlan":
        if ok_and(self, "scenes"):
            _check_timeline(self.scenes)
        return self


class Fix(Strict):
    scene_index: int = Field(ge=0)
    problem: str
    action: str


class MediaProducerQc(AgentOutput):
    REQUIRED_WHEN_OK: ClassVar = ("verdict",)
    mode: Literal["qc"] = "qc"
    verdict: Literal["pass", "fail"] | None = None
    fixes: list[Fix] = Field(default_factory=list)

    @model_validator(mode="after")
    def _fixes(self) -> "MediaProducerQc":
        if ok_and(self, "verdict") and self.verdict == "fail":
            require(bool(self.fixes), "verdict 'fail' requires at least one fix")
        return self


# --- SEO & Upload ------------------------------------------------------------------------

class Snippet(Strict):
    title: str = Field(min_length=1, max_length=70)
    description: str = Field(min_length=1, max_length=5000)
    tags: list[str] = Field(min_length=8, max_length=15)
    categoryId: str = Field(pattern=r"^\d+$")
    defaultLanguage: str

    @model_validator(mode="after")
    def _tags_budget(self) -> "Snippet":
        require(sum(len(t) for t in self.tags) < TAGS_MAX_CHARS,
                f"tags must total under {TAGS_MAX_CHARS} characters")
        return self


class StatusBlock(Strict):
    privacyStatus: Literal["private"]
    publishAt: IsoUtc
    selfDeclaredMadeForKids: bool
    containsSyntheticMedia: bool


class Chapter(Strict):
    time: str = Field(pattern=_CHAPTER_TIME.pattern)
    label: str


class SeoUpload(AgentOutput):
    REQUIRED_WHEN_OK: ClassVar = ("snippet", "status_block", "pinned_comment", "thumbnail_text")
    snippet: Snippet | None = None
    status_block: StatusBlock | None = None
    chapters: list[Chapter] = Field(default_factory=list)
    pinned_comment: str | None = None
    thumbnail_text: str | None = None

    @model_validator(mode="after")
    def _chapters(self) -> "SeoUpload":
        if self.chapters:
            require(self.chapters[0].time in ("00:00", "0:00", "00:00:00"),
                    "first chapter must start at 00:00")
            require(len(self.chapters) >= 3, "chapters need at least 3 entries (or none)")
        return self


# --- Growth Banker -----------------------------------------------------------------------

class Classification(Strict):
    video_id: str
    label: Literal["winner", "average", "loser"]
    reason: str


class Directives(Strict):
    trend_scout: list[str]
    script_writer: list[str]
    media_producer: list[str]


class UnitEconomics(Strict):
    cost_per_1000_views: float = Field(ge=0)
    roi: float


class GrowthBanker(AgentOutput):
    REQUIRED_WHEN_OK: ClassVar = ("classification", "directives", "unit_economics", "throttle",
                                  "whatsapp_message", "alert_level")
    classification: list[Classification] | None = None
    directives: Directives | None = None
    unit_economics: UnitEconomics | None = None
    throttle: bool | None = None
    whatsapp_message: WhatsAppText | None = None
    alert_level: AlertLevel | None = None


SCHEMAS = {
    ("trend_scout", None): TrendScout,
    ("script_writer", None): ScriptWriter,
    ("media_producer", "plan"): MediaProducerPlan,
    ("media_producer", "qc"): MediaProducerQc,
    ("seo_upload", None): SeoUpload,
    ("growth_banker", None): GrowthBanker,
}
