"""Tests for orgs.studio.tools.gumroad (HTTP mocked with responses)."""
import json
import zipfile

import pytest
import responses

from core.db import JobStore
from core.tools import NonRetryable, ToolContext
from orgs.studio.tools.gumroad import (API_BASE, ApiPublisher, BrowserPublisher, DraftPublisher,
                                       GumroadClient, GumroadError, PublishRequest, gumroad_publish_tool,
                                       slugify)


@pytest.fixture
def store(tmp_path):
    s = JobStore(tmp_path / "g.db", org="studio")
    yield s
    s.close()


def _ctx(store, key="r1:tools.publish:0"):
    return ToolContext(org="studio", run_id="r1", step="tools.publish", idempotency_key=key, state={}, store=store)


def _bundle(tmp_path):
    z = tmp_path / "bundle.zip"
    with zipfile.ZipFile(z, "w") as f:
        f.writestr("guide.pdf", b"%PDF-1.4 fake")
    return z


def _payload(tmp_path, **pricing):
    return {
        "product_spec": {"working_title": "Freelance Client Portal Kit", "category": "notion_template"},
        "listing": {"name": "Freelance Client Portal Kit", "summary": "Onboard clients fast",
                    "description_html": "<p>Ready portal.</p>", "tags": ["notion", "freelance"],
                    "custom_permalink": "client-portal-kit", "thumbnail_prompt": "t", "cover_prompt": "c",
                    "what_is_included": ["guide.pdf"]},
        "pricing": {"price_usd": 19.0, "pay_what_you_want": False, "min_price_usd": None,
                    "offer_code": {"code": "LAUNCH20", "percent_off": 20, "expires_at": "2026-11-19T06:00:00Z"},
                    **pricing},
        "bundle": {"bundle_path": str(_bundle(tmp_path)), "files": ["guide.pdf"]},
    }


def test_slugify():
    assert slugify("Freelance Client Portal Kit!") == "freelance-client-portal-kit"
    assert slugify("  Şablon: Büdcə  ") == "sablon-budce"


# --- client ---------------------------------------------------------------------------------------

@responses.activate
def test_client_sends_bearer_token_and_parses_success():
    responses.get(f"{API_BASE}/products", json={"success": True, "products": [{"id": "P1"}]})
    c = GumroadClient("tok-123")
    assert c.list_products() == [{"id": "P1"}]
    assert responses.calls[0].request.headers["Authorization"] == "Bearer tok-123"


@responses.activate
def test_client_offer_code_params():
    responses.post(f"{API_BASE}/products/P1/offer_codes", json={"success": True, "offer_code": {"id": "OC1"}})
    GumroadClient("t").create_offer_code("P1", code="LAUNCH20", percent_off=20)
    body = responses.calls[0].request.body
    assert "name=LAUNCH20" in body and "amount_off=20" in body and "offer_type=percent" in body


@responses.activate
@pytest.mark.parametrize("status", [401, 403, 404])
def test_client_auth_and_not_found_are_non_retryable(status):
    responses.get(f"{API_BASE}/sales/S1", json={"success": False, "message": "nope"}, status=status)
    with pytest.raises(NonRetryable):
        GumroadClient("t").get_sale("S1")


@responses.activate
@pytest.mark.parametrize("status", [429, 500, 503])
def test_client_rate_limit_and_server_errors_are_retryable(status):
    responses.get(f"{API_BASE}/sales/S1", body="err", status=status)
    with pytest.raises(GumroadError) as exc:
        GumroadClient("t").get_sale("S1")
    assert not isinstance(exc.value, NonRetryable)


@responses.activate
def test_client_success_false_is_non_retryable():
    responses.get(f"{API_BASE}/products", json={"success": False, "message": "bad token"})
    with pytest.raises(NonRetryable, match="bad token"):
        GumroadClient("t").list_products()


def test_client_token_not_in_repr():
    assert "secret" not in repr(GumroadClient("secret"))


# --- publishers ---------------------------------------------------------------------------------------

def _req(tmp_path):
    return PublishRequest(permalink="client-portal-kit", name="Kit", summary="s", description_html="<p>d</p>",
                          tags=["a"], price_usd=19.0, pay_what_you_want=False, min_price_usd=None,
                          bundle_path=str(_bundle(tmp_path)), offer_code={"code": "LAUNCH20", "percent_off": 20},
                          cover_prompt="c", thumbnail_prompt="t", what_is_included=["guide.pdf"])


def test_draft_publisher_writes_listing_and_bundle(tmp_path):
    res = DraftPublisher(tmp_path / "drafts").publish(_req(tmp_path))
    assert res["mode"] == "draft" and res["status"] == "draft_ready" and res["product_id"] is None
    d = tmp_path / "drafts" / "client-portal-kit"
    listing = json.loads((d / "listing.json").read_text())
    assert listing["price_usd"] == 19.0 and listing["offer_code"]["code"] == "LAUNCH20"
    assert (d / "client-portal-kit.zip").exists()
    assert "<p>d</p>" in (d / "listing.html").read_text()


@responses.activate
def test_api_publisher_unsupported_creation_is_non_retryable(tmp_path):
    responses.post(f"{API_BASE}/products", json={"success": False}, status=404)
    pub = ApiPublisher(GumroadClient("t"), DraftPublisher(tmp_path / "drafts"))
    with pytest.raises(NonRetryable, match="GUMROAD_PUBLISH_MODE=draft"):
        pub.publish(_req(tmp_path))


@responses.activate
def test_api_publisher_success_still_needs_manual_file_upload(tmp_path):
    responses.post(f"{API_BASE}/products",
                   json={"success": True, "product": {"id": "P7", "short_url": "https://gum.co/x"}})
    res = ApiPublisher(GumroadClient("t"), DraftPublisher(tmp_path / "drafts")).publish(_req(tmp_path))
    assert res["product_id"] == "P7" and res["url"] == "https://gum.co/x"
    assert res["status"] == "created_needs_file_upload"
    body = responses.calls[0].request.body
    assert "price=1900" in body and "custom_permalink=client-portal-kit" in body


def test_browser_publisher_not_implemented(tmp_path):
    with pytest.raises(NonRetryable):
        BrowserPublisher().publish(_req(tmp_path))


# --- publish tool ---------------------------------------------------------------------------------------

def test_publish_tool_records_product(tmp_path, store):
    tool = gumroad_publish_tool(DraftPublisher(tmp_path / "drafts"), client=None)
    out = tool(_payload(tmp_path), _ctx(store))
    assert out["status"] == "ok" and out["mode"] == "draft"
    assert out["topic_key"] == "freelance-client-portal-kit"
    prod = store.products()[0]
    assert prod["status"] == "draft_ready" and prod["price_usd"] == 19.0 and prod["id"] == "draft-r1"


def test_publish_tool_rejects_duplicate_topic(tmp_path, store):
    tool = gumroad_publish_tool(DraftPublisher(tmp_path / "drafts"), client=None)
    tool(_payload(tmp_path), _ctx(store))
    out = tool(_payload(tmp_path), _ctx(store, key="r2:tools.publish:0"))
    assert out["status"] == "rejected" and "duplicate" in out["errors"][0]


@responses.activate
def test_publish_tool_creates_offer_code_when_product_exists(tmp_path, store):
    responses.post(f"{API_BASE}/products", json={"success": True, "product": {"id": "P7", "short_url": "u"}})
    responses.post(f"{API_BASE}/products/P7/offer_codes", json={"success": True, "offer_code": {"id": "OC"}})
    client = GumroadClient("t")
    tool = gumroad_publish_tool(ApiPublisher(client, DraftPublisher(tmp_path / "d")), client=client)
    out = tool(_payload(tmp_path), _ctx(store))
    assert out["offer_code_created"] is True
    assert len(responses.calls) == 2
