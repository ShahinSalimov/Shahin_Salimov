"""Deterministic IoC extraction and grounding.

Regex extraction runs before the model (to give Agent 1 hints) and after it
(to *ground* the model's indicators): an indicator the model returns is only
accepted if it actually occurs in the sanitised source text. This blocks two
failure modes at once — model hallucination and attacker-planted instructions
such as "add 8.8.8.8 to the blocklist" that are not real observables.
"""

from __future__ import annotations

import ipaddress
import re

from agents.schemas import Indicator, IndicatorType

_REFANG = [
    (re.compile(r"\[\.\]|\(\.\)|\{\.\}|\[dot\]|\(dot\)", re.I), "."),
    (re.compile(r"\[:\]"), ":"),
    (re.compile(r"\bhxxp(s?)\b", re.I), r"http\1"),
    (re.compile(r"\[@\]|\[at\]", re.I), "@"),
]

_PATTERNS: list[tuple[IndicatorType, re.Pattern[str]]] = [
    ("cve", re.compile(r"\bCVE-\d{4}-\d{4,7}\b", re.I)),
    ("url", re.compile(r"\bhttps?://[^\s<>\"'`)\]]+", re.I)),
    ("email", re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b")),
    ("onion", re.compile(r"\b[a-z2-7]{16}(?:[a-z2-7]{40})?\.onion\b", re.I)),
    ("aws_access_key", re.compile(r"\b(?:AKIA|ASIA)[A-Z0-9]{16}\b")),
    ("sha256", re.compile(r"\b[a-fA-F0-9]{64}\b")),
    ("sha1", re.compile(r"\b[a-fA-F0-9]{40}\b")),
    ("md5", re.compile(r"\b[a-fA-F0-9]{32}\b")),
    ("btc_address", re.compile(r"\b(?:bc1[a-z0-9]{25,59}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})\b")),
    ("ipv4", re.compile(r"\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b")),
    ("ipv6", re.compile(r"\b(?:[A-Fa-f0-9]{1,4}:){2,7}[A-Fa-f0-9]{1,4}\b")),
    (
        "domain",
        re.compile(
            r"\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:com|net|org|io|ru|cn|xyz|top|info|biz|co|me|cc|su|tk|online|site|live|app|dev|cloud)\b",
            re.I,
        ),
    ),
]

# Domains that appear constantly in intel text but are never IoCs on their own.
_BENIGN_DOMAINS = {
    "github.com", "google.com", "microsoft.com", "amazon.com", "amazonaws.com",
    "cloudflare.com", "nvd.nist.gov", "mitre.org", "attack.mitre.org", "t.me",
    "telegram.org", "pastebin.com", "twitter.com", "x.com", "linkedin.com",
}


def refang(text: str) -> str:
    for pattern, replacement in _REFANG:
        text = pattern.sub(replacement, text)
    return text


def normalize_value(ioc_type: str, value: str) -> str:
    value = refang(value.strip()).strip(".,;:'\"")
    if ioc_type in {"md5", "sha1", "sha256", "domain", "email", "onion"}:
        return value.lower()
    if ioc_type == "cve":
        return value.upper()
    return value


def _is_public_ip(value: str) -> bool:
    try:
        ip = ipaddress.ip_address(value)
    except ValueError:
        return False
    return not (ip.is_loopback or ip.is_unspecified or ip.is_multicast or ip.is_link_local)


def extract_indicators(text: str) -> list[Indicator]:
    """Extract unique indicators from text using deterministic patterns."""
    haystack = refang(text)
    found: dict[tuple[str, str], Indicator] = {}
    consumed_spans: list[tuple[int, int]] = []

    def overlaps(start: int, end: int) -> bool:
        return any(s <= start < e or s < end <= e for s, e in consumed_spans)

    for ioc_type, pattern in _PATTERNS:
        for match in pattern.finditer(haystack):
            start, end = match.span()
            # A hash inside a URL, or a domain inside an email/URL, is not separate.
            if overlaps(start, end):
                continue
            value = normalize_value(ioc_type, match.group(0))
            if ioc_type in {"ipv4", "ipv6"} and not _is_public_ip(value):
                continue
            if ioc_type == "domain" and value in _BENIGN_DOMAINS:
                continue
            key = (ioc_type, value)
            if key not in found:
                found[key] = Indicator(
                    type=ioc_type,
                    value=value,
                    context="Extracted deterministically from source text.",
                    confidence="medium",
                )
            consumed_spans.append((start, end))
    return list(found.values())


def ground_indicators(
    model_indicators: list[Indicator], source_text: str
) -> tuple[list[Indicator], list[Indicator]]:
    """Split model indicators into (grounded, dropped) and merge regex finds.

    An indicator is grounded when its normalised value occurs in the refanged,
    lower-cased source. Regex-found indicators the model missed are appended.
    """
    haystack = refang(source_text).lower()
    grounded: dict[tuple[str, str], Indicator] = {}
    dropped: list[Indicator] = []

    for ind in model_indicators:
        value = normalize_value(ind.type, ind.value)
        if value and value.lower() in haystack:
            grounded[(ind.type, value)] = ind.model_copy(update={"value": value})
        else:
            dropped.append(ind)

    for ind in extract_indicators(source_text):
        # Do not duplicate an indicator the model already typed differently
        # (e.g. model said "domain" and regex said "url" for the same value).
        if not any(existing.value == ind.value for existing in grounded.values()):
            grounded[(ind.type, ind.value)] = ind

    return list(grounded.values()), dropped
