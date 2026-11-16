"""Tests for orgs.studio.tools.ledger (pure money math; no LLM)."""
from decimal import Decimal

import pytest
from freezegun import freeze_time

from core.db import JobStore
from orgs.studio.tools.ledger import (FeePolicy, compute_ledger, estimate_fee, record_sale,
                                      sale_from_ping)

PING = {"sale_id": "S1", "product_id": "P1", "product_name": "Client Portal Kit", "price": "1900",
        "sale_timestamp": "2026-11-16T10:00:00Z", "offer_code": "", "email": "buyer@example.com"}


@pytest.fixture
def store(tmp_path):
    s = JobStore(tmp_path / "l.db", org="studio")
    yield s
    s.close()


def test_sale_from_ping_converts_cents():
    sale = sale_from_ping(PING)
    assert sale.sale_id == "S1"
    assert sale.amount_usd == Decimal("19.00")
    assert sale.product_name == "Client Portal Kit"
    assert sale.offer_code is None
    assert sale.is_test is False


def test_sale_from_ping_does_not_keep_buyer_email():
    assert "email" not in sale_from_ping(PING).__dict__


@pytest.mark.parametrize("bad", [{}, {"sale_id": "S1"}, {"sale_id": "S1", "price": "abc"},
                                 {"sale_id": "S1", "price": "-5"}])
def test_sale_from_ping_rejects_invalid(bad):
    with pytest.raises(ValueError):
        sale_from_ping(bad)


def test_test_ping_detected():
    assert sale_from_ping({**PING, "test": "true"}).is_test


def test_estimate_fee_percent_plus_fixed_capped_at_amount():
    policy = FeePolicy(percent=Decimal("10"), fixed_usd=Decimal("0.50"))
    assert estimate_fee(Decimal("19.00"), policy) == Decimal("2.40")
    assert estimate_fee(Decimal("0.30"), policy) == Decimal("0.30")
    assert estimate_fee(Decimal("0"), policy) == Decimal("0")


def test_record_sale_dedups_and_books_fee(store):
    policy = FeePolicy(percent=Decimal("10"), fixed_usd=Decimal("0.50"))
    sale = sale_from_ping(PING)
    assert record_sale(store, sale, policy) is True
    assert record_sale(store, sale, policy) is False
    assert store.ledger_total() == pytest.approx(19.00 - 2.40)


def test_compute_ledger_for_day(store):
    policy = FeePolicy(percent=Decimal("10"), fixed_usd=Decimal("0.50"))
    record_sale(store, sale_from_ping(PING), policy)
    record_sale(store, sale_from_ping({**PING, "sale_id": "S2"}), policy)
    record_sale(store, sale_from_ping({**PING, "sale_id": "S3", "product_id": "P2", "product_name": "Other",
                                       "price": "900", "sale_timestamp": "2026-11-15T10:00:00Z"}), policy)
    store.add_spend("studio", "2026-11-16", 1.84)
    store.add_spend("studio", "2026-11-15", 1.00)
    with freeze_time("2026-11-16 08:00:00"):
        store.insert_product(id="P9", run_id="r", name="New Kit", topic_key="new-kit", price_usd=19,
                             gumroad_url="https://example.gumroad.com/l/new-kit", status="published")
    with freeze_time("2026-11-16 20:00:00"):
        led = compute_ledger(store, "studio", "2026-11-16")

    assert led["period"] == "2026-11-16"
    assert led["gross_sales_usd"] == 38.00
    assert led["gumroad_fees_usd"] == 4.80
    assert led["fees_are_estimated"] is True
    assert led["llm_cost_usd"] == 1.84
    assert led["net_usd"] == pytest.approx(38.00 - 4.80 - 1.84)
    # balance: all sales - all fees - all spend
    assert led["balance_usd"] == pytest.approx((38.00 + 9.00) - (4.80 + 1.40) - (1.84 + 1.00))
    assert led["sales"] == [{"product_id": "P1", "name": "Client Portal Kit", "price": 19.0, "count": 2,
                             "revenue_usd": 38.0}]
    assert led["new_products_today"] == [{"name": "New Kit", "url": "https://example.gumroad.com/l/new-kit",
                                          "status": "published"}]
    assert [t["day"] for t in led["trend"]][-2:] == ["2026-11-15", "2026-11-16"]
    assert led["trend"][-2]["net_usd"] == pytest.approx(9.00 - 1.40 - 1.00)


def test_compute_ledger_empty_day(store):
    led = compute_ledger(store, "studio", "2026-11-16")
    assert led["gross_sales_usd"] == 0 and led["net_usd"] == 0 and led["sales"] == []
    assert len(led["trend"]) == 7
