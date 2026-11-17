"""Tests for ToolRegistry and the WhatsApp adapter."""
import pytest
import responses

from core.config import Settings
from core.tools import NonRetryable, ToolContext, ToolRegistry
from core.tools.whatsapp import (ConsoleWhatsApp, TwilioWhatsApp, WhatsAppError, build_notifier,
                                 whatsapp_send_tool)


def _ctx(**kw):
    defaults = dict(org="studio", run_id="r1", step="s", idempotency_key="r1:s:0", state={}, store=None)
    return ToolContext(**{**defaults, **kw})


# --- ToolRegistry ----------------------------------------------------------------------------

def test_register_and_call():
    reg = ToolRegistry()
    reg.register("echo", lambda payload, ctx: {"status": "ok", "got": payload["x"]})
    out, meta = reg.call("echo", {"x": 1}, _ctx())
    assert out == {"status": "ok", "got": 1}
    assert meta == {"tool": "echo", "cost_usd": 0.0}


def test_tool_can_return_meta():
    reg = ToolRegistry()
    reg.register("paid", lambda p, c: ({"status": "ok"}, {"cost_usd": 0.2}))
    _, meta = reg.call("paid", {}, _ctx())
    assert meta["cost_usd"] == 0.2


def test_tool_output_defaults_status_ok_and_must_be_dict():
    reg = ToolRegistry()
    reg.register("plain", lambda p, c: {"n": 1})
    reg.register("bad", lambda p, c: [1])
    assert reg.call("plain", {}, _ctx())[0] == {"n": 1, "status": "ok"}
    with pytest.raises(TypeError):
        reg.call("bad", {}, _ctx())


def test_unknown_and_duplicate_tools():
    reg = ToolRegistry()
    reg.register("a", lambda p, c: {})
    with pytest.raises(ValueError):
        reg.register("a", lambda p, c: {})
    with pytest.raises(KeyError):
        reg.call("nope", {}, _ctx())
    assert "a" in reg


# --- WhatsApp ----------------------------------------------------------------------------------

def test_console_records_with_org_prefix():
    wa = ConsoleWhatsApp(org="studio")
    wa.send("Salam")
    assert wa.sent == ["[STUDIO] Salam"]


def test_long_message_truncated():
    wa = ConsoleWhatsApp(org="youtube")
    wa.send("x" * 5000)
    assert len(wa.sent[0]) == 1600
    assert wa.sent[0].startswith("[YOUTUBE] ")


@responses.activate
def test_twilio_posts_form_with_basic_auth():
    url = "https://api.twilio.com/2010-04-01/Accounts/AC123/Messages.json"
    responses.post(url, json={"sid": "SM1", "status": "queued"}, status=201)
    wa = TwilioWhatsApp(org="studio", account_sid="AC123", auth_token="tok",
                        from_number="+14155238886", to_number="+994500000000")
    result = wa.send("Hesabat")
    assert result["sid"] == "SM1"
    req = responses.calls[0].request
    assert req.headers["Authorization"].startswith("Basic ")
    body = req.body if isinstance(req.body, str) else req.body.decode()
    assert "From=whatsapp%3A%2B14155238886" in body
    assert "To=whatsapp%3A%2B994500000000" in body
    assert "Body=%5BSTUDIO%5D+Hesabat" in body


@responses.activate
def test_twilio_error_raises_without_leaking_token():
    url = "https://api.twilio.com/2010-04-01/Accounts/AC123/Messages.json"
    responses.post(url, json={"message": "bad"}, status=400)
    wa = TwilioWhatsApp(org="studio", account_sid="AC123", auth_token="secret-tok",
                        from_number="+1", to_number="+2")
    with pytest.raises(WhatsAppError) as exc:
        wa.send("x")
    assert "secret-tok" not in str(exc.value)
    assert "400" in str(exc.value)


def test_build_notifier_console_default():
    n = build_notifier(Settings(_env_file=None), org="studio")
    assert isinstance(n, ConsoleWhatsApp)


def test_build_notifier_twilio_requires_credentials():
    with pytest.raises(ValueError, match="TWILIO"):
        build_notifier(Settings(_env_file=None, whatsapp_provider="twilio"), org="studio")
    n = build_notifier(Settings(_env_file=None, whatsapp_provider="twilio", twilio_account_sid="AC1",
                                twilio_auth_token="t", twilio_whatsapp_from="+1", whatsapp_to="+2"),
                       org="studio")
    assert isinstance(n, TwilioWhatsApp)


def test_whatsapp_send_tool_uses_text_or_whatsapp_message():
    wa = ConsoleWhatsApp(org="studio")
    tool = whatsapp_send_tool(wa)
    assert tool({"text": "a"}, _ctx())["status"] == "ok"
    tool({"whatsapp_message": "b"}, _ctx())
    assert wa.sent == ["[STUDIO] a", "[STUDIO] b"]
    with pytest.raises(NonRetryable):
        tool({}, _ctx())
