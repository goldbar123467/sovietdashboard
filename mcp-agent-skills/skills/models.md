# Skill: Model Discovery

Capability: let the user pick a model per agent, per provider, with live pricing
and context-window info where the provider exposes it.

## OpenRouter
- `GET /api/v1/models` → full catalog with pricing, context length, modality.
- Rich metadata — use this as the canonical shape the dashboard renders.
- Sample fields: `id`, `name`, `context_length`, `pricing.prompt`,
  `pricing.completion`, `architecture.modality`.

## OpenAI
- `GET /v1/models` → ids only (no pricing).
- Pricing must be hard-coded or pulled from a static table we ship.
- Worth filtering client-side to the families we expose:
  `gpt-*`, `o*`, `text-embedding-*`, `whisper-*`, `tts-*`.

## OpenClaw
- Model list depends on the backends the user wired into `openclaw.yaml`
  (it proxies OpenAI/Anthropic/Ollama/etc.).
- TODO: does OpenClaw expose a `/models` endpoint, or do we parse the config?

## Hermes Agent
- Hermes runs Nous's own Hermes-family models plus any HF/endpoint the user
  configures. Expect `GET /models` but confirm.

## Dashboard storage

Cache for speed, refresh on demand:

```
model_catalog(
  provider TEXT,
  model_id TEXT,
  display_name TEXT,
  context_length INT,
  prompt_price_per_mtok REAL,
  completion_price_per_mtok REAL,
  modalities TEXT,          -- JSON array
  raw JSON,
  fetched_at INT,
  PRIMARY KEY (provider, model_id)
)
```

Refresh triggers:
- Manual "Refresh models" button in the settings modal.
- On boot if cache older than 24h.

## UI

Per-agent model picker (in AgentCard):
- Grouped by provider → searchable model list.
- Shows `$in / $out per Mtok` and `ctx` badge.
- Warn when switching to a model whose context < current conversation size.

## Open decisions for the plan

- Do we show hidden OpenAI models (`gpt-4o-realtime-preview` etc.) or only
  the ones in a curated allowlist?
- Where do we source OpenAI prices — static JSON we maintain, or scraped on
  boot from the pricing page? Static JSON is safer.
