from datetime import date

import pytest

from scc.catalog import BANNED_PHRASES
from scc.metadata import DISCLOSURE, MetadataError, TAGS_MAX, build_metadata, tags_length, validate
from scc.planner import RECENT_DAYS, Planner
from scc.prompts import build_production

START = date(2026, 11, 18)


@pytest.fixture(scope="module")
def plans():
    return Planner().plan_range(START, 90)


def test_one_long_and_one_short_per_day(plans):
    assert len(plans) == 180
    by_day = {}
    for p in plans:
        by_day.setdefault(p.publish_date, []).append(p.kind)
    assert all(sorted(k) == ["long", "short"] for k in by_day.values())


def test_planning_is_deterministic():
    a = [p.to_dict() for p in Planner().plan_range(START, 10)]
    b = [p.to_dict() for p in Planner().plan_range(START, 10)]
    assert a == b


def test_long_format_never_repeats_two_days_in_a_row(plans):
    longs = [p.format_key for p in plans if p.kind == "long"]
    assert all(x != y for x, y in zip(longs, longs[1:]))


def test_single_car_long_videos_do_not_reuse_recent_lead_car(plans):
    longs = [p for p in plans if p.kind == "long" and p.format_key == "speed_ladder"]
    for a, b in zip(longs, longs[1:]):
        gap = (date.fromisoformat(b.publish_date) - date.fromisoformat(a.publish_date)).days
        if gap <= RECENT_DAYS:
            assert a.car_keys != b.car_keys


def test_every_plan_produces_valid_metadata(plans):
    for p in plans:
        prod = build_production(p)
        meta = build_metadata(p, prod, channel_handle="@test")
        assert 0 < len(meta["title"]) <= 100
        assert tags_length(meta["tags"]) <= TAGS_MAX
        assert DISCLOSURE in meta["description"]
        assert meta["contains_synthetic_media"] is True
        for phrase in BANNED_PHRASES:
            assert phrase not in meta["title"].lower()
        if p.kind == "short":
            assert "#shorts" in meta["description"]
            assert prod["aspect"] == "9:16" and prod["duration_s"] <= 60
        else:
            assert prod["aspect"] == "16:9" and prod["duration_s"] >= 480
            assert "0:00 Intro" in meta["description"]


def test_prompts_are_english_and_forbid_people(plans):
    for p in plans[:20]:
        for seg in build_production(p)["segments"]:
            for c in seg["clips"]:
                assert "no people" in c["prompt"] and "no injuries" in c["prompt"]


def test_validate_rejects_deceptive_title(plans):
    p = plans[0]
    meta = build_metadata(p, build_production(p))
    meta["title"] = "Real footage: Bugatti crash caught on camera"
    with pytest.raises(MetadataError):
        validate(meta)


def test_short_teaser_links_to_long(plans):
    teasers = [p for p in plans if p.kind == "short" and p.linked_long_id]
    assert teasers
    meta = build_metadata(teasers[0], build_production(teasers[0]), long_url="https://youtu.be/abc")
    assert "Full crash test: https://youtu.be/abc" in meta["description"]


def test_article_helper():
    from scc.catalog import article
    assert article("exposed carbon fiber") == "an"
    assert article("SF90") == "an" and article("S680") == "an"
    assert article("ONE") == "a" and article("matte black") == "a" and article("Purosangue") == "a"


def test_long_lead_cars_rarely_repeat_within_10_days(plans):
    longs = [p for p in plans if p.kind == "long" and len(p.car_keys) == 1]
    repeats = 0
    for i, a in enumerate(longs):
        for b in longs[i + 1:]:
            gap = (date.fromisoformat(b.publish_date) - date.fromisoformat(a.publish_date)).days
            if gap < 10 and a.car_keys == b.car_keys:
                repeats += 1
    assert repeats == 0


def test_long_videos_are_wall_crashes_only(plans):
    from scc.catalog import SCENARIOS_BY_KEY
    assert all(SCENARIOS_BY_KEY[p.scenario_key].impact != "side" for p in plans if p.kind == "long")
