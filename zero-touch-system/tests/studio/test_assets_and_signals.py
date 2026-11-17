"""Tests for product file generation and market signal collection."""
import zipfile

import openpyxl
import pytest
import responses

from core.db import JobStore
from core.tools import ToolContext
from orgs.studio.tools.build_assets import build_bundle, build_product_files_tool, latest_sections
from orgs.studio.tools.market_signals import (HackerNewsSource, RedditSource, SourceUnavailable,
                                              collect_market_signals_tool)
from tests.conftest import load_fixture

SPEC = load_fixture("studio", "ceo.decide")["product_spec"]          # guide.pdf + portal.csv
LISTING = load_fixture("studio", "content.listing")["listing"]


def _section(i, target, fmt, content):
    return {"status": "ok", "errors": [], "confidence": 0.9, "build_step": "section", "section_index": i,
            "section_title": f"S{i}", "target_file": target, "content_format": fmt, "content": content,
            "section_summary": f"sum {i}", "revision_log": []}


SECTIONS = [
    _section(0, "guide.md", "markdown", "# Setup\n\n1. Duplicate the template.\n- **Bold** item\n\nŞablon üçün qeyd."),
    _section(1, "guide.md", "markdown", "## Intake form\n\n```\ncode block\n```\nText."),
    _section(2, "portal.csv", "csv", "Client,Status,Due\nAcme,Active,2026-12-01\nBeta,Lead,2026-12-15"),
]


@pytest.fixture
def store(tmp_path):
    s = JobStore(tmp_path / "a.db", org="studio")
    yield s
    s.close()


# --- build_assets ---------------------------------------------------------------------------------

def test_latest_sections_keeps_last_per_index():
    old = _section(0, "guide.md", "markdown", "old")
    new = _section(0, "guide.md", "markdown", "new")
    assert [s["content"] for s in latest_sections([old, SECTIONS[1], new])] == ["new", SECTIONS[1]["content"]]


def test_build_bundle_creates_pdf_xlsx_csv_and_zip(tmp_path):
    spec = {**SPEC, "deliverables": SPEC["deliverables"] + [
        {"file_name": "portal.xlsx", "format": "xlsx", "description": "Excel version"}]}
    res = build_bundle(spec, LISTING, SECTIONS, tmp_path / "out")
    files = {f["file_name"]: f for f in res["assets_manifest"]}
    assert set(files) == {"guide.pdf", "portal.csv", "portal.xlsx"}
    assert (tmp_path / "out" / "guide.pdf").read_bytes().startswith(b"%PDF")
    assert files["guide.pdf"]["bytes"] > 500
    assert "Duplicate the template" in files["guide.pdf"]["excerpt"]
    wb = openpyxl.load_workbook(tmp_path / "out" / "portal.xlsx")
    assert [c.value for c in wb.active[1]] == ["Client", "Status", "Due"]
    assert wb.active.max_row == 3
    with zipfile.ZipFile(res["bundle_path"]) as z:
        assert set(z.namelist()) == {"guide.pdf", "portal.csv", "portal.xlsx"}
    assert res["missing_deliverables"] == []


def test_missing_deliverable_is_reported(tmp_path):
    res = build_bundle(SPEC, LISTING, SECTIONS[:2], tmp_path / "out")
    assert res["missing_deliverables"] == ["portal.csv"]


def test_unmatched_sections_go_to_extra_file(tmp_path):
    extra = _section(3, "bonus.md", "markdown", "# Bonus")
    res = build_bundle(SPEC, LISTING, SECTIONS + [extra], tmp_path / "out")
    assert "bonus.md" in {f["file_name"] for f in res["assets_manifest"]}


def test_pdf_without_unicode_font_degrades_instead_of_crashing(tmp_path):
    res = build_bundle(SPEC, LISTING, SECTIONS, tmp_path / "out", font_path="/nonexistent.ttf")
    assert (tmp_path / "out" / "guide.pdf").read_bytes().startswith(b"%PDF")
    assert res["warnings"]


def test_build_tool_uses_revision_round_dir(tmp_path, store):
    tool = build_product_files_tool(tmp_path / "data")
    ctx = ToolContext(org="studio", run_id="r1", step="tools.build_assets", idempotency_key="k",
                      state={"revision_round": 1}, store=store)
    out = tool({"product_spec": SPEC, "listing": LISTING, "sections": SECTIONS}, ctx)
    assert out["status"] == "ok"
    assert "/products/r1/round-1/" in out["bundle_path"]


# --- market signals ---------------------------------------------------------------------------------

REDDIT_JSON = {"data": {"children": [{"data": {"title": "Best Notion client portal?", "score": 812,
                                               "num_comments": 40, "subreddit": "Notion",
                                               "permalink": "/r/Notion/comments/abc/x/", "created_utc": 1763280000}}]}}
HN_JSON = {"hits": [{"title": "Show HN: Client portal in Notion", "points": 120, "num_comments": 33,
                     "objectID": "999", "created_at": "2026-11-10T10:00:00Z"}]}


@responses.activate
def test_reddit_source_parses_and_sets_user_agent():
    responses.get("https://www.reddit.com/search.json", json=REDDIT_JSON)
    sigs = RedditSource().fetch(["notion client portal"])
    assert sigs == [{"source": "reddit", "keyword": "notion client portal", "subreddit": "Notion",
                     "title": "Best Notion client portal?", "score": 812, "num_comments": 40,
                     "url": "https://www.reddit.com/r/Notion/comments/abc/x/",
                     "created_utc": "2025-11-16T08:00:00Z"}]
    assert responses.calls[0].request.headers["User-Agent"] == "zero-touch-research/1.0"


@responses.activate
def test_hackernews_source_parses():
    responses.get("https://hn.algolia.com/api/v1/search", json=HN_JSON)
    sigs = HackerNewsSource().fetch(["client portal"])
    assert sigs[0]["url"] == "https://news.ycombinator.com/item?id=999"
    assert sigs[0]["score"] == 120


class _Static:
    def __init__(self, name, signals=None, error=None):
        self.name, self.signals, self.error = name, signals or [], error

    def fetch(self, keywords):
        if self.error:
            raise self.error
        return [dict(s, keyword=k) for k in keywords for s in self.signals]


def test_collect_degrades_gracefully_and_dedups(store):
    store.insert_product(id="p", run_id="r", name="Old Kit", topic_key="old-kit", price_usd=9,
                         gumroad_url=None, status="published")
    tool = collect_market_signals_tool([
        _Static("a", [{"source": "a", "title": "t1", "url": "u1"}]),
        _Static("b", error=ConnectionError("blocked")),
        _Static("c", error=SourceUnavailable("pytrends not installed")),
    ])
    ctx = ToolContext(org="studio", run_id="r", step="s", idempotency_key="k", state={}, store=store)
    brief = load_fixture("studio", "ceo.plan")["research_brief"]
    out = tool({"research_brief": brief}, ctx)
    assert out["status"] == "ok"
    assert len(out["raw_signals"]) == 1                      # same url from several keywords -> one signal
    assert set(out["source_errors"]) == {"b", "c"}
    assert "old-kit" in out["history_topics"]
    assert out["research_brief"] == brief


def test_collect_raises_when_every_source_fails(store):
    tool = collect_market_signals_tool([_Static("b", error=ConnectionError("blocked"))])
    ctx = ToolContext(org="studio", run_id="r", step="s", idempotency_key="k", state={}, store=store)
    with pytest.raises(ConnectionError):
        tool({"research_brief": load_fixture("studio", "ceo.plan")["research_brief"]}, ctx)
