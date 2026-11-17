"""YouTube tool adapters and their registration (called by core.bootstrap).

Providers are chosen from settings (``api``/real or ``fake``). Missing credentials do not break start-up:
the affected tool raises NonRetryable when it is first used, naming the variable to set.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Callable

from core.config import Settings
from core.db import JobStore
from core.tools import NonRetryable, ToolContext, ToolRegistry
from orgs.youtube.tools.google import GoogleAuth, QuotaTracker
from orgs.youtube.tools.media_gen import FakeImageGen, OpenAIImageGen
from orgs.youtube.tools.qc import qc_measure_tool
from orgs.youtube.tools.render import music_library, render_tool
from orgs.youtube.tools.tts import ElevenLabsTTS, FakeTTS
from orgs.youtube.tools.youtube_upload import THUMBNAIL_COST, FakeUploader, YouTubeUploader, youtube_upload_tool
from orgs.youtube.tools.yt_analytics import AnalyticsClient, weekly_analytics_tool
from orgs.youtube.tools.yt_signals import LIST_COST, SEARCH_COST, YouTubeDataClient, collect_yt_signals_tool

ROOT = Path(__file__).resolve().parents[3]
FONT_CANDIDATES = ["/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
                   "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "/usr/share/fonts/TTF/DejaVuSans.ttf"]
DIRECTIVE_TTL_DAYS = 14
MAX_KEYWORDS = 3


class _Missing:
    """Stands in for a provider whose credentials are not configured."""

    def __init__(self, what: str, env: str, name: str = "missing", is_ai: bool = True):
        self.what, self.env, self.name, self.is_ai = what, env, name, is_ai

    def __getattr__(self, attr: str) -> Callable[..., Any]:
        def fail(*a, **k):
            raise NonRetryable(f"{self.what} is not configured: set {self.env}")
        return fail


def _csv(s: str) -> list[str]:
    return [x.strip() for x in (s or "").split(",") if x.strip()]


def channel_profile(settings: Settings) -> dict[str, Any]:
    return {"channel_id": settings.yt_channel_id, "niche": settings.yt_niche, "format": settings.yt_format,
            "language": settings.yt_language, "voice_id": settings.yt_voice_id,
            "visual_style": settings.yt_visual_style, "banned_topics": _csv(settings.yt_banned_topics)}


def find_font(path: str | None) -> str | None:
    for c in ([path] if path else []) + FONT_CANDIDATES:
        if c and Path(c).is_file():
            return c
    return None


def gate_tool(settings: Settings, quota: QuotaTracker, tts_name: str, image_name: str, data_dir: Path):
    """First step of youtube_daily: config check, daily cap, throttle, quota budget. No LLM is called before it."""

    def gate(payload: dict[str, Any], ctx: ToolContext) -> dict[str, Any]:
        if not settings.yt_niche:
            raise NonRetryable("YT_NICHE is not set; describe the channel niche in the environment")
        now = datetime.now(timezone.utc)
        if len(ctx.store.videos_created_on(now.strftime("%Y-%m-%d"))) >= settings.videos_per_day:
            return {"status": "rejected", "errors": [f"videos_per_day ({settings.videos_per_day}) reached"]}
        if ctx.store.get_control("throttle:youtube") and now.timetuple().tm_yday % 2 == 1:
            return {"status": "rejected", "errors": ["throttle: Growth Banker halved production (every other day)"]}
        keywords = (_csv(settings.yt_seed_keywords) or [settings.yt_niche])[:MAX_KEYWORDS]
        needed = len(keywords) * (SEARCH_COST + 2 * LIST_COST) + settings.yt_upload_quota_cost + THUMBNAIL_COST
        if quota.remaining() < needed:
            return {"status": "rejected", "errors": [f"quota: need {needed} units, {quota.remaining()} left today"]}
        return {"status": "ok", "channel_profile": channel_profile(settings), "keywords": keywords,
                "available_providers": {"tts": [tts_name], "image": [image_name], "video": [],
                                        "music_library": music_library(data_dir)},
                "publish_hours_utc": [int(h) for h in _csv(settings.yt_publish_hours_utc)] or [14, 17]}

    return gate


def apply_growth_tool():
    def apply(payload: dict[str, Any], ctx: ToolContext) -> dict[str, Any]:
        exp = (datetime.now(timezone.utc) + timedelta(days=DIRECTIVE_TTL_DAYS)).strftime("%Y-%m-%dT%H:%M:%S.%fZ")
        saved = 0
        for agent, texts in (payload.get("directives") or {}).items():
            for t in texts:
                ctx.store.add_directive(ctx.org, agent, t, expires_at=exp)
                saved += 1
        throttle = bool(payload.get("throttle"))
        ctx.store.set_control("throttle:youtube", throttle)
        return {"status": "ok", "saved_directives": saved, "throttle": throttle,
                "whatsapp_message": payload["whatsapp_message"]}

    return apply


def register_tools(registry: ToolRegistry, settings: Settings, store: JobStore) -> None:
    data_dir = Path(settings.data_dir or ROOT / "data")
    quota = QuotaTracker(store, settings.yt_daily_quota_units)
    creds = (settings.yt_client_id, settings.yt_client_secret, settings.yt_refresh_token)
    auth = GoogleAuth(*(c.get_secret_value() for c in creds)) if all(creds) else None
    need_auth = "YT_CLIENT_ID, YT_CLIENT_SECRET and YT_REFRESH_TOKEN (run scripts/youtube_oauth.py)"

    if settings.yt_signal_mode == "fake":
        from orgs.youtube.fakes import FakeSignalClient
        signals: Any = FakeSignalClient()
    else:
        signals = YouTubeDataClient(auth, quota) if auth else _Missing("YouTube Data API", need_auth)

    if settings.tts_provider == "fake":
        tts: Any = FakeTTS()
    else:
        tts = (ElevenLabsTTS(settings.tts_api_key.get_secret_value()) if settings.tts_api_key
               else _Missing("ElevenLabs TTS", "TTS_API_KEY", name="elevenlabs"))

    if settings.media_provider == "fake":
        images: Any = FakeImageGen()
    else:
        images = (OpenAIImageGen(settings.media_gen_api_key.get_secret_value()) if settings.media_gen_api_key
                  else _Missing("OpenAI image generation", "MEDIA_GEN_API_KEY", name="openai_images"))

    if settings.yt_upload_mode == "fake":
        uploader: Any = FakeUploader()
    else:
        uploader = (YouTubeUploader(auth, quota, settings.yt_upload_quota_cost) if auth
                    else _Missing("YouTube upload", need_auth))

    if settings.yt_analytics_mode == "fake":
        from orgs.youtube.fakes import FakeAnalytics
        analytics: Any = FakeAnalytics()
    else:
        analytics = AnalyticsClient(auth) if auth else _Missing("YouTube Analytics", need_auth)

    weekly = weekly_analytics_tool(analytics)
    profile = channel_profile(settings)

    registry.register("yt_gate", gate_tool(settings, quota, tts.name, images.name, data_dir))
    registry.register("collect_yt_signals", collect_yt_signals_tool(signals))
    registry.register("render_video", render_tool(tts, images, data_dir, font_path=find_font(settings.pdf_font_path),
                                                  tts_usd_per_1k_chars=settings.tts_usd_per_1k_chars,
                                                  image_usd_each=settings.image_usd_each))
    registry.register("qc_measure", qc_measure_tool())
    registry.register("youtube_upload", youtube_upload_tool(uploader))
    registry.register("weekly_analytics", lambda p, ctx: {**weekly(p, ctx), "channel_profile": profile})
    registry.register("apply_growth", apply_growth_tool())
