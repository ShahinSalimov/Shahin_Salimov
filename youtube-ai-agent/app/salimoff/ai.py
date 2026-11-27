"""Thin wrapper around app.llm for strategic JSON tasks (analysis, planning, reports)."""
from __future__ import annotations

from .. import llm, store


def demo() -> bool:
    return bool(store.get_settings().get("demo_mode"))


def ask_json(system: str, user: str, max_tokens: int = 6000, temperature: float = 0.7) -> tuple[dict, dict | None]:
    """Uses the provider chosen in Ayarlar → Skript. Returns (parsed_json, cost_entry)."""
    s = store.get_settings()["script"]
    provider = s["llm_provider"]
    # For structured planning the fast chat model is enough and much cheaper than the reasoner.
    model = "deepseek-chat" if provider == "deepseek" else s["llm_model"]
    text, cost = llm.chat(system + "\nAnswer with valid JSON only.", user, provider=provider, model=model,
                          temperature=temperature, max_tokens=max_tokens, json_mode=provider != "anthropic")
    data = llm.extract_json(text)
    if not isinstance(data, dict):
        data = {"items": data}
    return data, cost
