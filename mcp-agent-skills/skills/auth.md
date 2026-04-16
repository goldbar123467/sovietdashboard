# Skill: Authentication

Capability: credentialing every provider the dashboard talks to, from a single
auth vault, with a settings UI to edit keys at runtime.

## Per-provider auth

### OpenRouter
- `Authorization: Bearer $OPENROUTER_API_KEY`
- Optional headers for attribution: `HTTP-Referer`, `X-Title`
- Key prefix: `sk-or-v1-...`
- No org/project concept — flat key.

### OpenAI (direct)
- `Authorization: Bearer $OPENAI_API_KEY`
- Optional: `OpenAI-Organization: org_...`, `OpenAI-Project: proj_...`
- Required separately from OpenRouter because Assistants, Responses,
  Realtime, Files, and Batches are not proxied by OpenRouter.
- Scope check: only the Assistants/Responses-enabled keys work for agent mode.

### OpenClaw
- Runs as a local server (user's box). Default is no auth on localhost,
  shared-secret token for LAN.
- TODO (open question): confirm whether `openclaw` exposes a stable HTTP
  control plane we can attach to, or if the dashboard needs to import the
  OpenClaw package directly. See `openclaw/openclaw` → `AGENTS.md`.
- Per-channel tokens (Telegram bot token, Discord bot token, etc.) live in
  OpenClaw's own config — **not** in our vault. We only need the control-plane
  token.

### Hermes Agent
- Self-hosted; server-config token in `hermes.yaml`.
- Docs: https://hermes-agent.nousresearch.com/docs/
- TODO: confirm whether the control surface is REST, WS, or gRPC, and whether
  it supports read-only vs admin scopes (we'll want read-only for the narrator).

## Dashboard auth vault

Single SQLite table, encrypted values:

```
provider_credentials(
  provider TEXT PRIMARY KEY,   -- 'openrouter' | 'openai' | 'openclaw' | 'hermes'
  key_cipher BLOB NOT NULL,    -- AES-GCM with a passphrase-derived key
  meta JSON,                   -- { org, project, base_url, … }
  updated_at INTEGER
)
```

Key derivation: prompt for a dashboard passphrase on first run, derive via
scrypt, keep the derived key in memory only.

Fallback for dev: read from env (`OPENROUTER_API_KEY`, `OPENAI_API_KEY`,
`OPENCLAW_URL` + `OPENCLAW_TOKEN`, `HERMES_URL` + `HERMES_TOKEN`).

## UI

Settings modal, one tab per provider:
- Key field (masked, "Reveal" toggle)
- Base URL (editable, defaults filled in)
- "Test connection" button → calls the provider's cheapest endpoint
  (OpenRouter `/api/v1/auth/key`, OpenAI `/v1/models`, OpenClaw `/health`,
  Hermes `/status`) and shows a green/red indicator.

## Open decisions for the plan

- Passphrase vs OS keyring for the vault?
- Do we support multiple keys per provider (e.g. prod + dev)?
- Do we mirror OpenAI's project scoping into our agent columns?
