# Skill: Overview — ТОВАРИЩ ЦЕНТР v2

One dashboard to monitor and control four provider harnesses. The existing
Soviet-themed UI stays; the Claude-Code-only backend becomes provider-agnostic.

## Providers in scope

| # | Name | Role | Home |
|---|------|------|------|
| 1 | OpenRouter | Multi-model proxy (cheap inference + routing) | https://openrouter.ai/ |
| 2 | OpenAI | Direct API: Responses / Assistants / Realtime | https://platform.openai.com/docs |
| 3 | OpenClaw | Personal AI assistant, multi-channel, SOUL.md agents | https://github.com/openclaw/openclaw |
| 4 | Hermes Agent | Self-hosted self-improving harness, auto-skills, persistent memory | https://github.com/nousresearch/hermes-agent |

OpenRouter and OpenAI are **inference providers** — raw completion APIs.
OpenClaw and Hermes are **agent harnesses** — they run long-lived agents,
expose skills/memory, and stream events.

## What stays from v1

- `mcp-server/` — MCP message bus between agents
- `dashboard/server/` — Bun HTTP + WebSocket + SQLite
- `dashboard/client/` — React + xterm, Soviet theme, four agent columns
- `.agents/{queen,coder,tester,reviewer}.md` — role prompts
- `.library/<agent>/` — self-learning folders

## What changes in v2

- `hooks/*.py` (Claude-Code-specific) → `adapters/<provider>.ts` (provider-agnostic)
- Narrator: any provider's event stream, not just Claude Code tool uses
- Agent columns: now provider-tagged (`queen@openrouter`, `coder@openclaw`, …)
- New: auth vault, skill/memory browser, provider switcher

## Non-goals

- Not building our own agent runtime — we orchestrate existing harnesses.
- Not replacing OpenRouter with direct SDK calls where OpenRouter already works.
- Not supporting provider X outside the four above (yet).

## Reading order for the rest of this folder

1. `auth.md` — credentials per provider
2. `models.md` — model discovery
3. `chat-inference.md` — raw completion APIs (OpenRouter, OpenAI)
4. `tool-calling.md` — function-call schemas
5. `agent-sessions.md` — agent/session APIs (OpenClaw, Hermes)
6. `skills-and-memory.md` — SOUL.md, Hermes auto-skills, `.library/`
7. `events-and-hooks.md` — replacing Python hooks with provider event streams
8. `adapters.md` — backend adapter architecture
9. `ui-and-narrator.md` — frontend + narrator updates
10. `migration.md` — upgrade path from v1
