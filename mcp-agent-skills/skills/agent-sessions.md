# Skill: Agent Sessions (OpenClaw + Hermes)

Capability: start, stop, observe, and send messages to long-lived agents that
run inside OpenClaw or Hermes. Unlike raw completions, sessions have state,
memory, and their own event loops — the dashboard attaches, it does not drive
the loop.

## OpenClaw sessions

- An OpenClaw agent is a SOUL.md file loaded into a running instance.
- Lifecycle: `openclaw start <agent>` → listens on its configured channels.
- Observability: OpenClaw emits events to its local event bus (channel
  messages in/out, tool calls, cron triggers).
- Dashboard attach:
  - `GET /agents` — list running agents.
  - `WS /events` — subscribe to the event stream.
  - `POST /agents/<id>/messages` — inject a message (appears as a "dashboard"
    channel).
- TODO: verify exact endpoints against
  https://github.com/openclaw/openclaw/blob/main/AGENTS.md.

## Hermes sessions

- A Hermes session is a persistent agent process with memory + auto-skills.
- Lifecycle: Hermes keeps the session alive across dashboard restarts; we
  resume by session id.
- Observability: session event stream with typed events
  (`message`, `skill_invoked`, `skill_generated`, `memory_write`).
- Dashboard attach:
  - `GET /sessions` — list.
  - `WS /sessions/<id>/stream` — live events.
  - `POST /sessions/<id>/input` — inject user input.
  - `GET /sessions/<id>/skills` — list learned skills (see
    `skills-and-memory.md`).
- TODO: check https://hermes-agent.nousresearch.com/docs/ for the actual
  paths.

## Unified dashboard shape

The dashboard abstracts both under one WS event envelope:

```json
{
  "provider": "openclaw" | "hermes",
  "session_id": "…",
  "agent_id": "queen" | "coder" | …,
  "event": {
    "type": "input" | "output" | "tool_call" | "skill_generated" |
            "memory_write" | "status" | "error",
    "…provider-specific fields kept under `raw`": { }
  }
}
```

## Mapping to v1 agent columns

v1 fixed 4 columns (queen/coder/tester/reviewer). v2 keeps 4 columns but each
column is now a **slot**; the user binds a slot to:
- a raw-inference identity (OpenRouter/OpenAI model + system prompt), OR
- a live OpenClaw SOUL agent, OR
- a live Hermes session.

The column shows the same UI (status, last message, token/cost counter),
sourced from whichever adapter is bound.

## Open decisions for the plan

- How do we handle a Hermes session outliving the dashboard passphrase
  (key-rotation case)?
- Should the dashboard be allowed to **start** OpenClaw agents, or only
  attach to ones the user already started?
