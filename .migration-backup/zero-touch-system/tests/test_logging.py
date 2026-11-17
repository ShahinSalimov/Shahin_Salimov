"""Tests for JSON logging, run context and secret masking."""
import io
import json
import logging

import pytest

from core.config import Settings
from core.logging import JsonFormatter, SecretMasker, configure_logging, log_context, secrets_from_settings


@pytest.fixture
def capture():
    stream = io.StringIO()
    logger = logging.getLogger("zt.test")
    logger.handlers.clear()
    handler = logging.StreamHandler(stream)
    handler.setFormatter(JsonFormatter())
    handler.addFilter(SecretMasker(["super-secret-token-123", "AC-sid-987654"]))
    logger.addHandler(handler)
    logger.setLevel(logging.DEBUG)
    logger.propagate = False

    def lines():
        return [json.loads(line) for line in stream.getvalue().splitlines()]

    yield logger, lines
    logger.handlers.clear()


def test_json_line_has_standard_fields(capture):
    logger, lines = capture
    logger.info("hello %s", "world", extra={"cost_usd": 0.12})
    rec = lines()[0]
    assert rec["msg"] == "hello world" and rec["level"] == "INFO" and rec["logger"] == "zt.test"
    assert rec["ts"].endswith("Z") and rec["cost_usd"] == 0.12


def test_run_context_is_attached(capture):
    logger, lines = capture
    with log_context(org="studio", run_id="studio-1", step="ceo.plan"):
        logger.info("inside")
    logger.info("outside")
    inside, outside = lines()
    assert (inside["org"], inside["run_id"], inside["step"]) == ("studio", "studio-1", "ceo.plan")
    assert "run_id" not in outside


def test_known_secrets_are_masked_in_message_args_and_extra(capture):
    logger, lines = capture
    logger.warning("token=%s", "super-secret-token-123", extra={"auth": "AC-sid-987654 here"})
    rec = lines()[0]
    assert "super-secret-token-123" not in json.dumps(rec)
    assert "AC-sid-987654" not in json.dumps(rec)
    assert "***" in rec["msg"] and "***" in rec["auth"]


@pytest.mark.parametrize("raw", [
    "Authorization: Bearer ya29.a0AfH6SMBxyz-123_abc",
    "key sk-proj-abcdefghijklmnopqrstuv",
    "url https://x.test/api?access_token=abcdef123456&x=1",
    "xi-api-key: 0123456789abcdef0123456789abcdef",
])
def test_secret_patterns_are_masked(capture, raw):
    logger, lines = capture
    logger.info(raw)
    msg = lines()[0]["msg"]
    for secret in ("ya29.a0AfH6SMBxyz-123_abc", "sk-proj-abcdefghijklmnopqrstuv", "abcdef123456",
                   "0123456789abcdef0123456789abcdef"):
        assert secret not in msg


def test_exception_is_serialized_and_masked(capture):
    logger, lines = capture
    try:
        raise RuntimeError("failed with super-secret-token-123")
    except RuntimeError:
        logger.exception("boom")
    rec = lines()[0]
    assert "RuntimeError" in rec["exc"] and "super-secret-token-123" not in rec["exc"]


def test_secrets_from_settings_collects_secret_values():
    s = Settings(_env_file=None, admin_token="admin-token-abc", gumroad_access_token="gum-xyz-123",
                 twilio_auth_token="tw-456789")
    vals = secrets_from_settings(s)
    assert {"admin-token-abc", "gum-xyz-123", "tw-456789"} <= set(vals)


def test_configure_logging_is_idempotent_and_masks_env_secrets(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-api03-secretvalue123456")
    stream = io.StringIO()
    s = Settings(_env_file=None, admin_token="adm-secret-1")
    configure_logging(s, stream=stream)
    configure_logging(s, stream=stream)
    logging.getLogger("zt.cfg").warning("keys adm-secret-1 sk-ant-api03-secretvalue123456")
    out = stream.getvalue().strip().splitlines()
    assert len(out) == 1
    assert "adm-secret-1" not in out[0] and "secretvalue123456" not in out[0]
    logging.getLogger().handlers.clear()


def test_runner_logs_carry_run_id(tmp_path):
    from core.bootstrap import build_runtime
    from core.pipeline import Pipeline, Step
    from core.testing import FakeLLM
    from core.tools.whatsapp import ConsoleWhatsApp

    stream = io.StringIO()
    configure_logging(Settings(_env_file=None), stream=stream, level=logging.INFO)
    pipes = {"p": Pipeline(name="p", start="a", steps={"a": Step(tool="whatsapp_send", next=lambda o, s: None)})}
    rt = build_runtime("studio", Settings(_env_file=None), llm=FakeLLM({}), notifier=ConsoleWhatsApp(org="studio"),
                       db_path=tmp_path / "l.db", pipelines=pipes, schedule=[])
    run_id = rt.runner.start_run("p", {"text": "hi"})
    while rt.runner.tick():
        pass
    rt.stop()
    records = [json.loads(line) for line in stream.getvalue().splitlines()]
    assert any(r.get("run_id") == run_id and r.get("step") == "a" for r in records)
    logging.getLogger().handlers.clear()
