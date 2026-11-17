"""Tests for core.config."""
from core.config import Settings, model_routing


def test_defaults_and_empty_env_ignored(monkeypatch):
    monkeypatch.setenv("LLM_MODEL_HEAVY", "")
    monkeypatch.setenv("ORG", "studio")
    s = Settings(_env_file=None)
    assert s.org == "studio"
    assert s.llm_model_heavy == "claude-opus-5-5"
    assert s.llm_model_light == "claude-sonnet-5-5"
    assert s.llm_fallbacks == "default"


def test_env_overrides(monkeypatch):
    monkeypatch.setenv("LLM_MODEL_LIGHT", "claude-haiku-5-5")
    monkeypatch.setenv("DAILY_BUDGET_USD", "2.5")
    s = Settings(_env_file=None)
    assert s.llm_model_light == "claude-haiku-5-5"
    assert s.daily_budget_usd == 2.5


def test_secrets_not_in_repr(monkeypatch):
    monkeypatch.setenv("ADMIN_TOKEN", "super-secret-value")
    s = Settings(_env_file=None)
    assert "super-secret-value" not in repr(s)


def test_model_routing():
    s = Settings(_env_file=None, llm_model_heavy="H", llm_model_light="L",
                 llm_effort_heavy="high", llm_effort_light="medium")
    routing = model_routing(s, {"ceo": "heavy", "research": "light"})
    assert routing == {"ceo": ("H", "high"), "research": ("L", "medium")}
