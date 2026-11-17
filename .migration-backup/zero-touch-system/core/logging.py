"""JSON logging with run context and secret masking.

Every log line is one JSON object: ts, level, logger, msg, the current run context (org, run_id,
step, set by the runner with ``log_context``) and any ``extra`` fields. A SecretMasker filter replaces
known secret values (all SecretStr settings plus API-key env vars) and common token patterns
(Bearer tokens, sk-..., ya29..., access_token=..., xi-api-key) with ``***`` in the message, extra
fields and exception text, before anything is written.
"""
from __future__ import annotations

import contextlib
import contextvars
import json
import logging
import os
import re
import sys
from datetime import datetime, timezone
from typing import Any, Iterator, TextIO

from pydantic import SecretStr

MASK = "***"
_CONTEXT: contextvars.ContextVar[dict[str, Any]] = contextvars.ContextVar("zt_log_context", default={})
_STANDARD = set(vars(logging.LogRecord("", 0, "", 0, "", (), None))) | {"message", "asctime"}
SECRET_ENV_VARS = ("ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "OPENAI_API_KEY")
PATTERNS = [
    (re.compile(r"(?i)\b(bearer)\s+[A-Za-z0-9._~+/=-]{8,}"), r"\1 " + MASK),
    (re.compile(r"\bsk-[A-Za-z0-9_-]{10,}"), MASK),
    (re.compile(r"\bya29\.[A-Za-z0-9._-]{8,}"), MASK),
    (re.compile(r"(?i)\b(access_token|refresh_token|api_key|apikey|token|secret|password|client_secret)"
                r"(=|:\s*)([^&\s\"']{4,})"), r"\1\2" + MASK),
    (re.compile(r"(?i)\b(xi-api-key|x-admin-token|authorization)(:\s*)([^\s\"']{6,})"), r"\1\2" + MASK),
]
_HANDLER_FLAG = "_zt_handler"


@contextlib.contextmanager
def log_context(**fields: Any) -> Iterator[None]:
    token = _CONTEXT.set({**_CONTEXT.get(), **{k: v for k, v in fields.items() if v is not None}})
    try:
        yield
    finally:
        _CONTEXT.reset(token)


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        out: dict[str, Any] = {
            "ts": datetime.fromtimestamp(record.created, timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ"),
            "level": record.levelname, "logger": record.name, "msg": record.getMessage(),
        }
        out.update(getattr(record, "_zt_context", None) or _CONTEXT.get())
        for k, v in vars(record).items():
            if k not in _STANDARD and not k.startswith("_"):
                out[k] = v
        if record.exc_info:
            out["exc"] = record.exc_text or self.formatException(record.exc_info)
        return json.dumps(out, ensure_ascii=False, default=str)


class SecretMasker(logging.Filter):
    def __init__(self, secrets: list[str] | None = None):
        super().__init__()
        self.secrets = sorted({s for s in (secrets or []) if s and len(s) >= 6}, key=len, reverse=True)

    def mask(self, text: str) -> str:
        for s in self.secrets:
            text = text.replace(s, MASK)
        for pattern, repl in PATTERNS:
            text = pattern.sub(repl, text)
        return text

    def _mask_value(self, v: Any) -> Any:
        if isinstance(v, str):
            return self.mask(v)
        if isinstance(v, (dict, list)):
            return json.loads(self.mask(json.dumps(v, ensure_ascii=False, default=str)))
        return v

    def filter(self, record: logging.LogRecord) -> bool:
        record.msg = self.mask(record.getMessage())
        record.args = ()
        for k, v in list(vars(record).items()):
            if k not in _STANDARD and not k.startswith("_"):
                setattr(record, k, self._mask_value(v))
        if record.exc_info:
            record.exc_text = self.mask(logging.Formatter().formatException(record.exc_info))
        record._zt_context = _CONTEXT.get()
        return True


def secrets_from_settings(settings: Any) -> list[str]:
    values = [v.get_secret_value() for v in vars(settings).values() if isinstance(v, SecretStr)]
    values += [os.environ[name] for name in SECRET_ENV_VARS if os.environ.get(name)]
    return [v for v in values if v]


def configure_logging(settings: Any, *, stream: TextIO | None = None, level: int = logging.INFO) -> None:
    """Install one JSON handler with secret masking on the root logger (idempotent)."""
    root = logging.getLogger()
    for h in list(root.handlers):
        if getattr(h, _HANDLER_FLAG, False):
            root.removeHandler(h)
    handler = logging.StreamHandler(stream or sys.stdout)
    setattr(handler, _HANDLER_FLAG, True)
    handler.setFormatter(JsonFormatter())
    handler.addFilter(SecretMasker(secrets_from_settings(settings)))
    root.addHandler(handler)
    root.setLevel(level)
    for noisy in ("apscheduler", "werkzeug", "urllib3"):
        logging.getLogger(noisy).setLevel(logging.WARNING)
