"""GumroadClient and Publisher strategies (ApiPublisher, BrowserPublisher, DraftPublisher).

Verified facts (Gumroad API v2, https://api.gumroad.com/v2): products list/get/delete,
enable/disable, offer codes, sales list/get, resource subscriptions (sale pings).

NOT verified: creating a product via ``POST /v2/products``. A mirror of Gumroad's own API docs
states "Product creation via API is not currently supported", and no file upload endpoint is
documented. Therefore:

- ``DraftPublisher`` (default, GUMROAD_PUBLISH_MODE=draft): writes listing.json, listing.html and the
  bundle zip to data/drafts/<permalink>/ for a one-time manual upload.
- ``ApiPublisher``: tries POST /products; a 404 becomes a NonRetryable error that says to use draft
  mode. Even on success the files still need a manual upload, so a draft is always written too.
- ``BrowserPublisher``: not implemented (dashboard automation is brittle); always NonRetryable.
"""
from __future__ import annotations

import json
import re
import shutil
import unicodedata
from dataclasses import asdict, dataclass, field
from html import escape
from pathlib import Path
from typing import Any, Protocol

import requests

from core.guards import RateLimiter
from core.tools import NonRetryable, ToolContext

API_BASE = "https://api.gumroad.com/v2"


class GumroadError(Exception):
    """Retryable Gumroad failure (rate limit, server error, network)."""

    def __init__(self, message: str, status: int | None = None):
        super().__init__(message)
        self.status = status


class GumroadRejected(NonRetryable):
    def __init__(self, message: str, status: int | None = None):
        super().__init__(message)
        self.status = status


def slugify(text: str) -> str:
    text = text.replace("ə", "e").replace("Ə", "E").replace("ı", "i").replace("İ", "I")
    norm = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", norm.lower()).strip("-")


class GumroadClient:
    def __init__(self, token: str, base_url: str = API_BASE, timeout: float = 20.0,
                 limiter: RateLimiter | None = None, session: requests.Session | None = None):
        self._token = token
        self.base_url, self.timeout = base_url.rstrip("/"), timeout
        self.limiter = limiter
        self.session = session or requests.Session()

    def __repr__(self) -> str:
        return f"GumroadClient(base_url={self.base_url!r})"

    def _request(self, method: str, path: str, *, data: dict | None = None,
                 params: dict | None = None) -> dict[str, Any]:
        if self.limiter:
            self.limiter.acquire("gumroad")
        try:
            res = self.session.request(method, f"{self.base_url}{path}", data=data, params=params,
                                       headers={"Authorization": f"Bearer {self._token}"}, timeout=self.timeout)
        except requests.RequestException as e:
            raise GumroadError(f"gumroad {method} {path}: {type(e).__name__}") from None
        if res.status_code == 429 or res.status_code >= 500:
            raise GumroadError(f"gumroad {method} {path}: HTTP {res.status_code}", res.status_code)
        try:
            body = res.json()
        except ValueError:
            body = {}
        if res.status_code >= 400:
            raise GumroadRejected(f"gumroad {method} {path}: HTTP {res.status_code} {body.get('message', '')}".strip(),
                                  res.status_code)
        if body.get("success") is False:
            raise GumroadRejected(f"gumroad {method} {path}: {body.get('message', 'success=false')}", res.status_code)
        return body

    # products
    def list_products(self) -> list[dict]:
        return self._request("GET", "/products").get("products", [])

    def get_product(self, product_id: str) -> dict:
        return self._request("GET", f"/products/{product_id}").get("product", {})

    def enable_product(self, product_id: str) -> dict:
        return self._request("PUT", f"/products/{product_id}/enable").get("product", {})

    def disable_product(self, product_id: str) -> dict:
        return self._request("PUT", f"/products/{product_id}/disable").get("product", {})

    def create_product(self, fields: dict[str, Any]) -> dict:
        """Unverified endpoint; see module docstring."""
        return self._request("POST", "/products", data=fields).get("product", {})

    # offer codes
    def create_offer_code(self, product_id: str, *, code: str, percent_off: float) -> dict:
        data = {"name": code, "amount_off": int(percent_off), "offer_type": "percent"}
        return self._request("POST", f"/products/{product_id}/offer_codes", data=data).get("offer_code", {})

    def delete_offer_code(self, product_id: str, offer_code_id: str) -> None:
        self._request("DELETE", f"/products/{product_id}/offer_codes/{offer_code_id}")

    # sales & pings
    def get_sale(self, sale_id: str) -> dict:
        return self._request("GET", f"/sales/{sale_id}").get("sale", {})

    def list_sales(self, *, after: str | None = None, page_key: str | None = None) -> dict:
        params = {k: v for k, v in {"after": after, "page_key": page_key}.items() if v}
        return self._request("GET", "/sales", params=params)

    def subscribe_sales(self, post_url: str) -> dict:
        return self._request("PUT", "/resource_subscriptions",
                             data={"resource_name": "sale", "post_url": post_url})


# --- publishers ---------------------------------------------------------------------------------------

@dataclass
class PublishRequest:
    permalink: str
    name: str
    summary: str
    description_html: str
    tags: list[str]
    price_usd: float
    pay_what_you_want: bool
    min_price_usd: float | None
    bundle_path: str
    offer_code: dict[str, Any] | None = None
    cover_prompt: str = ""
    thumbnail_prompt: str = ""
    what_is_included: list[str] = field(default_factory=list)


class Publisher(Protocol):
    def publish(self, req: PublishRequest) -> dict[str, Any]: ...


class DraftPublisher:
    def __init__(self, drafts_dir: str | Path):
        self.drafts_dir = Path(drafts_dir)

    def publish(self, req: PublishRequest) -> dict[str, Any]:
        out = self.drafts_dir / req.permalink
        out.mkdir(parents=True, exist_ok=True)
        bundle = out / f"{req.permalink}.zip"
        shutil.copyfile(req.bundle_path, bundle)
        (out / "listing.json").write_text(json.dumps(asdict(req) | {"bundle_path": str(bundle)},
                                                     ensure_ascii=False, indent=2), encoding="utf-8")
        tags = ", ".join(escape(t) for t in req.tags)
        (out / "listing.html").write_text(
            f"<!doctype html><meta charset='utf-8'><title>{escape(req.name)}</title>"
            f"<h1>{escape(req.name)}</h1><p><b>Price:</b> ${req.price_usd:.2f}</p>"
            f"<p><b>Summary:</b> {escape(req.summary)}</p><p><b>Tags:</b> {tags}</p>"
            f"<p><b>Permalink:</b> {escape(req.permalink)}</p><hr>{req.description_html}",
            encoding="utf-8")
        return {"mode": "draft", "status": "draft_ready", "product_id": None, "url": None,
                "draft_path": str(out)}


class ApiPublisher:
    def __init__(self, client: GumroadClient, draft: DraftPublisher):
        self.client, self.draft = client, draft

    def publish(self, req: PublishRequest) -> dict[str, Any]:
        fields = {"name": req.name, "price": int(round(req.price_usd * 100)), "description": req.description_html,
                  "custom_permalink": req.permalink, "customizable_price": str(req.pay_what_you_want).lower()}
        try:
            product = self.client.create_product(fields)
        except GumroadRejected as e:
            raise NonRetryable(f"Gumroad did not accept product creation ({e}). Creating products via the API "
                               f"is not confirmed by Gumroad's docs; set GUMROAD_PUBLISH_MODE=draft.") from None
        draft = self.draft.publish(req)
        return {"mode": "api", "status": "created_needs_file_upload", "product_id": product.get("id"),
                "url": product.get("short_url"), "draft_path": draft["draft_path"]}


class BrowserPublisher:
    def publish(self, req: PublishRequest) -> dict[str, Any]:
        raise NonRetryable("GUMROAD_PUBLISH_MODE=browser is not implemented; use draft")


def gumroad_publish_tool(publisher: Publisher, client: GumroadClient | None):
    """Pipeline tool (idempotent step): publish, create launch offer code, record the product."""

    def publish(payload: dict[str, Any], ctx: ToolContext) -> dict[str, Any]:
        spec, listing, pricing = payload["product_spec"], payload["listing"], payload["pricing"]
        topic_key = slugify(spec["working_title"])
        if ctx.store.topic_exists(topic_key):
            return {"status": "rejected", "errors": [f"duplicate topic {topic_key!r} already in catalog"]}
        req = PublishRequest(
            permalink=slugify(listing["custom_permalink"]) or topic_key, name=listing["name"],
            summary=listing["summary"], description_html=listing["description_html"], tags=listing["tags"],
            price_usd=float(pricing["price_usd"]), pay_what_you_want=bool(pricing.get("pay_what_you_want")),
            min_price_usd=pricing.get("min_price_usd"), bundle_path=payload["bundle"]["bundle_path"],
            offer_code=pricing.get("offer_code"), cover_prompt=listing.get("cover_prompt", ""),
            thumbnail_prompt=listing.get("thumbnail_prompt", ""),
            what_is_included=listing.get("what_is_included", []))
        result = publisher.publish(req)

        offer_created = False
        if result.get("product_id") and client and req.offer_code:
            client.create_offer_code(result["product_id"], code=req.offer_code["code"],
                                     percent_off=req.offer_code["percent_off"])
            offer_created = True

        ctx.store.insert_product(id=result.get("product_id") or f"draft-{ctx.run_id}", run_id=ctx.run_id,
                                 name=req.name, topic_key=topic_key, price_usd=req.price_usd,
                                 gumroad_url=result.get("url"), status=result["status"])
        published = {k: v for k, v in result.items() if k != "status"}
        return {"status": "ok", "publish_status": result["status"], **published, "topic_key": topic_key, "name": req.name, "price_usd": req.price_usd,
                "offer_code": req.offer_code, "offer_code_created": offer_created}

    return publish


def build_publisher(mode: str, data_dir: Path, client: GumroadClient | None) -> Publisher:
    draft = DraftPublisher(data_dir / "drafts")
    if mode == "draft":
        return draft
    if mode == "api":
        if client is None:
            raise ValueError("GUMROAD_PUBLISH_MODE=api needs GUMROAD_ACCESS_TOKEN")
        return ApiPublisher(client, draft)
    return BrowserPublisher()
