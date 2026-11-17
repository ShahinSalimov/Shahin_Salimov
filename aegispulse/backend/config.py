"""Runtime configuration loaded from environment variables / .env."""

from __future__ import annotations

from functools import lru_cache
from typing import Annotated

from pydantic import Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

CsvList = Annotated[list[str], NoDecode]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # --- Core -------------------------------------------------------------
    environment: str = Field(default="development", alias="AEGIS_ENV")
    log_level: str = Field(default="INFO", alias="AEGIS_LOG_LEVEL")
    database_url: str = Field(
        default="postgresql+asyncpg://aegis:aegis@localhost:5432/aegispulse", alias="DATABASE_URL"
    )
    redis_url: str | None = Field(default=None, alias="REDIS_URL")
    auto_create_schema: bool = Field(default=True, alias="AEGIS_AUTO_CREATE_SCHEMA")
    seed_demo_company: bool = Field(default=True, alias="AEGIS_SEED_DEMO_COMPANY")

    # --- Security ---------------------------------------------------------
    api_keys: CsvList = Field(default_factory=list, alias="AEGIS_API_KEYS")
    cors_origins: CsvList = Field(default_factory=lambda: ["http://localhost:3000"], alias="AEGIS_CORS_ORIGINS")
    rate_limit_per_minute: int = Field(default=120, alias="AEGIS_RATE_LIMIT_PER_MINUTE")
    expensive_rate_limit_per_minute: int = Field(default=10, alias="AEGIS_EXPENSIVE_RATE_LIMIT_PER_MINUTE")
    max_ingest_chars: int = Field(default=50_000, alias="AEGIS_MAX_INGEST_CHARS")

    # --- AI engine --------------------------------------------------------
    anthropic_api_key: SecretStr | None = Field(default=None, alias="ANTHROPIC_API_KEY")
    model: str = Field(default="claude-opus-5-5", alias="AEGIS_MODEL")
    triage_effort: str = Field(default="medium", alias="AEGIS_TRIAGE_EFFORT")
    context_effort: str = Field(default="high", alias="AEGIS_CONTEXT_EFFORT")
    remediation_effort: str = Field(default="high", alias="AEGIS_REMEDIATION_EFFORT")
    enable_fallbacks: bool = Field(default=True, alias="AEGIS_ENABLE_FALLBACKS")
    analysis_concurrency: int = Field(default=4, alias="AEGIS_ANALYSIS_CONCURRENCY")

    # --- Alerting ---------------------------------------------------------
    alert_severity_threshold: float = Field(default=8.0, alias="AEGIS_ALERT_SEVERITY_THRESHOLD")
    auto_dispatch_alerts: bool = Field(default=True, alias="AEGIS_AUTO_DISPATCH_ALERTS")
    dashboard_base_url: str = Field(default="http://localhost:3000", alias="AEGIS_DASHBOARD_URL")
    slack_webhook_url: SecretStr | None = Field(default=None, alias="SLACK_WEBHOOK_URL")
    twilio_account_sid: str | None = Field(default=None, alias="TWILIO_ACCOUNT_SID")
    twilio_auth_token: SecretStr | None = Field(default=None, alias="TWILIO_AUTH_TOKEN")
    twilio_whatsapp_from: str | None = Field(default=None, alias="TWILIO_WHATSAPP_FROM")
    twilio_whatsapp_to: CsvList = Field(default_factory=list, alias="TWILIO_WHATSAPP_TO")
    generic_webhook_url: str | None = Field(default=None, alias="ALERT_WEBHOOK_URL")
    generic_webhook_secret: SecretStr | None = Field(default=None, alias="ALERT_WEBHOOK_SECRET")

    @field_validator("api_keys", "cors_origins", "twilio_whatsapp_to", mode="before")
    @classmethod
    def _split_csv(cls, value: object) -> object:
        if isinstance(value, str):
            return [item.strip() for item in value.split(",") if item.strip()]
        return value

    @field_validator(
        "redis_url",
        "anthropic_api_key",
        "slack_webhook_url",
        "twilio_account_sid",
        "twilio_auth_token",
        "twilio_whatsapp_from",
        "generic_webhook_url",
        "generic_webhook_secret",
        mode="before",
    )
    @classmethod
    def _blank_is_unset(cls, value: object) -> object:
        # docker-compose passes unset variables as "", which must mean "not configured".
        if isinstance(value, str) and not value.strip():
            return None
        return value

    @property
    def ai_configured(self) -> bool:
        return bool(self.anthropic_api_key and self.anthropic_api_key.get_secret_value())

    @property
    def is_production(self) -> bool:
        return self.environment.lower() == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()
