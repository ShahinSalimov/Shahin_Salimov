"""SIEM / SOAR export engine: STIX 2.1 bundles and ArcSight CEF events.

STIX 2.1
--------
One analysed threat becomes a self-contained ``bundle``:

* ``identity``         — AegisPulse as the producer (``created_by_ref``)
* ``indicator``        — one per grounded IoC, with a STIX patterning expression
* ``vulnerability``    — one per CVE (``external_references`` source ``cve``)
* ``attack-pattern``   — one per MITRE ATT&CK technique (source ``mitre-attack``)
* ``threat-actor``     — when Agent 2 attributed the activity
* ``course-of-action`` — the AI remediation plan
* ``relationship``     — indicates / mitigates / targets / uses edges
* ``report``           — the analysis itself, referencing every object

Object IDs are UUIDv5 derived from the threat ID and object content, so
re-exporting the same analysis is idempotent (TAXII servers and SIEMs dedupe
on ID) while still being globally unique.

CEF
---
ArcSight Common Event Format, one line per indicator plus a summary line.
Header fields escape ``\\`` and ``|``; extension values escape ``\\``, ``=``
and newlines, per the CEF implementation standard.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any

from backend.models import ThreatEvent

PRODUCT_VENDOR = "AegisPulse"
PRODUCT_NAME = "Threat Intelligence Platform"
PRODUCT_VERSION = "1.0"
_NAMESPACE = uuid.UUID("6f3b7a52-6c1d-4c8e-9a0e-2f6d1b9c4e71")
IDENTITY_ID = f"identity--{uuid.uuid5(_NAMESPACE, 'aegispulse-producer')}"

_CONFIDENCE = {"low": 30, "medium": 60, "high": 85}


def _ts(dt: datetime | None) -> str:
    dt = dt or datetime.now(UTC)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=UTC)
    return dt.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


def _sid(obj_type: str, threat_id: uuid.UUID, *parts: str) -> str:
    return f"{obj_type}--{uuid.uuid5(_NAMESPACE, '|'.join((str(threat_id), obj_type, *parts)))}"


def _escape_pattern(value: str) -> str:
    return value.replace("\\", "\\\\").replace("'", "\\'")


def stix_pattern(ioc_type: str, value: str) -> str | None:
    v = _escape_pattern(value)
    return {
        "ipv4": f"[ipv4-addr:value = '{v}']",
        "ipv6": f"[ipv6-addr:value = '{v}']",
        "domain": f"[domain-name:value = '{v}']",
        "onion": f"[domain-name:value = '{v}']",
        "url": f"[url:value = '{v}']",
        "email": f"[email-addr:value = '{v}']",
        "md5": f"[file:hashes.MD5 = '{v}']",
        "sha1": f"[file:hashes.'SHA-1' = '{v}']",
        "sha256": f"[file:hashes.'SHA-256' = '{v}']",
        "aws_access_key": f"[user-account:account_login = '{v}']",
        "btc_address": f"[x-crypto-wallet:value = '{v}']",
    }.get(ioc_type)


def _identity(created: str) -> dict[str, Any]:
    return {
        "type": "identity",
        "spec_version": "2.1",
        "id": IDENTITY_ID,
        "created": created,
        "modified": created,
        "name": "AegisPulse",
        "identity_class": "system",
        "description": "Autonomous AI threat-intelligence platform (multi-agent analysis).",
    }


def build_stix_bundle(event: ThreatEvent) -> dict[str, Any]:
    if event.analysis is None:
        raise ValueError("threat has not been analysed yet")
    analysis = event.analysis
    created = _ts(event.analyzed_at or event.ingested_at)
    severity = event.final_severity if event.final_severity is not None else (event.severity_score or 0.0)
    confidence = 85 if severity >= 7 else 60
    common = {"spec_version": "2.1", "created": created, "modified": created, "created_by_ref": IDENTITY_ID}

    objects: list[dict[str, Any]] = [_identity(created)]
    relationships: list[dict[str, Any]] = []
    indicator_ids: list[str] = []
    attack_ids: list[str] = []
    vuln_ids: list[str] = []

    def rel(source: str, rtype: str, target: str) -> None:
        relationships.append(
            {"type": "relationship", "id": _sid("relationship", event.id, source, rtype, target),
             "relationship_type": rtype, "source_ref": source, "target_ref": target, **common}
        )

    for ind in event.indicators or []:
        if ind["type"] == "cve":
            vid = _sid("vulnerability", event.id, ind["value"])
            vuln_ids.append(vid)
            objects.append(
                {"type": "vulnerability", "id": vid, "name": ind["value"], "description": ind.get("context", ""),
                 "external_references": [{"source_name": "cve", "external_id": ind["value"],
                                          "url": f"https://nvd.nist.gov/vuln/detail/{ind['value']}"}], **common}
            )
            continue
        pattern = stix_pattern(ind["type"], ind["value"])
        if pattern is None:
            continue
        iid = _sid("indicator", event.id, ind["type"], ind["value"])
        indicator_ids.append(iid)
        objects.append(
            {"type": "indicator", "id": iid, "name": f"{ind['type']}: {ind['value']}"[:250],
             "description": ind.get("context", ""), "indicator_types": ["malicious-activity"],
             "pattern": pattern, "pattern_type": "stix", "valid_from": created,
             "confidence": _CONFIDENCE.get(ind.get("confidence", "medium"), 60),
             "labels": [f"source:{event.source.value}"], **common}
        )

    for m in event.mitre_techniques or []:
        aid = _sid("attack-pattern", event.id, m["technique_id"])
        attack_ids.append(aid)
        objects.append(
            {"type": "attack-pattern", "id": aid, "name": m["technique_name"], "description": m.get("rationale", ""),
             "kill_chain_phases": [{"kill_chain_name": "mitre-attack",
                                    "phase_name": m["tactic"].lower().replace(" ", "-")}],
             "external_references": [{"source_name": "mitre-attack", "external_id": m["technique_id"],
                                      "url": "https://attack.mitre.org/techniques/" + m["technique_id"].replace(".", "/") + "/"}],
             **common}
        )

    for iid in indicator_ids:
        for aid in attack_ids:
            rel(iid, "indicates", aid)

    actor = event.threat_actor
    if actor and actor.lower() != "unattributed":
        tid = _sid("threat-actor", event.id, actor)
        motivation = (analysis.get("context") or {}).get("actor_motivation", "unknown")
        motivation_map = {"financial": "personal-gain", "espionage": "organizational-gain", "hacktivism": "ideology",
                          "destruction": "dominance", "access_brokering": "personal-gain"}
        actor_obj: dict[str, Any] = {"type": "threat-actor", "id": tid, "name": actor,
                                     "threat_actor_types": ["criminal"], **common}
        if motivation in motivation_map:
            actor_obj["primary_motivation"] = motivation_map[motivation]
        objects.append(actor_obj)
        for aid in attack_ids:
            rel(tid, "uses", aid)
        for vid in vuln_ids:
            rel(tid, "targets", vid)

    remediation = analysis.get("remediation")
    if remediation:
        cid = _sid("course-of-action", event.id, "remediation")
        steps = "\n".join(f"{s['order']}. [{s['urgency']}/{s['owner']}] {s['action']}" for s in remediation.get("mitigation_steps", []))
        objects.append(
            {"type": "course-of-action", "id": cid, "name": f"AegisPulse remediation: {event.title or 'threat'}"[:250],
             "description": f"{remediation.get('executive_summary', '')}\n\n{steps}".strip(), **common}
        )
        for target in (*vuln_ids, *attack_ids):
            rel(cid, "mitigates", target)

    objects.extend(relationships)
    report = {
        "type": "report", "id": _sid("report", event.id, "report"),
        "name": event.title or "AegisPulse threat report",
        "description": event.summary or "",
        "report_types": ["threat-report"] + (["vulnerability"] if vuln_ids else []) + (["attack-pattern"] if attack_ids else []),
        "published": created,
        "confidence": confidence,
        "labels": [f"severity:{event.severity_label or 'unknown'}", f"exposure:{event.exposure or 'unknown'}",
                   f"category:{event.threat_category or 'other'}"],
        "object_refs": [o["id"] for o in objects],
        "external_references": [{"source_name": "aegispulse", "external_id": str(event.id),
                                 "description": f"severity {severity:.1f}/10"}],
        **common,
    }
    objects.append(report)
    return {"type": "bundle", "id": f"bundle--{uuid.uuid4()}", "objects": objects}


# --------------------------------------------------------------------------- #
# ArcSight CEF
# --------------------------------------------------------------------------- #


def cef_escape_header(value: str) -> str:
    return value.replace("\\", "\\\\").replace("|", "\\|").replace("\r", " ").replace("\n", " ")


def cef_escape_ext(value: str) -> str:
    return (
        value.replace("\\", "\\\\").replace("=", "\\=").replace("\r\n", "\\n").replace("\n", "\\n").replace("\r", "\\r")
    )


def _cef_line(signature_id: str, name: str, severity: int, extensions: dict[str, Any]) -> str:
    header = "|".join(
        cef_escape_header(str(p))
        for p in (PRODUCT_VENDOR, PRODUCT_NAME, PRODUCT_VERSION, signature_id, name, severity)
    )
    ext = " ".join(f"{k}={cef_escape_ext(str(v))}" for k, v in extensions.items() if v not in (None, ""))
    return f"CEF:0|{header}|{ext}"


_CEF_IOC_FIELD = {
    "ipv4": "src", "ipv6": "c6a2", "domain": "dhost", "onion": "dhost", "url": "request",
    "md5": "fileHash", "sha1": "fileHash", "sha256": "fileHash", "email": "suser", "aws_access_key": "duser",
}


def build_cef_events(event: ThreatEvent) -> list[str]:
    if event.analysis is None:
        raise ValueError("threat has not been analysed yet")
    severity = event.final_severity if event.final_severity is not None else (event.severity_score or 0.0)
    cef_sev = max(0, min(10, round(severity)))
    when = event.analyzed_at or event.ingested_at
    when = when if when.tzinfo else when.replace(tzinfo=UTC)
    rt = int(when.timestamp() * 1000)
    mitre = ",".join(m["technique_id"] for m in event.mitre_techniques or [])
    cves = ",".join(i["value"] for i in event.indicators or [] if i["type"] == "cve")
    base = {
        "rt": rt,
        "externalId": str(event.id),
        "cat": event.threat_category or "other",
        "cs1Label": "MITRE ATT&CK", "cs1": mitre,
        "cs2Label": "CVE", "cs2": cves,
        "cs3Label": "Exposure", "cs3": event.exposure or "unknown",
        "cs4Label": "Threat Actor", "cs4": event.threat_actor or "Unattributed",
        "cs5Label": "Intel Source", "cs5": event.source.value,
        "cn1Label": "AI Severity", "cn1": f"{severity:.1f}",
    }
    lines = [
        _cef_line(
            "AEGIS-THREAT", (event.title or "AegisPulse threat")[:512], cef_sev,
            {**base, "msg": (event.summary or "")[:1023]},
        )
    ]
    for ind in event.indicators or []:
        if ind["type"] == "cve":
            continue
        field = _CEF_IOC_FIELD.get(ind["type"], "cs6")
        ext = {**base, "msg": f"IoC {ind['type']} {ind['value']}: {ind.get('context', '')}"[:1023]}
        if field == "cs6":
            ext.update({"cs6Label": "Indicator", "cs6": ind["value"]})
        else:
            ext[field] = ind["value"]
            if field == "fileHash":
                ext["cs6Label"], ext["cs6"] = "Hash Type", ind["type"].upper()
        lines.append(_cef_line(f"AEGIS-IOC-{ind['type'].upper()}", f"Threat indicator ({ind['type']})", cef_sev, ext))
    return lines
