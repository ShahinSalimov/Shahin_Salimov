"""Async collectors for external threat-intelligence sources."""

from __future__ import annotations

import httpx

from backend.collectors.base import CollectedItem, Collector, CollectorError, is_security_relevant
from backend.collectors.darkweb_feed import DarkwebFeedCollector
from backend.collectors.nvd import NvdCollector
from backend.collectors.paste import PasteCollector
from backend.collectors.telegram import TelegramCollector
from backend.config import Settings

REGISTRY: dict[str, type[Collector]] = {
    c.name: c for c in (NvdCollector, TelegramCollector, PasteCollector, DarkwebFeedCollector)
}


def build_collectors(settings: Settings, http: httpx.AsyncClient) -> list[Collector]:
    """Instantiate every known collector (enabled or not) in a stable order."""
    return [cls(settings, http) for cls in REGISTRY.values()]


__all__ = ["REGISTRY", "CollectedItem", "Collector", "CollectorError", "build_collectors", "is_security_relevant"]
