"""Shared fixtures: isolated SQLite database, fake Anthropic API, live app client."""

from __future__ import annotations

import os
import sys
from collections.abc import AsyncIterator
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

# Environment must be set before backend modules read settings.
os.environ.update(
    {
        "AEGIS_ENV": "test",
        "AEGIS_API_KEYS": "test-key-1,test-key-2",
        "AEGIS_SEED_DEMO_COMPANY": "true",
        "AEGIS_AUTO_DISPATCH_ALERTS": "true",
        "AEGIS_LOG_LEVEL": "WARNING",
    }
)
for var in ("REDIS_URL", "ANTHROPIC_API_KEY", "SLACK_WEBHOOK_URL", "TWILIO_ACCOUNT_SID", "ALERT_WEBHOOK_URL"):
    os.environ.pop(var, None)

import httpx  # noqa: E402

from agents import PipelineConfig, ThreatPipeline  # noqa: E402
from tests.fakes import FakeAnthropic  # noqa: E402

API_HEADERS = {"X-API-Key": "test-key-1"}


@pytest.fixture
def fake_anthropic() -> FakeAnthropic:
    return FakeAnthropic()


@pytest.fixture
def pipeline(fake_anthropic: FakeAnthropic) -> ThreatPipeline:
    return ThreatPipeline(client=fake_anthropic.client(), config=PipelineConfig(max_tool_rounds=4))


@pytest.fixture
async def app_client(tmp_path: Path, pipeline: ThreatPipeline) -> AsyncIterator[httpx.AsyncClient]:
    os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{tmp_path / 'aegis.db'}"
    from backend import analysis_service
    from backend.config import get_settings
    from backend.security import rate_limiter

    get_settings.cache_clear()
    rate_limiter.reset()
    analysis_service.set_pipeline(pipeline)

    from backend.main import create_app

    app = create_app()
    async with app.router.lifespan_context(app):
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test", headers=API_HEADERS) as client:
            yield client
    analysis_service.set_pipeline(None)
    get_settings.cache_clear()


@pytest.fixture
async def drain() -> AsyncIterator[object]:
    from backend.task_queue import queue

    async def _drain() -> None:
        await queue.drain()

    yield _drain
