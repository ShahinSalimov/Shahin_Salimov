"""Pure functions that compute sales, fees, costs, net and balance. No LLM involvement.

Money is handled as Decimal and rounded to cents only for output. Gumroad's Ping sends ``price`` in
USD cents. Gumroad does not send its fee in the Ping, so fees are an *estimate* from a configurable
policy (GUMROAD_FEE_PERCENT + GUMROAD_FEE_FIXED_USD) and are flagged ``fees_are_estimated``.
Buyer personal data (email, name, address) is never stored.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation
from typing import Any

from core.db import JobStore

CENT = Decimal("0.01")


@dataclass(frozen=True)
class FeePolicy:
    percent: Decimal
    fixed_usd: Decimal


@dataclass(frozen=True)
class Sale:
    sale_id: str
    product_id: str | None
    product_name: str | None
    amount_usd: Decimal
    sold_at: str
    offer_code: str | None
    is_test: bool


def _money(v: Decimal) -> Decimal:
    return v.quantize(CENT, rounding=ROUND_HALF_UP)


def _usd(v: Decimal) -> float:
    return float(_money(v))


def sale_from_ping(form: dict[str, Any]) -> Sale:
    sale_id = (form.get("sale_id") or "").strip()
    if not sale_id:
        raise ValueError("ping without sale_id")
    try:
        cents = Decimal(str(form.get("price", "")).strip())
    except InvalidOperation:
        raise ValueError("ping price is not a number") from None
    if cents < 0:
        raise ValueError("ping price is negative")
    sold_at = form.get("sale_timestamp") or datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    return Sale(sale_id=sale_id, product_id=form.get("product_id") or None,
                product_name=form.get("product_name") or None, amount_usd=_money(cents / 100),
                sold_at=_normalize_ts(sold_at), offer_code=form.get("offer_code") or None,
                is_test=str(form.get("test", "")).lower() == "true")


def _normalize_ts(ts: str) -> str:
    """Ledger timestamps share the store format (microseconds + Z) so string ranges compare correctly."""
    try:
        dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
    except ValueError:
        dt = datetime.now(timezone.utc)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ")


def estimate_fee(amount: Decimal, policy: FeePolicy) -> Decimal:
    if amount <= 0:
        return Decimal("0")
    return min(amount, _money(amount * policy.percent / 100 + policy.fixed_usd))


def record_sale(store: JobStore, sale: Sale, policy: FeePolicy) -> bool:
    """Book the sale and its estimated fee. Returns False if the sale was already recorded."""
    if not store.insert_ledger("sale", float(sale.amount_usd), ref=f"sale:{sale.sale_id}",
                               product_id=sale.product_id, created_at=sale.sold_at):
        return False
    store.insert_ledger("fee", -float(estimate_fee(sale.amount_usd, policy)), ref=f"fee:{sale.sale_id}",
                        product_id=sale.product_id, created_at=sale.sold_at)
    if sale.product_id and sale.product_name:   # remembered for report lines (ledger has no name column)
        store.set_control(f"product_name:{sale.product_id}", sale.product_name)
    return True


def _day_bounds(day: str) -> tuple[str, str]:
    d = date.fromisoformat(day)
    nxt = d + timedelta(days=1)
    return f"{d.isoformat()}T00:00:00.000000Z", f"{nxt.isoformat()}T00:00:00.000000Z"


def _day_totals(store: JobStore, org: str, day: str) -> tuple[Decimal, Decimal, Decimal, list[dict]]:
    since, until = _day_bounds(day)
    rows = store.ledger_rows(since, until)
    gross = sum((Decimal(str(r["amount_usd"])) for r in rows if r["kind"] == "sale"), Decimal("0"))
    fees = -sum((Decimal(str(r["amount_usd"])) for r in rows if r["kind"] == "fee"), Decimal("0"))
    spend = Decimal(str(store.get_spend(org, day)))
    return gross, fees, spend, rows


def compute_ledger(store: JobStore, org: str, day: str, trend_days: int = 7) -> dict[str, Any]:
    gross, fees, spend, rows = _day_totals(store, org, day)

    by_product: dict[str, dict[str, Any]] = {}
    for r in rows:
        if r["kind"] != "sale":
            continue
        pid = r["product_id"] or "unknown"
        entry = by_product.setdefault(pid, {"product_id": pid, "name": store.get_control(f"product_name:{pid}"),
                                            "amounts": []})
        entry["amounts"].append(Decimal(str(r["amount_usd"])))
    sales = []
    for e in by_product.values():
        revenue = sum(e["amounts"], Decimal("0"))
        sales.append({"product_id": e["product_id"], "name": e["name"],
                      "price": _usd(max(e["amounts"])), "count": len(e["amounts"]), "revenue_usd": _usd(revenue)})
    sales.sort(key=lambda s: -s["revenue_usd"])

    trend = []
    d = date.fromisoformat(day)
    for i in range(trend_days - 1, -1, -1):
        dd = (d - timedelta(days=i)).isoformat()
        g, f, s, _ = _day_totals(store, org, dd)
        trend.append({"day": dd, "net_usd": _usd(g - f - s)})

    balance = Decimal(str(store.ledger_total())) - Decimal(str(store.total_spend(org)))
    return {
        "period": day,
        "gross_sales_usd": _usd(gross),
        "gumroad_fees_usd": _usd(fees),
        "fees_are_estimated": True,
        "llm_cost_usd": _usd(spend),
        "net_usd": _usd(gross - fees - spend),
        "balance_usd": _usd(balance),
        "sales": sales,
        "new_products_today": [{"name": p["name"], "url": p["gumroad_url"], "status": p["status"]}
                               for p in store.products_created_on(day)],
        "trend": trend,
    }
