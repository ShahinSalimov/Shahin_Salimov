"""Collector contract and shared relevance filtering.

A collector turns one external source into ``CollectedItem`` objects and an
updated cursor (``state``). It never touches the database: the runner owns
persistence, deduplication and the per-company fan-out, so collectors stay
small, pure and easy to test against recorded fixtures.
"""

from __future__ import annotations

import re
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

import httpx

from agents.ioc_extractor import extract_indicators
from backend.config import Settings
from backend.models import ThreatSource

USER_AGENT = "AegisPulse-Collector/1.0 (+threat-intelligence)"

_SECURITY_TERMS = re.compile(
    r"\b(0-?day|zero[- ]day|exploit|rce|remote code execution|sql ?i(njection)?|vulnerab\w*|cve-\d{4}|"
    r"leak(ed|s)?|dump(ed)?|breach(ed)?|combo ?list|credential\w*|stealer|infostealer|ransomware|locker|"
    r"access (for sale|broker)|initial access|backdoor|webshell|botnet|ddos|phishing|malware|c2|"
    r"privilege escalation|bypass|database|admin panel|api key|access key|token)\b",
    re.I,
)
_HIGH_VALUE_IOCS = {"cve", "sha256", "sha1", "md5", "aws_access_key", "onion"}


class CollectorError(RuntimeError):
    """A source is misconfigured or unreachable; recorded on the collector state."""


@dataclass(slots=True)
class CollectedItem:
    source_ref: str
    text: str
    published_at: datetime | None = None
    technologies: list[str] = field(default_factory=list)
    # When True the runner ingests the item only for companies whose stack it touches.
    stack_gated: bool = False


def is_security_relevant(text: str, *, min_terms: int = 1) -> bool:
    """Cheap pre-filter so chatter never reaches (and spends) the AI pipeline."""
    if len(text.strip()) < 40:
        return False
    if len(_SECURITY_TERMS.findall(text)) >= min_terms + 1:
        return True
    iocs = extract_indicators(text)
    return any(i.type in _HIGH_VALUE_IOCS for i in iocs) and bool(_SECURITY_TERMS.search(text))


class Collector(ABC):
    name: str
    source: ThreatSource

    def __init__(self, settings: Settings, http: httpx.AsyncClient) -> None:
        self.settings = settings
        self.http = http

    @property
    @abstractmethod
    def interval_s(self) -> int: ...

    @abstractmethod
    def configured(self) -> tuple[bool, str | None]:
        """Return (ready, reason_if_not)."""

    @abstractmethod
    async def collect(self, state: dict[str, Any]) -> tuple[list[CollectedItem], dict[str, Any]]:
        """Fetch new items since ``state`` and return them with the new state."""

    async def _get(self, url: str, **kwargs: Any) -> httpx.Response:
        headers = {"User-Agent": USER_AGENT, **kwargs.pop("headers", {})}
        try:
            response = await self.http.get(url, headers=headers, **kwargs)
        except httpx.HTTPError as exc:
            raise CollectorError(f"{self.name}: request failed ({type(exc).__name__})") from exc
        if response.status_code == 429:
            raise CollectorError(f"{self.name}: rate limited by source (HTTP 429)")
        if response.status_code >= 400:
            raise CollectorError(f"{self.name}: source returned HTTP {response.status_code}")
        return response
