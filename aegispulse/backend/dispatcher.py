"""Zero-touch alert dispatcher: Slack, WhatsApp (Twilio) and signed webhooks.

Formatting is pure (``build_*`` functions) so payloads can be previewed in the
dashboard and unit-tested; sending is isolated in ``dispatch_alerts``. Every
attempt — sent, failed or skipped — is written to ``AlertLog``.

Outbound URLs are restricted to HTTPS and, for Slack, to the official
``hooks.slack.com`` host to prevent the dispatcher being abused for SSRF.
"""

from __future__ import annotations

import hashlib
import hmac
import ipaddress
import json
import logging
import time
from dataclasses import dataclass
from typing import Any
from urllib.parse import urlparse

import httpx

from backend.config import Settings
from backend.models import AlertChannel, AlertLog, AlertStatus, MitigationPatch, ThreatEvent

logger = logging.getLogger("aegispulse.dispatcher")

WHATSAPP_MAX_CHARS = 1600
SEVERITY_EMOJI_FREE_TAG = {"critical": "[CRITICAL]", "high": "[HIGH]", "medium": "[MEDIUM]", "low": "[LOW]", "info": "[INFO]"}


@dataclass(slots=True)
class AlertSummary:
    executive: str
    technical: str
    link: str


def _sev(event: ThreatEvent) -> tuple[float, str]:
    score = event.final_severity if event.final_severity is not None else (event.severity_score or 0.0)
    return float(score), (event.severity_label or "info")


def build_summary(event: ThreatEvent, patches: list[MitigationPatch], settings: Settings) -> AlertSummary:
    score, label = _sev(event)
    analysis = event.analysis or {}
    remediation = analysis.get("remediation") or {}
    context = analysis.get("context") or {}
    exec_text = remediation.get("executive_summary") or event.summary or "No executive summary available."
    exposure = event.exposure or "unknown"
    executive = (
        f"{SEVERITY_EMOJI_FREE_TAG.get(label, '[ALERT]')} {event.title or 'Untitled threat'}\n"
        f"Severity {score:.1f}/10 | Exposure: {exposure} | Priority: {context.get('recommended_priority', 'n/a')}\n"
        f"{exec_text}"
    )

    iocs = ", ".join(f"{i['type']}:{i['value']}" for i in (event.indicators or [])[:8]) or "none"
    mitre = ", ".join(f"{m['technique_id']} {m['technique_name']}" for m in (event.mitre_techniques or [])[:6]) or "none"
    steps = remediation.get("mitigation_steps") or []
    step_lines = "\n".join(f"{s['order']}. [{s['urgency']}] {s['action']}" for s in steps[:5]) or "none"
    patch_names = ", ".join(f"{p.title} ({p.kind.value})" for p in patches[:6]) or "none"
    technical = (
        f"Source: {event.source.value} | Category: {event.threat_category or 'n/a'} | Actor: {event.threat_actor or 'Unattributed'}\n"
        f"IoCs: {iocs}\n"
        f"MITRE ATT&CK: {mitre}\n"
        f"Immediate actions:\n{step_lines}\n"
        f"Generated artefacts (pending approval): {patch_names}"
    )
    link = f"{settings.dashboard_base_url.rstrip('/')}/?threat={event.id}"
    return AlertSummary(executive=executive, technical=technical, link=link)


def build_slack_payload(summary: AlertSummary, event: ThreatEvent) -> dict[str, Any]:
    score, label = _sev(event)
    return {
        "text": summary.executive.splitlines()[0],
        "blocks": [
            {"type": "header", "text": {"type": "plain_text", "text": f"AegisPulse {label.upper()} threat ({score:.1f})"[:150]}},
            {"type": "section", "text": {"type": "mrkdwn", "text": summary.executive[:2900]}},
            {"type": "divider"},
            {"type": "section", "text": {"type": "mrkdwn", "text": "```" + summary.technical[:2800] + "```"}},
            {
                "type": "actions",
                "elements": [
                    {
                        "type": "button",
                        "text": {"type": "plain_text", "text": "Open in AegisPulse"},
                        "url": summary.link,
                        "style": "danger" if label == "critical" else "primary",
                    }
                ],
            },
        ],
    }


def build_whatsapp_body(summary: AlertSummary) -> str:
    body = f"{summary.executive}\n\n{summary.technical}\n\n{summary.link}"
    if len(body) <= WHATSAPP_MAX_CHARS:
        return body
    tail = f"\n...\n{summary.link}"
    return body[: WHATSAPP_MAX_CHARS - len(tail)] + tail


def build_webhook_payload(summary: AlertSummary, event: ThreatEvent) -> dict[str, Any]:
    score, label = _sev(event)
    return {
        "event": "aegispulse.threat.alert",
        "threat_id": str(event.id),
        "title": event.title,
        "severity": score,
        "severity_label": label,
        "exposure": event.exposure,
        "source": event.source.value,
        "indicators": event.indicators,
        "mitre_techniques": event.mitre_techniques,
        "executive_summary": summary.executive,
        "technical_summary": summary.technical,
        "link": summary.link,
    }


def sign_webhook(body: bytes, secret: str, timestamp: int) -> str:
    mac = hmac.new(secret.encode(), f"{timestamp}.".encode() + body, hashlib.sha256)
    return "sha256=" + mac.hexdigest()


def _safe_https_url(url: str, *, required_host: str | None = None) -> bool:
    parsed = urlparse(url)
    if parsed.scheme != "https" or not parsed.hostname:
        return False
    host = parsed.hostname.lower()
    if required_host and host != required_host:
        return False
    if host in {"localhost"} or host.endswith(".local") or host.endswith(".internal"):
        return False
    try:
        ip = ipaddress.ip_address(host)
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved:
            return False
    except ValueError:
        pass
    return True


def _mask(value: str) -> str:
    return value if len(value) <= 6 else f"{value[:3]}***{value[-3:]}"


def channel_configured(channel: AlertChannel, settings: Settings) -> bool:
    if channel is AlertChannel.SLACK:
        return settings.slack_webhook_url is not None
    if channel is AlertChannel.WHATSAPP:
        return bool(
            settings.twilio_account_sid and settings.twilio_auth_token and settings.twilio_whatsapp_from and settings.twilio_whatsapp_to
        )
    return bool(settings.generic_webhook_url)


def build_preview(channel: AlertChannel, event: ThreatEvent, patches: list[MitigationPatch], settings: Settings) -> tuple[AlertSummary, dict[str, Any]]:
    summary = build_summary(event, patches, settings)
    if channel is AlertChannel.SLACK:
        payload = build_slack_payload(summary, event)
    elif channel is AlertChannel.WHATSAPP:
        payload = {"From": settings.twilio_whatsapp_from or "whatsapp:+<sender>", "To": "whatsapp:+<recipient>", "Body": build_whatsapp_body(summary)}
    else:
        payload = build_webhook_payload(summary, event)
    return summary, payload


async def dispatch_alerts(
    event: ThreatEvent,
    patches: list[MitigationPatch],
    channels: list[AlertChannel],
    settings: Settings,
    *,
    trigger: str = "manual",
    client: httpx.AsyncClient | None = None,
) -> list[AlertLog]:
    """Send the alert on each channel and return unsaved AlertLog rows."""
    summary = build_summary(event, patches, settings)
    logs: list[AlertLog] = []
    owns_client = client is None
    http = client or httpx.AsyncClient(timeout=httpx.Timeout(10.0), follow_redirects=False)
    try:
        for channel in channels:
            if channel is AlertChannel.SLACK:
                logs.append(await _send_slack(http, event, summary, settings, trigger))
            elif channel is AlertChannel.WHATSAPP:
                logs.extend(await _send_whatsapp(http, event, summary, settings, trigger))
            else:
                logs.append(await _send_webhook(http, event, summary, settings, trigger))
    finally:
        if owns_client:
            await http.aclose()
    return logs


def _log(event: ThreatEvent, channel: AlertChannel, status: AlertStatus, trigger: str, **kw: Any) -> AlertLog:
    return AlertLog(threat_id=event.id, channel=channel, status=status, trigger=trigger, **kw)


async def _post(http: httpx.AsyncClient, url: str, **kwargs: Any) -> tuple[int | None, str | None]:
    try:
        response = await http.post(url, **kwargs)
    except httpx.HTTPError as exc:
        return None, f"{type(exc).__name__}: {exc}"
    if response.is_success:
        return response.status_code, None
    return response.status_code, response.text[:500]


async def _send_slack(http, event, summary, settings: Settings, trigger) -> AlertLog:  # noqa: ANN001
    if settings.slack_webhook_url is None:
        return _log(event, AlertChannel.SLACK, AlertStatus.SKIPPED, trigger, error="SLACK_WEBHOOK_URL not configured")
    url = settings.slack_webhook_url.get_secret_value()
    if not _safe_https_url(url, required_host="hooks.slack.com"):
        return _log(event, AlertChannel.SLACK, AlertStatus.FAILED, trigger, error="Slack webhook must be https://hooks.slack.com/...")
    payload = build_slack_payload(summary, event)
    code, err = await _post(http, url, json=payload)
    return _log(
        event, AlertChannel.SLACK, AlertStatus.SENT if err is None else AlertStatus.FAILED, trigger,
        destination="hooks.slack.com", payload=payload, response_code=code, error=err,
    )


async def _send_whatsapp(http, event, summary, settings: Settings, trigger) -> list[AlertLog]:  # noqa: ANN001
    if not channel_configured(AlertChannel.WHATSAPP, settings):
        return [_log(event, AlertChannel.WHATSAPP, AlertStatus.SKIPPED, trigger, error="Twilio WhatsApp settings not configured")]
    sid = settings.twilio_account_sid or ""
    token = settings.twilio_auth_token.get_secret_value() if settings.twilio_auth_token else ""
    url = f"https://api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json"
    body = build_whatsapp_body(summary)
    logs = []
    for recipient in settings.twilio_whatsapp_to:
        to = recipient if recipient.startswith("whatsapp:") else f"whatsapp:{recipient}"
        data = {"From": settings.twilio_whatsapp_from, "To": to, "Body": body}
        code, err = await _post(http, url, data=data, auth=(sid, token))
        logs.append(
            _log(
                event, AlertChannel.WHATSAPP, AlertStatus.SENT if err is None else AlertStatus.FAILED, trigger,
                destination=_mask(to), payload={"Body": body}, response_code=code, error=err,
            )
        )
    return logs


async def _send_webhook(http, event, summary, settings: Settings, trigger) -> AlertLog:  # noqa: ANN001
    url = settings.generic_webhook_url
    if not url:
        return _log(event, AlertChannel.WEBHOOK, AlertStatus.SKIPPED, trigger, error="ALERT_WEBHOOK_URL not configured")
    if not _safe_https_url(url):
        return _log(event, AlertChannel.WEBHOOK, AlertStatus.FAILED, trigger, error="Webhook URL must be public HTTPS")
    payload = build_webhook_payload(summary, event)
    body = json.dumps(payload, separators=(",", ":"), default=str).encode()
    headers = {"Content-Type": "application/json", "User-Agent": "AegisPulse-Dispatcher/1.0"}
    if settings.generic_webhook_secret:
        ts = int(time.time())
        headers["X-Aegis-Timestamp"] = str(ts)
        headers["X-Aegis-Signature"] = sign_webhook(body, settings.generic_webhook_secret.get_secret_value(), ts)
    code, err = await _post(http, url, content=body, headers=headers)
    return _log(
        event, AlertChannel.WEBHOOK, AlertStatus.SENT if err is None else AlertStatus.FAILED, trigger,
        destination=urlparse(url).hostname, payload=payload, response_code=code, error=err,
    )
