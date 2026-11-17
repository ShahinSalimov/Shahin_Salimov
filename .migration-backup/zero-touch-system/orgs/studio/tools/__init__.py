"""Studio tool adapters and their registration (called by core.bootstrap).

Tools are plain code; numbers that agents see (portfolio sales, budget, ledger) are computed here.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path
from typing import Any

from core.config import Settings
from core.db import JobStore
from core.guards import BudgetGuard
from core.tools import ToolContext, ToolRegistry
from orgs.studio.tools.build_assets import build_product_files_tool
from orgs.studio.tools.gumroad import GumroadClient, build_publisher, gumroad_publish_tool
from orgs.studio.tools.ledger import compute_ledger
from orgs.studio.tools.market_signals import build_sources, collect_market_signals_tool

ROOT = Path(__file__).resolve().parents[3]
DIRECTIVE_TTL_DAYS = 14


def _today() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def _iso(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%dT%H:%M:%S.%fZ")


def portfolio_tool(budget: BudgetGuard, max_products_per_day: int):
    """Snapshot for the CEO: catalog with 30-day sales, past topics and budget. Enforces the daily cap."""

    def portfolio(payload: dict[str, Any], ctx: ToolContext) -> dict[str, Any]:
        today = _today()
        created_today = len(ctx.store.products_created_on(today))
        if created_today >= max_products_per_day:
            return {"status": "rejected", "errors": [f"max_products_per_day ({max_products_per_day}) reached"]}
        now = datetime.now(timezone.utc)
        rows = ctx.store.ledger_rows(_iso(now - timedelta(days=30)), _iso(now + timedelta(seconds=1)))
        per_product: dict[str, dict[str, Any]] = {}
        for r in rows:
            if r["kind"] == "sale" and r["product_id"]:
                p = per_product.setdefault(r["product_id"], {"sales_30d": 0, "revenue_30d": Decimal("0")})
                p["sales_30d"] += 1
                p["revenue_30d"] += Decimal(str(r["amount_usd"]))
        products = ctx.store.products()
        catalog = [{"product_id": p["id"], "name": p["name"], "price": p["price_usd"], "status": p["status"],
                    "sales_30d": per_product.get(p["id"], {}).get("sales_30d", 0),
                    "revenue_30d": float(per_product.get(p["id"], {}).get("revenue_30d", 0))} for p in products]
        return {"status": "ok", "date": today, "portfolio": catalog,
                "history_topics": sorted({p["topic_key"] for p in products}),
                "budget": {"llm_usd_remaining_today": round(budget.remaining(ctx.org), 2),
                           "max_products_per_day": max_products_per_day,
                           "products_created_today": created_today}}

    return portfolio


def ledger_tool(day: str | None = None):
    def ledger(payload: dict[str, Any], ctx: ToolContext) -> dict[str, Any]:
        return {"status": "ok", "ledger": compute_ledger(ctx.store, ctx.org, payload.get("day") or day or _today())}

    return ledger


def weekly_metrics_tool():
    def weekly(payload: dict[str, Any], ctx: ToolContext) -> dict[str, Any]:
        led = compute_ledger(ctx.store, ctx.org, _today(), trend_days=7)
        products = ctx.store.products()
        return {"status": "ok", "weekly_metrics": {
            "trend": led["trend"], "net_7d_usd": round(sum(t["net_usd"] for t in led["trend"]), 2),
            "balance_usd": led["balance_usd"], "catalog_size": len(products),
            "products_last_7d": [p["name"] for p in products[-7:]]}}

    return weekly


def save_directives_tool():
    def save(payload: dict[str, Any], ctx: ToolContext) -> dict[str, Any]:
        exp = _iso(datetime.now(timezone.utc) + timedelta(days=DIRECTIVE_TTL_DAYS))
        texts = []
        e = payload.get("next_experiment") or {}
        if e:
            texts.append(f"Experiment: {e['hypothesis']} (metric: {e['metric']}, success: {e['success_threshold']})")
        if payload.get("stop_doing"):
            texts.append(f"Stop doing: {payload['stop_doing']}")
        for t in texts:
            ctx.store.add_directive(ctx.org, "ceo", t, expires_at=exp)
        return {"status": "ok", "saved": len(texts), "critique": payload.get("critique", "")}

    return save


def register_tools(registry: ToolRegistry, settings: Settings, store: JobStore) -> None:
    data_dir = Path(settings.data_dir or ROOT / "data")
    client = (GumroadClient(settings.gumroad_access_token.get_secret_value())
              if settings.gumroad_access_token else None)
    budget = BudgetGuard(store, settings.daily_budget_usd)
    registry.register("studio_portfolio", portfolio_tool(budget, settings.max_products_per_day))
    registry.register("collect_market_signals",
                      collect_market_signals_tool(build_sources(settings.signal_sources)))
    registry.register("build_product_files", build_product_files_tool(data_dir, settings.pdf_font_path))
    registry.register("gumroad_publish",
                      gumroad_publish_tool(build_publisher(settings.gumroad_publish_mode, data_dir, client), client))
    registry.register("compute_ledger", ledger_tool())
    registry.register("weekly_metrics", weekly_metrics_tool())
    registry.register("save_directives", save_directives_tool())
