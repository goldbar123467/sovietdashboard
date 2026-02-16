"""
Thin AI client. OpenRouter primary, Anthropic direct fallback.
Every script calls ask() — doesn't care which provider responds.
"""

from config import (
    OPENROUTER_API_KEY, ANTHROPIC_API_KEY,
    BRAIN_MODEL, SCOUT_MODEL,
    BRAIN_MODEL_ANTHROPIC, SCOUT_MODEL_ANTHROPIC,
)

# Map OpenRouter model IDs to Anthropic-direct IDs for fallback
_FALLBACK_MAP = {
    BRAIN_MODEL: BRAIN_MODEL_ANTHROPIC,
    SCOUT_MODEL: SCOUT_MODEL_ANTHROPIC,
}


def _ask_openrouter(model: str, system: str, user: str, max_tokens: int) -> str:
    from openai import OpenAI
    client = OpenAI(
        base_url="https://openrouter.ai/api/v1",
        api_key=OPENROUTER_API_KEY,
    )
    resp = client.chat.completions.create(
        model=model,
        max_tokens=max_tokens,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
    )
    return resp.choices[0].message.content


def _ask_anthropic(model: str, system: str, user: str, max_tokens: int) -> str:
    import anthropic
    client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
    resp = client.messages.create(
        model=model,
        max_tokens=max_tokens,
        system=system,
        messages=[{"role": "user", "content": user}],
    )
    return resp.content[0].text


def ask(model: str, system: str, user: str, max_tokens: int = 4096) -> str:
    """Send a prompt. OpenRouter first, Anthropic fallback."""
    # Try OpenRouter
    if OPENROUTER_API_KEY:
        try:
            return _ask_openrouter(model, system, user, max_tokens)
        except Exception as e:
            print(f"  OpenRouter failed ({e}), falling back to Anthropic...")

    # Fallback to Anthropic direct
    if ANTHROPIC_API_KEY:
        fallback_model = _FALLBACK_MAP.get(model, model)
        return _ask_anthropic(fallback_model, system, user, max_tokens)

    raise RuntimeError("No AI API key configured. Set OPENROUTER_API_KEY or ANTHROPIC_API_KEY.")
