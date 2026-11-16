"""Settings loaded from environment variables via pydantic-settings. Single source of secrets.

Empty environment variables are ignored, so a blank ``LLM_MODEL_HEAVY=`` in .env keeps the default.
Secrets are SecretStr and never appear in repr/logs. The Anthropic SDK reads ANTHROPIC_API_KEY itself.
"""
from __future__ import annotations

from typing import Literal

from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

Tier = Literal["heavy", "light"]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_ignore_empty=True, extra="ignore")

    org: Literal["studio", "youtube"] | None = None
    port: int = 8080
    admin_token: SecretStr | None = None
    daily_budget_usd: float = 5.0
    db_path: str | None = None  # default: data/<org>.db

    # LLM
    llm_model_heavy: str = "claude-opus-5-5"
    llm_model_light: str = "claude-sonnet-5-5"
    llm_effort_heavy: Literal["low", "medium", "high", "xhigh", "max"] = "high"
    llm_effort_light: Literal["low", "medium", "high", "xhigh", "max"] = "medium"
    llm_fallbacks: Literal["default", "off"] = "default"
    llm_max_tokens: int = 16000
    llm_prices_json: str | None = None  # {"model-id": [in_per_mtok, out_per_mtok, cache_read_per_mtok]}

    # WhatsApp
    whatsapp_provider: Literal["twilio", "cloud_api", "console"] = "console"
    twilio_account_sid: SecretStr | None = None
    twilio_auth_token: SecretStr | None = None
    twilio_whatsapp_from: str | None = None
    whatsapp_to: str | None = None

    # studio
    gumroad_access_token: SecretStr | None = None
    gumroad_ping_secret: SecretStr | None = None
    gumroad_publish_mode: Literal["api", "browser", "draft"] = "draft"

    # youtube
    yt_client_id: SecretStr | None = None
    yt_client_secret: SecretStr | None = None
    yt_refresh_token: SecretStr | None = None
    yt_channel_id: str | None = None
    tts_api_key: SecretStr | None = None
    media_gen_api_key: SecretStr | None = None


def model_routing(settings: Settings, tiers: dict[str, Tier]) -> dict[str, tuple[str, str]]:
    """Map each agent to (model_id, effort) from its tier."""
    by_tier = {
        "heavy": (settings.llm_model_heavy, settings.llm_effort_heavy),
        "light": (settings.llm_model_light, settings.llm_effort_light),
    }
    return {agent: by_tier[tier] for agent, tier in tiers.items()}
