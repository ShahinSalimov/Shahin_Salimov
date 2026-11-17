"""WhatsApp notification adapter (Twilio, plus a console provider for tests and dry runs).

Every message is prefixed with the org (``[STUDIO]`` / ``[YOUTUBE]``) and truncated to Twilio's
1600-character body limit. Meta WhatsApp Cloud API is not implemented yet: business-initiated
messages there need an approved template, which is set up per account.
"""
from __future__ import annotations

import logging
from typing import Any, Protocol

import requests

from core.config import Settings
from core.tools import NonRetryable, ToolContext

log = logging.getLogger(__name__)
MAX_BODY = 1600
TWILIO_URL = "https://api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json"


class WhatsAppError(Exception):
    pass


class Notifier(Protocol):
    def send(self, text: str) -> dict[str, Any]: ...


def format_message(org: str, text: str) -> str:
    return f"[{org.upper()}] {text}"[:MAX_BODY]


class ConsoleWhatsApp:
    """Logs messages instead of sending them. Keeps them in ``sent`` for inspection."""

    def __init__(self, org: str):
        self.org = org
        self.sent: list[str] = []

    def send(self, text: str) -> dict[str, Any]:
        body = format_message(self.org, text)
        self.sent.append(body)
        log.info("whatsapp(console): %s", body)
        return {"provider": "console", "status": "logged"}


class TwilioWhatsApp:
    def __init__(self, *, org: str, account_sid: str, auth_token: str, from_number: str,
                 to_number: str, timeout: float = 15.0):
        self.org, self.sid, self._token = org, account_sid, auth_token
        self.from_number, self.to_number, self.timeout = from_number, to_number, timeout

    def __repr__(self) -> str:
        return f"TwilioWhatsApp(org={self.org!r}, sid={self.sid!r})"

    def send(self, text: str) -> dict[str, Any]:
        try:
            res = requests.post(
                TWILIO_URL.format(sid=self.sid),
                auth=(self.sid, self._token),
                data={"From": f"whatsapp:{self.from_number}", "To": f"whatsapp:{self.to_number}",
                      "Body": format_message(self.org, text)},
                timeout=self.timeout,
            )
        except requests.RequestException as e:
            raise WhatsAppError(f"twilio request failed: {type(e).__name__}") from None
        if res.status_code >= 300:
            raise WhatsAppError(f"twilio returned HTTP {res.status_code}")
        data = res.json()
        return {"provider": "twilio", "sid": data.get("sid"), "status": data.get("status")}


def build_notifier(settings: Settings, org: str) -> Notifier:
    if settings.whatsapp_provider == "console":
        return ConsoleWhatsApp(org=org)
    missing = [name for name, val in [("TWILIO_ACCOUNT_SID", settings.twilio_account_sid),
                                      ("TWILIO_AUTH_TOKEN", settings.twilio_auth_token),
                                      ("TWILIO_WHATSAPP_FROM", settings.twilio_whatsapp_from),
                                      ("WHATSAPP_TO", settings.whatsapp_to)] if not val]
    if missing:
        raise ValueError(f"WhatsApp provider twilio needs: {', '.join(missing)}")
    return TwilioWhatsApp(org=org, account_sid=settings.twilio_account_sid.get_secret_value(),
                          auth_token=settings.twilio_auth_token.get_secret_value(),
                          from_number=settings.twilio_whatsapp_from, to_number=settings.whatsapp_to)


def whatsapp_send_tool(notifier: Notifier):
    """Pipeline tool: sends payload['text'] or payload['whatsapp_message']."""

    def send(payload: dict[str, Any], ctx: ToolContext) -> dict[str, Any]:
        text = payload.get("text") or payload.get("whatsapp_message")
        if not text:
            raise NonRetryable("whatsapp_send needs 'text' or 'whatsapp_message'")
        return {"status": "ok", "delivery": notifier.send(text)}

    return send
