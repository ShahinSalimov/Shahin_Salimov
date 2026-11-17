"""Gumroad sale Ping handler (POST /webhooks/gumroad/<secret>).

The URL secret is checked by app.py. When GUMROAD_ACCESS_TOKEN is set, the sale is also confirmed
with ``GET /v2/sales/:id`` so a forged ping cannot book revenue; if Gumroad is temporarily
unreachable the sale is booked as unverified. Each new sale is booked once (dedup by sale_id) and
triggers a short WhatsApp message without any LLM call; the Banker's full report runs on schedule.
"""
from __future__ import annotations

import logging
from decimal import Decimal
from typing import Any

from core.tools import NonRetryable
from orgs.studio.tools.gumroad import GumroadClient, GumroadError
from orgs.studio.tools.ledger import FeePolicy, record_sale, sale_from_ping

log = logging.getLogger(__name__)


def handle_gumroad_ping(form: dict[str, Any], rt: Any) -> dict[str, Any]:
    try:
        sale = sale_from_ping(form)
    except ValueError as e:
        log.warning("ignored gumroad ping: %s", e)
        return {"accepted": False, "reason": str(e)}
    if sale.is_test:
        rt.notifier.send("Gumroad test ping alındı.")
        return {"accepted": True, "test": True}

    verified = False
    token = rt.settings.gumroad_access_token
    if token is not None:
        try:
            GumroadClient(token.get_secret_value()).get_sale(sale.sale_id)
            verified = True
        except NonRetryable:
            log.warning("gumroad ping for unknown sale %s ignored", sale.sale_id)
            return {"accepted": False, "reason": "sale not found in Gumroad"}
        except GumroadError as e:
            log.warning("could not verify sale %s: %s", sale.sale_id, e)

    policy = FeePolicy(percent=Decimal(str(rt.settings.gumroad_fee_percent)),
                       fixed_usd=Decimal(str(rt.settings.gumroad_fee_fixed_usd)))
    new = record_sale(rt.store, sale, policy)
    if new:
        name = sale.product_name or sale.product_id or "məhsul"
        rt.notifier.send(f"Yeni satış: {name} - {sale.amount_usd:.2f} USD"
                         + ("" if verified else " (yoxlanılmayıb)"))
    return {"accepted": True, "duplicate": not new, "verified": verified}


WEBHOOKS = {"gumroad": handle_gumroad_ping}
