"""Tests for the Pydantic output schemas of all 10 agents (15 agent/mode pairs)."""
import copy

import pytest
from pydantic import ValidationError

from core.prompts import PromptLoader
from orgs.studio import schemas as studio
from orgs.youtube import schemas as youtube
from tests.conftest import FIXTURES, load_fixture

ORGS = {"studio": studio, "youtube": youtube}


def _fixture_name(agent, mode):
    return f"{agent}.{mode}" if mode else agent


ALL = [(org, agent, mode) for org, mod in ORGS.items() for (agent, mode) in mod.SCHEMAS]


def test_fifteen_agent_modes_registered():
    assert len(ALL) == 15


@pytest.mark.parametrize("org,agent,mode", ALL)
def test_fixture_validates(org, agent, mode):
    data = load_fixture(org, _fixture_name(agent, mode))
    model = ORGS[org].SCHEMAS[(agent, mode)]
    assert model.model_validate(data).model_dump(mode="json") == data


@pytest.mark.parametrize("org,agent,mode", ALL)
def test_extra_top_level_key_rejected(org, agent, mode):
    data = load_fixture(org, _fixture_name(agent, mode))
    data["hallucinated"] = 1
    with pytest.raises(ValidationError):
        ORGS[org].SCHEMAS[(agent, mode)].model_validate(data)


@pytest.mark.parametrize("org,agent,mode", ALL)
def test_ok_status_requires_agent_fields(org, agent, mode):
    model = ORGS[org].SCHEMAS[(agent, mode)]
    with pytest.raises(ValidationError):
        model.model_validate({"status": "ok", "errors": [], "confidence": 0.5})


@pytest.mark.parametrize("org,agent,mode", ALL)
def test_non_ok_status_minimal_and_needs_errors(org, agent, mode):
    model = ORGS[org].SCHEMAS[(agent, mode)]
    model.model_validate({"status": "needs_input", "errors": ["missing raw_signals"], "confidence": 0})
    with pytest.raises(ValidationError):
        model.model_validate({"status": "rejected", "errors": [], "confidence": 0})


def test_every_prompt_has_schema_and_fixture(prompts_dir):
    loader = PromptLoader(prompts_dir)
    for org, mod in ORGS.items():
        assert {a for a, _ in mod.SCHEMAS} == loader.agents(org)
        assert set(mod.AGENT_TIER) == loader.agents(org)
    expected = {f"{org}/{_fixture_name(a, m)}.json" for org, a, m in ALL}
    found = {str(p.relative_to(FIXTURES)) for p in FIXTURES.rglob("*.json")}
    assert expected == found


def test_confidence_range():
    data = load_fixture("studio", "ceo.plan")
    data["confidence"] = 1.5
    with pytest.raises(ValidationError):
        studio.CeoPlan.model_validate(data)


# --- studio business rules -----------------------------------------------------------

def test_ceo_decide_weighted_score_must_match_formula():
    data = load_fixture("studio", "ceo.decide")
    data["scores"][0]["weighted_score"] = 9.9
    with pytest.raises(ValidationError, match="weighted_score"):
        studio.CeoDecide.model_validate(data)


def test_ceo_decide_selected_must_reach_threshold():
    data = load_fixture("studio", "ceo.decide")
    data["selected_opportunity_id"] = "o2"  # weighted 5.5 < 6.5
    with pytest.raises(ValidationError, match="6.5"):
        studio.CeoDecide.model_validate(data)


def test_ceo_decide_selected_must_be_scored():
    data = load_fixture("studio", "ceo.decide")
    data["selected_opportunity_id"] = "o99"
    with pytest.raises(ValidationError):
        studio.CeoDecide.model_validate(data)


def test_ceo_spec_category_restricted():
    data = load_fixture("studio", "ceo.decide")
    data["product_spec"]["category"] = "physical_product"
    with pytest.raises(ValidationError):
        studio.CeoDecide.model_validate(data)


def test_ceo_rejected_without_spec_is_valid():
    studio.CeoDecide.model_validate({"status": "rejected", "errors": ["no_viable_opportunity"],
                                     "confidence": 0.6, "mode": "decide", "scores": [],
                                     "selected_opportunity_id": None, "product_spec": None})


def test_research_ok_needs_three_to_six_opportunities():
    data = load_fixture("studio", "research")
    data["opportunities"] = data["opportunities"][:2]
    with pytest.raises(ValidationError):
        studio.Research.model_validate(data)


def test_research_price_band_min_le_max():
    data = load_fixture("studio", "research")
    data["opportunities"][0]["price_band"] = {"min": 30, "max": 10}
    with pytest.raises(ValidationError):
        studio.Research.model_validate(data)


def test_listing_limits():
    data = load_fixture("studio", "content.listing")
    long_name = copy.deepcopy(data)
    long_name["listing"]["name"] = "x" * 71
    with pytest.raises(ValidationError):
        studio.ContentListing.model_validate(long_name)
    few_tags = copy.deepcopy(data)
    few_tags["listing"]["tags"] = ["a", "b"]
    with pytest.raises(ValidationError):
        studio.ContentListing.model_validate(few_tags)


def test_philosopher_approve_requires_thresholds():
    data = load_fixture("studio", "philosopher.review")
    data["scores"]["policy_risk"] = 8  # approve needs >= 9
    with pytest.raises(ValidationError, match="approve"):
        studio.PhilosopherReview.model_validate(data)
    data = load_fixture("studio", "philosopher.review")
    data["scores"]["craft"] = 6
    with pytest.raises(ValidationError):
        studio.PhilosopherReview.model_validate(data)


def test_philosopher_revise_needs_notes():
    data = load_fixture("studio", "philosopher.review")
    data["decision"] = "revise"
    with pytest.raises(ValidationError, match="revision_notes"):
        studio.PhilosopherReview.model_validate(data)
    data["revision_notes"] = ["Section 2: replace placeholder example with a real one"]
    studio.PhilosopherReview.model_validate(data)


def test_philosopher_low_policy_risk_must_reject():
    data = load_fixture("studio", "philosopher.review")
    data.update(decision="revise", revision_notes=["fix"])
    data["scores"]["policy_risk"] = 5
    with pytest.raises(ValidationError, match="reject"):
        studio.PhilosopherReview.model_validate(data)


def test_banker_offer_max_30_percent_and_positive_price():
    data = load_fixture("studio", "banker.pricing")
    data["offer_code"]["percent_off"] = 50
    with pytest.raises(ValidationError):
        studio.BankerPricing.model_validate(data)
    data = load_fixture("studio", "banker.pricing")
    data["price_usd"] = 0
    with pytest.raises(ValidationError):
        studio.BankerPricing.model_validate(data)


def test_banker_pwyw_needs_min_price():
    data = load_fixture("studio", "banker.pricing")
    data["pay_what_you_want"] = True
    with pytest.raises(ValidationError, match="min_price_usd"):
        studio.BankerPricing.model_validate(data)


def test_whatsapp_message_max_900():
    data = load_fixture("studio", "banker.report")
    data["whatsapp_message"] = "x" * 901
    with pytest.raises(ValidationError):
        studio.BankerReport.model_validate(data)


# --- youtube business rules ----------------------------------------------------------

def test_trend_scout_selected_must_exist():
    data = load_fixture("youtube", "trend_scout")
    data["selected_idea_id"] = "i9"
    with pytest.raises(ValidationError):
        youtube.TrendScout.model_validate(data)


def test_script_scene_times_must_increase():
    data = load_fixture("youtube", "script_writer")
    data["scenes"][1]["end_s"] = 2
    with pytest.raises(ValidationError):
        youtube.ScriptWriter.model_validate(data)


def test_script_visual_type_restricted():
    data = load_fixture("youtube", "script_writer")
    data["scenes"][0]["visual_type"] = "deepfake"
    with pytest.raises(ValidationError):
        youtube.ScriptWriter.model_validate(data)


def test_media_plan_fps_fixed():
    data = load_fixture("youtube", "media_producer.plan")
    data["output"]["fps"] = 60
    with pytest.raises(ValidationError):
        youtube.MediaProducerPlan.model_validate(data)


def test_media_qc_fail_needs_fixes():
    data = load_fixture("youtube", "media_producer.qc")
    data["fixes"] = []
    with pytest.raises(ValidationError):
        youtube.MediaProducerQc.model_validate(data)


def test_seo_must_schedule_private():
    data = load_fixture("youtube", "seo_upload")
    data["status_block"]["privacyStatus"] = "public"
    with pytest.raises(ValidationError):
        youtube.SeoUpload.model_validate(data)


def test_seo_title_and_tag_limits():
    data = load_fixture("youtube", "seo_upload")
    data["snippet"]["title"] = "x" * 71
    with pytest.raises(ValidationError):
        youtube.SeoUpload.model_validate(data)
    data = load_fixture("youtube", "seo_upload")
    data["snippet"]["tags"] = ["t" * 60] * 9  # 540 chars > 450
    with pytest.raises(ValidationError, match="450"):
        youtube.SeoUpload.model_validate(data)


def test_seo_publish_at_must_be_iso_utc():
    data = load_fixture("youtube", "seo_upload")
    data["status_block"]["publishAt"] = "tomorrow 5pm"
    with pytest.raises(ValidationError):
        youtube.SeoUpload.model_validate(data)


def test_seo_chapters_start_at_zero():
    data = load_fixture("youtube", "seo_upload")
    data["chapters"] = [{"time": "00:05", "label": "a"}, {"time": "00:20", "label": "b"},
                        {"time": "00:40", "label": "c"}]
    with pytest.raises(ValidationError, match="00:00"):
        youtube.SeoUpload.model_validate(data)


def test_growth_banker_label_restricted():
    data = load_fixture("youtube", "growth_banker")
    data["classification"][0]["label"] = "viral"
    with pytest.raises(ValidationError):
        youtube.GrowthBanker.model_validate(data)
