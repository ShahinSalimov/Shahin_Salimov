"""STIX 2.1 and ArcSight CEF export formatting.

STIX output is validated with the OASIS ``stix2`` reference library, which
enforces required properties, ID formats, timestamp formats and patterning
grammar.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

import pytest
import stix2

from agents import CompanyStackProfile, StackComponent, ThreatPipeline
from backend.analysis_service import _apply_result
from backend.integrations.siem_exporter import (
    build_cef_events,
    build_stix_bundle,
    cef_escape_ext,
    cef_escape_header,
    stix_pattern,
)
from backend.models import ThreatEvent, ThreatSource
from backend.simulator import SCENARIOS_BY_ID

COMPANY = CompanyStackProfile(name="Acme", tech_stack=[StackComponent(key="nginx", label="Nginx"), StackComponent(key="aws", label="AWS")])


@pytest.fixture
async def analysed_event(pipeline: ThreatPipeline) -> ThreatEvent:
    raw = SCENARIOS_BY_ID["darkweb-nginx-0day"].payload + "\nCVE-2024-6387 also mentioned"
    result = await pipeline.run(raw, COMPANY, source="darkweb")
    event = ThreatEvent(
        id=uuid.UUID("11111111-2222-3333-4444-555555555555"),
        company_id=uuid.uuid4(),
        source=ThreatSource.DARK_WEB,
        raw_text=raw,
        content_hash=result.content_hash,
        ingested_at=datetime(2026, 11, 17, 9, 0, tzinfo=UTC),
    )
    _apply_result(event, result)
    event.analyzed_at = datetime(2026, 11, 17, 9, 0, 4, tzinfo=UTC)
    return event


def test_stix_bundle_is_valid_per_oasis_library(analysed_event: ThreatEvent) -> None:
    bundle = build_stix_bundle(analysed_event)
    parsed = stix2.parse(bundle, allow_custom=True)
    types = {o.type for o in parsed.objects}
    assert {"identity", "indicator", "attack-pattern", "vulnerability", "course-of-action", "relationship", "report", "threat-actor"} <= types


def test_stix_references_resolve_and_report_covers_everything(analysed_event: ThreatEvent) -> None:
    bundle = build_stix_bundle(analysed_event)
    ids = {o["id"] for o in bundle["objects"]}
    for o in bundle["objects"]:
        if o["type"] == "relationship":
            assert o["source_ref"] in ids and o["target_ref"] in ids
        assert o.get("created_by_ref", "identity--x") in ids or o["type"] == "identity"
    report = next(o for o in bundle["objects"] if o["type"] == "report")
    assert set(report["object_refs"]) == ids - {report["id"]}
    assert "spec_version" not in bundle  # STIX 2.1 bundles carry no spec_version


def test_stix_content_mapping(analysed_event: ThreatEvent) -> None:
    objs = build_stix_bundle(analysed_event)["objects"]
    patterns = {o["pattern"] for o in objs if o["type"] == "indicator"}
    assert "[ipv4-addr:value = '203.0.113.45']" in patterns
    assert "[file:hashes.MD5 = '9e107d9d372bb6826bd81d3542a419d6']" in patterns
    vuln = next(o for o in objs if o["type"] == "vulnerability")
    assert vuln["external_references"][0] == {"source_name": "cve", "external_id": "CVE-2024-6387", "url": "https://nvd.nist.gov/vuln/detail/CVE-2024-6387"}
    ap = next(o for o in objs if o["type"] == "attack-pattern" and o["external_references"][0]["external_id"] == "T1190")
    assert ap["kill_chain_phases"] == [{"kill_chain_name": "mitre-attack", "phase_name": "initial-access"}]
    assert any(o["type"] == "relationship" and o["relationship_type"] == "indicates" for o in objs)
    assert any(o["type"] == "relationship" and o["relationship_type"] == "mitigates" for o in objs)
    assert next(o for o in objs if o["type"] == "report")["created"] == "2026-11-17T09:00:04.000Z"


def test_stix_object_ids_are_deterministic(analysed_event: ThreatEvent) -> None:
    a = [o["id"] for o in build_stix_bundle(analysed_event)["objects"]]
    b = [o["id"] for o in build_stix_bundle(analysed_event)["objects"]]
    assert a == b


def test_stix_pattern_escaping() -> None:
    assert stix_pattern("url", "http://x.top/a'b\\c") == "[url:value = 'http://x.top/a\\'b\\\\c']"
    assert stix_pattern("sha256", "ab" * 32) == f"[file:hashes.'SHA-256' = '{'ab' * 32}']"
    assert stix_pattern("unknown", "x") is None


def test_unanalysed_event_cannot_be_exported() -> None:
    event = ThreatEvent(id=uuid.uuid4(), source=ThreatSource.MANUAL, raw_text="x", content_hash="h")
    with pytest.raises(ValueError):
        build_stix_bundle(event)
    with pytest.raises(ValueError):
        build_cef_events(event)


def test_cef_format(analysed_event: ThreatEvent) -> None:
    lines = build_cef_events(analysed_event)
    assert len(lines) == 1 + sum(1 for i in analysed_event.indicators if i["type"] != "cve")
    header = lines[0]
    # CEF:Version|Vendor|Product|Version|SignatureID|Name|Severity|Extension
    parts = header.split("|", 7)
    assert parts[:5] == ["CEF:0", "AegisPulse", "Threat Intelligence Platform", "1.0", "AEGIS-THREAT"]
    assert parts[6] == "10"
    assert "cs1Label=MITRE ATT&CK" in parts[7] and "T1190" in parts[7]
    assert "cs2=CVE-2024-6387" in parts[7]
    assert f"externalId={analysed_event.id}" in parts[7]
    ip_line = next(line for line in lines if "AEGIS-IOC-IPV4" in line and "203.0.113.45" in line)
    assert "src=203.0.113.45" in ip_line
    assert all("\n" not in line for line in lines)


def test_cef_escaping() -> None:
    assert cef_escape_header("a|b\\c") == "a\\|b\\\\c"
    assert cef_escape_ext("k=v\nnext\\") == "k\\=v\\nnext\\\\"
