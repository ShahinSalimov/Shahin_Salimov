"""Alert formatting and delivery: Slack, Twilio WhatsApp, signed webhooks, SSRF guards."""

from __future__ import annotations

import hashlib
import hmac
import json
import uuid
from urllib.parse import parse_qs

import httpx
from pydantic import SecretStr

from backend.config import Settings
from backend.dispatcher import (
    WHATSAPP_MAX_CHARS,
    _safe_https_url,
    build_slack_payload,
    build_summary,
    build_whatsapp_body,
    channel_configured,
    dispatch_alerts,
    sign_webhook,
)
from backend.models import AlertChannel, AlertStatus, ThreatEvent, ThreatSource


def _event(summary_len: int = 50) -> ThreatEvent:
    return ThreatEvent(
        id=uuid.uuid4(), source=ThreatSource.TELEGRAM, raw_text="x", content_hash="h",
        title="AWS key dump", summary="s" * summary_len, threat_category="credential_leak",
        severity_score=9.0, final_severity=9.5, severity_label="critical", exposure="direct",
        indicators=[{"type": "aws_access_key", "value": "AKIAIOSFODNN7EXAMPLE"}],
        mitre_techniques=[{"technique_id": "T1078.004", "technique_name": "Cloud Accounts"}],
        analysis={"remediation": {"executive_summary": "Rotate keys now. " * 200,
                                  "mitigation_steps": [{"order": 1, "urgency": "immediate", "action": "Rotate"}]},
                  "context": {"recommended_priority": "P1"}},
    )


def _settings(**kw) -> Settings:  # noqa: ANN003
    return Settings(_env_file=None, **kw)


def test_summary_and_slack_blocks() -> None:
    settings = _settings()
    event = _event()
    summary = build_summary(event, [], settings)
    assert summary.executive.startswith("[CRITICAL] AWS key dump")
    assert "Priority: P1" in summary.executive
    assert "aws_access_key:AKIAIOSFODNN7EXAMPLE" in summary.technical
    payload = build_slack_payload(summary, event)
    assert payload["blocks"][0]["type"] == "header"
    assert len(payload["blocks"][1]["text"]["text"]) <= 3000
    assert payload["blocks"][-1]["elements"][0]["url"].endswith(f"?threat={event.id}")


def test_whatsapp_body_respects_twilio_limit() -> None:
    summary = build_summary(_event(5000), [], _settings())
    body = build_whatsapp_body(summary)
    assert len(body) <= WHATSAPP_MAX_CHARS and body.endswith(summary.link)


def test_ssrf_guard() -> None:
    assert _safe_https_url("https://hooks.slack.com/services/T/B/X", required_host="hooks.slack.com")
    assert not _safe_https_url("https://evil.example/services", required_host="hooks.slack.com")
    for url in ("http://soar.example.com", "https://127.0.0.1/x", "https://10.0.0.5/x", "https://169.254.169.254/latest", "https://localhost/x", "https://db.internal/x"):
        assert not _safe_https_url(url), url
    assert _safe_https_url("https://soar.example.com/hook")


async def test_dispatch_sends_slack_whatsapp_and_signed_webhook() -> None:
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(201 if "twilio" in str(request.url) else 200, json={"ok": True})

    settings = _settings(
        SLACK_WEBHOOK_URL="https://hooks.slack.com/services/T0/B0/XYZ",
        TWILIO_ACCOUNT_SID="AC123", TWILIO_AUTH_TOKEN="tok", TWILIO_WHATSAPP_FROM="whatsapp:+14155238886",
        TWILIO_WHATSAPP_TO="+15550001111,+15550002222",
        ALERT_WEBHOOK_URL="https://soar.example.com/hook", ALERT_WEBHOOK_SECRET="s3cret",
    )
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        logs = await dispatch_alerts(_event(), [], list(AlertChannel), settings, trigger="auto", client=client)

    assert [(log.channel, log.status) for log in logs] == [
        (AlertChannel.SLACK, AlertStatus.SENT), (AlertChannel.WHATSAPP, AlertStatus.SENT),
        (AlertChannel.WHATSAPP, AlertStatus.SENT), (AlertChannel.WEBHOOK, AlertStatus.SENT),
    ]
    assert logs[1].destination == "wha***111"
    twilio = seen[1]
    assert str(twilio.url) == "https://api.twilio.com/2010-04-01/Accounts/AC123/Messages.json"
    assert twilio.headers["authorization"].startswith("Basic ")
    form = parse_qs(twilio.content.decode())
    assert form["To"] == ["whatsapp:+15550001111"] and form["From"] == ["whatsapp:+14155238886"]

    hook = seen[3]
    ts = hook.headers["x-aegis-timestamp"]
    expected = "sha256=" + hmac.new(b"s3cret", f"{ts}.".encode() + hook.content, hashlib.sha256).hexdigest()
    assert hook.headers["x-aegis-signature"] == expected == sign_webhook(hook.content, "s3cret", int(ts))
    assert json.loads(hook.content)["event"] == "aegispulse.threat.alert"


async def test_dispatch_records_failures_and_rejects_unsafe_urls() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(500, text="boom")

    settings = _settings(SLACK_WEBHOOK_URL="https://hooks.slack.com/services/x", ALERT_WEBHOOK_URL="http://169.254.169.254/")
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        logs = await dispatch_alerts(_event(), [], [AlertChannel.SLACK, AlertChannel.WEBHOOK, AlertChannel.WHATSAPP], settings, client=client)
    assert logs[0].status is AlertStatus.FAILED and logs[0].response_code == 500
    assert logs[1].status is AlertStatus.FAILED and "public HTTPS" in logs[1].error
    assert logs[2].status is AlertStatus.SKIPPED


def test_blank_env_values_mean_unconfigured() -> None:
    # Regression: docker-compose passes unset variables as empty strings.
    settings = _settings(SLACK_WEBHOOK_URL="", ALERT_WEBHOOK_URL="  ", ANTHROPIC_API_KEY="", REDIS_URL="", TWILIO_ACCOUNT_SID="")
    assert settings.slack_webhook_url is None and settings.generic_webhook_url is None and settings.redis_url is None
    assert not settings.ai_configured
    assert not any(channel_configured(c, settings) for c in AlertChannel)


def test_secret_settings_are_not_leaked_in_repr() -> None:
    settings = _settings(ANTHROPIC_API_KEY="sk-ant-secret", SLACK_WEBHOOK_URL="https://hooks.slack.com/services/secret")
    assert "sk-ant-secret" not in repr(settings)
    assert isinstance(settings.anthropic_api_key, SecretStr)
