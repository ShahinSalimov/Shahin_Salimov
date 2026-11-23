"""Text generation: DeepSeek, OpenAI (OpenAI-compatible HTTP) and Claude (Anthropic SDK)."""
from __future__ import annotations

import json
import re

import httpx

from . import store


class ProviderError(RuntimeError):
    pass


OPENAI_COMPAT = {
    "deepseek": "https://api.deepseek.com/chat/completions",
    "openai": "https://api.openai.com/v1/chat/completions",
}


def chat(system: str, user: str, *, provider: str, model: str, temperature: float = 1.0,
         max_tokens: int = 8000, json_mode: bool = False) -> tuple[str, dict]:
    """Returns (text, cost_entry)."""
    keys = store.get_keys()
    costs = store.get_settings()["costs"]
    if provider == "anthropic":
        return _claude(system, user, model, keys["anthropic"], max_tokens, costs)
    if provider not in OPENAI_COMPAT:
        raise ProviderError(f"Naməlum LLM provider: {provider}")
    key = keys[provider]
    if not key:
        raise ProviderError(f"{provider} API açarı daxil edilməyib (Ayarlar → API)")
    body = {
        "model": model,
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
        "max_tokens": max_tokens,
    }
    # deepseek-reasoner and OpenAI reasoning models ignore/reject temperature
    if not (model.startswith("deepseek-reasoner") or re.match(r"^(o\d|gpt-5)", model)):
        body["temperature"] = temperature
    if json_mode:
        body["response_format"] = {"type": "json_object"}
    try:
        r = httpx.post(OPENAI_COMPAT[provider], json=body, timeout=600,
                       headers={"Authorization": f"Bearer {key}"})
    except httpx.HTTPError as e:
        raise ProviderError(f"{provider} bağlantı xətası: {e}") from e
    if r.status_code >= 400:
        raise ProviderError(f"{provider} xətası {r.status_code}: {r.text[:300]}")
    data = r.json()
    text = data["choices"][0]["message"].get("content") or ""
    if not text.strip():
        raise ProviderError(f"{provider} boş cavab qaytardı")
    u = data.get("usage", {})
    usd = (u.get("prompt_tokens", 0) * costs[f"{provider}_in_per_m"]
           + u.get("completion_tokens", 0) * costs[f"{provider}_out_per_m"]) / 1e6
    return text, {"kind": "llm", "provider": provider, "usd": usd}


def _claude(system, user, model, key, max_tokens, costs):
    import anthropic

    if not key:
        raise ProviderError("Anthropic API açarı daxil edilməyib (Ayarlar → API)")
    client = anthropic.Anthropic(api_key=key)
    try:
        # Streaming avoids HTTP timeouts on long scripts; server-side fallback
        # re-runs the request on another model if this one declines.
        with client.beta.messages.stream(
            model=model,
            max_tokens=max(max_tokens, 16000),
            system=system,
            messages=[{"role": "user", "content": user}],
            output_config={"effort": "medium"},
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
        ) as stream:
            msg = stream.get_final_message()
    except anthropic.AuthenticationError as e:
        raise ProviderError("Anthropic API açarı yanlışdır") from e
    except anthropic.RateLimitError as e:
        raise ProviderError("Anthropic limitə çatdı, bir az sonra yenidən cəhd edin") from e
    except anthropic.APIStatusError as e:
        raise ProviderError(f"Anthropic xətası {e.status_code}: {e.message}") from e
    except anthropic.APIConnectionError as e:
        raise ProviderError(f"Anthropic bağlantı xətası: {e}") from e
    if msg.stop_reason == "refusal":
        raise ProviderError("Claude bu sorğunu yerinə yetirmədi (refusal). Mövzunu dəyişin.")
    text = "".join(b.text for b in msg.content if b.type == "text")
    if not text.strip():
        raise ProviderError("Claude boş cavab qaytardı")
    usd = (msg.usage.input_tokens * costs["anthropic_in_per_m"]
           + msg.usage.output_tokens * costs["anthropic_out_per_m"]) / 1e6
    return text, {"kind": "llm", "provider": "anthropic", "usd": usd}


def extract_json(text: str):
    """Parse JSON even if wrapped in ``` fences or surrounded by prose."""
    text = text.strip()
    fence = re.search(r"```(?:json)?\s*(.*?)```", text, re.S)
    if fence:
        text = fence.group(1).strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    for open_c, close_c in (("{", "}"), ("[", "]")):
        s, e = text.find(open_c), text.rfind(close_c)
        if s != -1 and e > s:
            try:
                return json.loads(text[s:e + 1])
            except json.JSONDecodeError:
                continue
    raise ProviderError("LLM cavabı JSON formatında deyil")


def test_connection(provider: str) -> str:
    keys = store.get_keys()
    key = keys.get(provider, "")
    if not key:
        raise ProviderError("Açar boşdur")
    urls = {
        "deepseek": ("https://api.deepseek.com/models", {"Authorization": f"Bearer {key}"}),
        "openai": ("https://api.openai.com/v1/models", {"Authorization": f"Bearer {key}"}),
        "anthropic": ("https://api.anthropic.com/v1/models",
                      {"x-api-key": key, "anthropic-version": "2023-06-01"}),
        "fish": ("https://api.fish.audio/model?page_size=1", {"Authorization": f"Bearer {key}"}),
        "elevenlabs": ("https://api.elevenlabs.io/v1/user", {"xi-api-key": key}),
        "kie": ("https://api.kie.ai/api/v1/chat/credit", {"Authorization": f"Bearer {key}"}),
    }
    if provider == "fal":
        return "Açar yadda saxlanıldı (fal.ai üçün ayrıca yoxlama endpoint-i yoxdur; ilk animasiyada yoxlanılacaq)"
    if provider not in urls:
        raise ProviderError("Naməlum provider")
    url, headers = urls[provider]
    try:
        r = httpx.get(url, headers=headers, timeout=30)
    except httpx.HTTPError as e:
        raise ProviderError(f"Bağlantı xətası: {e}") from e
    if r.status_code in (401, 403):
        raise ProviderError(f"Açar qəbul edilmədi ({r.status_code})")
    if r.status_code >= 400:
        raise ProviderError(f"Xəta {r.status_code}: {r.text[:200]}")
    if provider == "kie":  # Kie returns HTTP 200 with its own code field
        body = r.json() if r.headers.get("content-type", "").startswith("application/json") else {}
        if body.get("code") not in (200, None):
            raise ProviderError(f"Açar qəbul edilmədi ({body.get('code')}: {body.get('msg')})")
        return f"Bağlantı uğurludur · balans: {body.get('data')} kredit"
    return "Bağlantı uğurludur"
