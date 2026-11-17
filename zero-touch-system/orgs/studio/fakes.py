"""Development-only fakes for the studio org: scripted agent responses and a deterministic signal source.

Used by scripts/dry_run.py and the test suite (selected with SIGNAL_SOURCES=fake and a FakeLLM).
Responses are built from the validated fixtures in tests/fixtures/studio/, so every fake output also
passes the real Pydantic schemas. Never used in production paths.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Callable

FIXTURES = Path(__file__).resolve().parents[2] / "tests" / "fixtures" / "studio"


def _fx(name: str) -> dict[str, Any]:
    return json.loads((FIXTURES / f"{name}.json").read_text(encoding="utf-8"))


def _request(messages: list[dict[str, Any]]) -> dict[str, Any]:
    content = messages[0]["content"]
    obj, _ = json.JSONDecoder().raw_decode(content)   # corrective retries append text after the JSON
    return obj


SECTION_CONTENT = [
    ("guide.md", "markdown", "# Setup\n\n1. Duplicate the Notion template into your workspace.\n"
                             "2. Rename the portal to your studio name.\n- Keep the intake form public."),
    ("guide.md", "markdown", "## Intake form\n\nAsk for budget, deadline and scope.\n\n"
                             "```\nBudget: ___\nDeadline: ___\n```"),
    ("portal.csv", "csv", "Client,Status,Due,Budget\nAcme,Active,2026-12-01,1200\nBeta,Lead,2026-12-15,800"),
]


def _section(index: int) -> dict[str, Any]:
    target, fmt, content = SECTION_CONTENT[index % len(SECTION_CONTENT)]
    return {"status": "ok", "errors": [], "confidence": 0.85, "build_step": "section", "section_index": index,
            "section_title": f"Section {index + 1}", "target_file": target, "content_format": fmt,
            "content": content, "section_summary": f"Section {index + 1} covers {target}.", "revision_log": []}


def _banker_report(ledger: dict[str, Any]) -> dict[str, Any]:
    msg = (f"{ledger['period']} gündəlik hesabat\n"
           f"Brutto: {ledger['gross_sales_usd']:.2f} USD\n"
           f"Komissiya (təxmini): {ledger['gumroad_fees_usd']:.2f} USD\n"
           f"AI xərci: {ledger['llm_cost_usd']:.2f} USD\n"
           f"Xalis: {ledger['net_usd']:.2f} USD\n"
           f"Balans: {ledger['balance_usd']:.2f} USD")
    return {"status": "ok", "errors": [], "confidence": 0.9, "mode": "report", "whatsapp_message": msg[:900],
            "alert_level": "none", "recommendations": []}


def fake_llm_script() -> dict[str, Callable[[str, list[dict[str, Any]]], dict[str, Any]]]:
    """FakeLLM script: one callable per agent that answers according to the request's mode."""

    def ceo(system, messages):
        return _fx("ceo.plan") if _request(messages)["payload"]["mode"] == "plan" else _fx("ceo.decide")

    def research(system, messages):
        return _fx("research")

    def content(system, messages):
        payload = _request(messages)["payload"]
        if payload["mode"] == "listing":
            return _fx("content.listing")
        return _section(int(payload["section_index"]))

    def philosopher(system, messages):
        mode = _request(messages)["payload"]["mode"]
        return _fx("philosopher.review") if mode == "review" else _fx("philosopher.reflect")

    def banker(system, messages):
        payload = _request(messages)["payload"]
        return _fx("banker.pricing") if payload["mode"] == "pricing" else _banker_report(payload["ledger"])

    return {"ceo": ceo, "research": research, "content": content, "philosopher": philosopher, "banker": banker}


class FakeSignalSource:
    name = "fake"

    def fetch(self, keywords: list[str]) -> list[dict[str, Any]]:
        return [{"source": "fake", "keyword": kw, "title": f"Discussion about {kw} #{i}", "score": 100 * (i + 1),
                 "num_comments": 10 * i, "url": f"https://example.com/{kw.replace(' ', '-')}/{i}"}
                for kw in keywords for i in range(2)]
