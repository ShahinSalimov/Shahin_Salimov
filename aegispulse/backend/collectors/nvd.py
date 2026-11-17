"""NVD CVE API 2.0 collector.

Polls ``/rest/json/cves/2.0`` by last-modified window and keeps CVEs that are
high/critical (configurable CVSS floor) or listed in CISA KEV. Items are
stack-gated: a CVE is only ingested for companies whose stack matches the
affected CPE products or the description, which keeps model spend bounded.

Rate limits (NVD): 5 requests / 30 s without an API key, 50 with one.
"""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta
from typing import Any

from backend.collectors.base import CollectedItem, Collector, CollectorError
from backend.models import ThreatSource

PAGE_SIZE = 200
MAX_PAGES = 10
MAX_WINDOW = timedelta(days=120)  # NVD rejects wider lastMod windows


def _fmt(dt: datetime) -> str:
    return dt.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%S.000+00:00")


def _metric(cve: dict[str, Any]) -> tuple[float | None, str | None, str | None, str]:
    metrics = cve.get("metrics") or {}
    for key, label in (("cvssMetricV40", "4.0"), ("cvssMetricV31", "3.1"), ("cvssMetricV30", "3.0")):
        entries = metrics.get(key) or []
        if not entries:
            continue
        primary = next((m for m in entries if m.get("type") == "Primary"), entries[0])
        data = primary.get("cvssData") or {}
        return data.get("baseScore"), data.get("baseSeverity"), data.get("vectorString"), label
    return None, None, None, ""


def _cpe_products(cve: dict[str, Any]) -> list[str]:
    products: list[str] = []
    for config in cve.get("configurations") or []:
        for node in config.get("nodes") or []:
            for match in node.get("cpeMatch") or []:
                parts = str(match.get("criteria", "")).split(":")
                if len(parts) > 5 and match.get("vulnerable", True):
                    vendor, product = parts[3].replace("_", " "), parts[4].replace("_", " ")
                    version = []
                    if match.get("versionStartIncluding"):
                        version.append(f">={match['versionStartIncluding']}")
                    if match.get("versionEndExcluding"):
                        version.append(f"<{match['versionEndExcluding']}")
                    if match.get("versionEndIncluding"):
                        version.append(f"<={match['versionEndIncluding']}")
                    label = f"{vendor} {product}" + (f" ({', '.join(version)})" if version else "")
                    if label not in products:
                        products.append(label)
    return products[:25]


def render_cve(cve: dict[str, Any]) -> CollectedItem | None:
    """Turn one NVD ``cve`` object into intel text, or None if it is filtered out."""
    cve_id = cve.get("id")
    if not cve_id or cve.get("vulnStatus") == "Rejected":
        return None
    score, severity, vector, version = _metric(cve)
    description = next((d["value"] for d in cve.get("descriptions") or [] if d.get("lang") == "en"), "")
    products = _cpe_products(cve)
    kev = cve.get("cisaExploitAdd")
    cwes = sorted({d["value"] for w in cve.get("weaknesses") or [] for d in w.get("description") or [] if d.get("value", "").startswith("CWE-")})
    refs = [r["url"] for r in (cve.get("references") or [])[:6] if r.get("url")]

    lines = [
        f"NVD FEED ITEM: {cve_id}" + (f"  (CVSS v{version} {score} {severity}, {vector})" if score is not None else "  (not yet scored)"),
        description,
    ]
    if kev:
        lines.append(
            f"CISA KEV: actively exploited (added {kev}; action due {cve.get('cisaActionDue', 'n/a')}): "
            f"{cve.get('cisaVulnerabilityName', '')}. Required action: {cve.get('cisaRequiredAction', 'n/a')}"
        )
    if products:
        lines.append("Affected products (CPE): " + "; ".join(products))
    if cwes:
        lines.append("Weaknesses: " + ", ".join(cwes))
    lines.append(f"Published {cve.get('published', 'n/a')}; last modified {cve.get('lastModified', 'n/a')}")
    if refs:
        lines.append("References:\n" + "\n".join(f"  {u}" for u in refs))

    published = None
    if cve.get("published"):
        try:
            published = datetime.fromisoformat(cve["published"]).replace(tzinfo=UTC)
        except ValueError:
            published = None
    return CollectedItem(
        source_ref=f"https://nvd.nist.gov/vuln/detail/{cve_id}",
        text="\n".join(line for line in lines if line),
        published_at=published,
        technologies=[p.split(" (")[0] for p in products],
        stack_gated=True,
    )


class NvdCollector(Collector):
    name = "nvd"
    source = ThreatSource.NVD

    @property
    def interval_s(self) -> int:
        return self.settings.nvd_interval_s

    def configured(self) -> tuple[bool, str | None]:
        return True, None

    def _keep(self, cve: dict[str, Any]) -> bool:
        score, *_ = _metric(cve)
        return bool(cve.get("cisaExploitAdd")) or (score is not None and float(score) >= self.settings.nvd_min_cvss)

    async def collect(self, state: dict[str, Any]) -> tuple[list[CollectedItem], dict[str, Any]]:
        now = datetime.now(UTC)
        start = now - timedelta(hours=self.settings.nvd_lookback_hours)
        if state.get("last_modified"):
            try:
                start = datetime.fromisoformat(state["last_modified"])
            except ValueError:
                pass
        start = max(start, now - MAX_WINDOW)

        headers = {"apiKey": self.settings.nvd_api_key.get_secret_value()} if self.settings.nvd_api_key else {}
        pause = 0.7 if self.settings.nvd_api_key else 6.5
        items: list[CollectedItem] = []
        start_index = 0
        for page in range(MAX_PAGES):
            if page:
                await asyncio.sleep(pause)
            response = await self._get(
                self.settings.nvd_base_url,
                params={
                    "lastModStartDate": _fmt(start),
                    "lastModEndDate": _fmt(now),
                    "resultsPerPage": PAGE_SIZE,
                    "startIndex": start_index,
                },
                headers=headers,
            )
            try:
                payload = response.json()
            except ValueError as exc:
                raise CollectorError("nvd: response was not JSON") from exc
            for wrapper in payload.get("vulnerabilities") or []:
                cve = wrapper.get("cve") or {}
                if self._keep(cve):
                    item = render_cve(cve)
                    if item:
                        items.append(item)
            total = int(payload.get("totalResults", 0))
            start_index += int(payload.get("resultsPerPage", PAGE_SIZE)) or PAGE_SIZE
            if start_index >= total:
                break
        return items, {"last_modified": now.isoformat()}
