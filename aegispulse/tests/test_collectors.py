"""Collectors and the collector runner, against recorded-format fixtures."""

from __future__ import annotations

import json
from pathlib import Path

import httpx
import pytest

from backend.collectors import CollectorError, is_security_relevant
from backend.collectors.darkweb_feed import DarkwebFeedCollector
from backend.collectors.nvd import NvdCollector, render_cve
from backend.collectors.paste import PasteCollector
from backend.collectors.telegram import TelegramCollector, parse_preview
from backend.config import Settings

FIXTURES = Path(__file__).parent / "fixtures"


def _settings(**kw) -> Settings:  # noqa: ANN003
    return Settings(_env_file=None, **kw)


def _client(handler) -> httpx.AsyncClient:  # noqa: ANN001
    return httpx.AsyncClient(transport=httpx.MockTransport(handler))


# ------------------------------------------------------------------ filter


def test_relevance_filter() -> None:
    assert is_security_relevant("Fresh combolist dump with 2M credentials for banking portals, validated today")
    assert is_security_relevant("New exploit for CVE-2024-6387 works on Ubuntu, PoC in comments, RCE as root")
    assert not is_security_relevant("Good morning everyone! Our channel reached 10k subscribers, thanks for the support")
    assert not is_security_relevant("short")


# --------------------------------------------------------------------- NVD


def test_render_cve_formats_kev_cvss_and_products() -> None:
    cve = json.loads((FIXTURES / "nvd_page.json").read_text())["vulnerabilities"][0]["cve"]
    item = render_cve(cve)
    assert item is not None and item.stack_gated
    assert item.text.startswith("NVD FEED ITEM: CVE-2024-6387  (CVSS v3.1 8.1 HIGH")
    assert "CISA KEV" not in item.text
    assert "openbsd openssh (>=8.5p1, <9.8p1)" in item.text
    assert "openbsd openssh" in item.technologies
    assert item.source_ref == "https://nvd.nist.gov/vuln/detail/CVE-2024-6387"


async def test_nvd_collector_filters_paginates_and_advances_cursor() -> None:
    page = json.loads((FIXTURES / "nvd_page.json").read_text())
    calls: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        return httpx.Response(200, json=page)

    settings = _settings(NVD_API_KEY="nvd-key", NVD_MIN_CVSS=7.0)
    async with _client(handler) as http:
        items, state = await NvdCollector(settings, http).collect({})
    ids = [i.source_ref.rsplit("/", 1)[1] for i in items]
    # 8.1 kept, 5.3 dropped, 5.3-but-KEV kept, rejected dropped.
    assert ids == ["CVE-2024-6387", "CVE-2099-0002"]
    assert "CISA KEV: actively exploited" in items[1].text
    assert len(calls) == 1
    assert calls[0].headers["apiKey"] == "nvd-key"
    params = calls[0].url.params
    assert params["lastModStartDate"].endswith("+00:00") and params["resultsPerPage"] == "200"
    assert "last_modified" in state


async def test_nvd_errors_are_reported() -> None:
    async with _client(lambda r: httpx.Response(403)) as http:
        with pytest.raises(CollectorError, match="HTTP 403"):
            await NvdCollector(_settings(), http).collect({})


# ---------------------------------------------------------------- Telegram


def test_parse_telegram_preview() -> None:
    msgs = parse_preview((FIXTURES / "telegram_preview.html").read_text())
    assert [m["id"] for m in msgs] == [101, 102, 103]
    assert msgs[0]["text"].startswith("FRESH DROP: 1,400 AWS keypairs")
    assert "AKIAIOSFODNN7EXAMPLE" in msgs[0]["text"] and "\n" in msgs[0]["text"]
    assert msgs[1]["datetime"] == "2026-11-17T09:10:00+00:00"


async def test_telegram_collector_filters_and_tracks_last_id() -> None:
    html = (FIXTURES / "telegram_preview.html").read_text()
    seen_urls: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen_urls.append(str(request.url))
        return httpx.Response(200, text=html)

    settings = _settings(TELEGRAM_CHANNELS="cloudleaks_daily,bad channel!,@lockbyte_partners")
    async with _client(handler) as http:
        collector = TelegramCollector(settings, http)
        assert collector.channels() == ["cloudleaks_daily", "lockbyte_partners"]
        items, state = await collector.collect({})
        assert [i.source_ref for i in items] == ["https://t.me/cloudleaks_daily/101", "https://t.me/cloudleaks_daily/103"] * 2
        assert state["last_ids"] == {"cloudleaks_daily": 103, "lockbyte_partners": 103}
        again, _ = await collector.collect(state)
    assert again == []
    assert seen_urls[0] == "https://t.me/s/cloudleaks_daily"


def test_telegram_requires_channels() -> None:
    ok, reason = TelegramCollector(_settings(), httpx.AsyncClient()).configured()
    assert not ok and "TELEGRAM_CHANNELS" in reason


# ------------------------------------------------------------------- Paste


async def test_paste_collector() -> None:
    listing = [
        {"key": "AAAA1111", "date": "1700000100", "title": "db leak", "size": "300", "syntax": "text", "full_url": "https://pastebin.com/AAAA1111"},
        {"key": "BBBB2222", "date": "1700000200", "title": "recipe", "size": "120", "syntax": "text"},
        {"key": "CCCC3333", "date": "1700000050", "title": "old", "size": "50", "syntax": "text"},
        {"key": "../evil", "date": "1700000300", "title": "x", "size": "10"},
    ]
    bodies = {
        "AAAA1111": "Leaked database dump of acme payments: admin credentials and API key AKIAIOSFODNN7EXAMPLE, breach confirmed",
        "BBBB2222": "Grandma's cookie recipe: flour, sugar, butter, two eggs and a lot of love for everyone",
    }

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("api_scraping.php"):
            return httpx.Response(200, json=listing)
        return httpx.Response(200, text=bodies[request.url.params["i"]])

    async with _client(handler) as http:
        items, state = await PasteCollector(_settings(), http).collect({"last_date": 1700000060})
    assert [i.source_ref for i in items] == ["https://pastebin.com/AAAA1111"]
    assert state == {"last_date": 1700000300}


async def test_paste_reports_non_whitelisted_ip() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, text="YOUR IP: 203.0.113.9 DOES NOT HAVE ACCESS. VISIT: https://pastebin.com/doc_scraping_api")

    async with _client(handler) as http:
        with pytest.raises(CollectorError, match="DOES NOT HAVE ACCESS"):
            await PasteCollector(_settings(), http).collect({})


# ---------------------------------------------------------- Dark-web feed


async def test_darkweb_feed_collector() -> None:
    payload = {
        "items": [
            {"id": "f-1", "text": "Initial access to EU fintech via VPN for sale", "url": "https://vendor.example/i/1", "published_at": "2026-11-17T08:00:00Z"},
            {"id": "f-2", "text": "", "published_at": "2026-11-17T09:00:00Z"},
            {"id": "f-3", "text": "Ransomware affiliate recruiting", "published_at": "2026-11-17T10:00:00+02:00"},
        ]
    }
    captured: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        captured.append(request)
        return httpx.Response(200, json=payload)

    settings = _settings(DARKWEB_FEED_URL="https://vendor.example/feed", DARKWEB_FEED_TOKEN="tok")
    async with _client(handler) as http:
        collector = DarkwebFeedCollector(settings, http)
        items, state = await collector.collect({})
        again, _ = await collector.collect(state)
    assert [i.source_ref for i in items] == ["https://vendor.example/i/1", "darkweb-feed://f-3"]
    assert state["since"] == "2026-11-17T08:00:00+00:00"  # 10:00+02:00 == 08:00Z
    assert captured[0].headers["authorization"] == "Bearer tok"
    assert captured[1].url.params["since"] == state["since"]
    assert again == []


def test_darkweb_feed_requires_https() -> None:
    ok, reason = DarkwebFeedCollector(_settings(DARKWEB_FEED_URL="http://x.example"), httpx.AsyncClient()).configured()
    assert not ok and "HTTPS" in reason


# ----------------------------------------------------------- runner (DB)


async def test_runner_ingests_stack_gated_items_and_dedups(app_client, drain, fake_anthropic) -> None:  # noqa: ANN001
    from backend.collector_runner import run_collector
    from backend.config import get_settings

    page = json.loads((FIXTURES / "nvd_page.json").read_text())
    settings = get_settings()
    async with _client(lambda r: httpx.Response(200, json=page)) as http:
        collector = NvdCollector(settings, http)
        first = await run_collector(collector, settings)
        await drain()
        second = await run_collector(collector, settings)
    # Demo company runs OpenSSH (matches CVE-2024-6387) but not the fictional widget server (CVE-2099-0002).
    assert first == {"name": "nvd", "ingested": 1, "error": None}
    assert second["ingested"] == 0  # deduplicated
    threats = (await app_client.get("/api/threats")).json()["items"]
    assert [t["source"] for t in threats] == ["nvd"]
    assert threats[0]["status"] == "analyzed"

    status = {c["name"]: c for c in (await app_client.get("/api/collectors")).json()}
    assert status["nvd"]["items_ingested_total"] == 1 and status["nvd"]["last_error"] is None
    assert status["telegram"]["configured"] is False


async def test_runner_records_errors_and_run_requests(app_client) -> None:  # noqa: ANN001
    from backend.collector_runner import due_collectors, run_collector
    from backend.collectors import build_collectors
    from backend.config import get_settings

    settings = get_settings()
    r = await app_client.post("/api/collectors/paste/run")
    assert r.status_code == 202 and r.json()["run_requested"] is True
    assert (await app_client.post("/api/collectors/nope/run")).status_code == 404

    async with _client(lambda r: httpx.Response(500)) as http:
        due = await due_collectors(build_collectors(settings, http), settings)
        assert [c.name for c in due] == ["paste"]  # not enabled, but explicitly requested
        result = await run_collector(due[0], settings)
    assert "HTTP 500" in result["error"]
    paste = next(c for c in (await app_client.get("/api/collectors")).json() if c["name"] == "paste")
    assert paste["run_requested"] is False and "HTTP 500" in paste["last_error"]
