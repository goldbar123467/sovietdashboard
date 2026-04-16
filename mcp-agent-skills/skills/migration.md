# Skill: Migration Path — v1 → v2

Capability: evolve ТОВАРИЩ ЦЕНТР in place without losing the v1 dev loop.
Every step below is intended to ship independently.

## Current v1 state (as of `08021ae`)

- `mcp-server/` — working MCP message bus, 6 tools.
- `dashboard/server/` — Bun + SQLite + WS, narrator polling OpenRouter.
- `dashboard/client/` — React UI, Soviet theme, 4 agent columns, WS hook,
  anthem on connect.
- `hooks/*.py` — Claude-Code hook scripts POSTing to `/api/hook`.
- `.agents/*.md` — 4 role prompts.
- `.library/<agent>/` — empty folders.
- Task 16 of the original plan is still open (root `npm run dev`
  verification + CLAUDE.md section).

## Migration steps

### Step A — finish v1 Task 16
Close out `docs/superpowers/plans/2026-04-16-tovarish-tsentr.md` Task 16
(verify `npm run dev`, add CLAUDE.md section, final commit). Clean slate
before v2.

### Step B — scaffold the adapter layer
- Create `dashboard/server/src/adapters/{base.ts,index.ts}`.
- Move the existing OpenRouter narrator call site behind
  `adapters/openrouter.ts`. No behavior change.
- Tests: the narrator still runs against the adapter.

### Step C — auth vault + settings panel
- Add `provider_credentials` table.
- Build the Settings → Providers modal.
- Wire env fallback so existing users don't need to re-enter keys.

### Step D — model discovery
- Implement `listModels` for OpenRouter (easy) and OpenAI (ids only).
- Add `model_catalog` table + the AgentCard model picker.

### Step E — OpenAI adapter (raw inference)
- `streamChat` via Responses API (fallback Chat Completions).
- Normalize events into the v2 envelope.
- Second provider proves the adapter interface holds.

### Step F — unified event stream
- Replace direct DB/WS writes with the `publish(event)` fan-out.
- Retire Python hooks behind a feature flag; keep them as a Claude-Code
  adapter if we want that fifth provider.

### Step G — OpenClaw adapter
- Attach-only first: `listSessions`, `attachSession`, `sendInput`.
- Surface SOUL.md skills in the Library panel (read-only).

### Step H — Hermes adapter
- Attach-only: sessions, memory, auto-skills.
- Skill "promote to .library/" flow.

### Step I — slot binding in AgentCard
- Decouple the 4 columns from the v1 hardcoded roles.
- Allow binding a slot to any adapter + identity.

### Step J — narrator retarget
- Templates per event type.
- Configurable narrator model.

### Step K — delete the dead v1 code
- Remove Python hooks if feature flag has been off for a while.
- Collapse any adapter/narrator duplication.

## What to test at each step

Each step must keep `npm run dev` booting three processes and the UI
rendering the 4 columns. If a step breaks the golden path, revert and
re-slice the step.

## Branch strategy

Each step A–K gets its own feature branch off
`claude/review-codebase-progress-gjDUy` (or whatever v2 trunk we pick).
Squash-merge into the trunk. Tag `v2.0.0` after step K.

## Open decisions for the plan

- Do we freeze v1 on a tag before starting v2 work?
- Cut-over for Python hooks: flag, delete, or keep permanently as a 5th
  adapter?
