# Skill: Events & Hooks (replacing Python hooks)

Capability: a single normalized event stream that every adapter writes to,
replacing v1's Claude-Code-specific Python hook scripts.

## v1 shape (what we're replacing)

`hooks/*.py`:
- `session_start.py`, `session_end.py`
- `post_tool_use.py`
- `subagent_start.py`, `subagent_stop.py`

These are invoked by Claude Code's hook system and POST to the dashboard
`/api/hook`. Useful only when running inside Claude Code.

## v2 shape

The dashboard backend owns the event bus. Each provider adapter pushes
events onto it directly — no more Python glue.

Event envelope (SQLite `events` table + live WS broadcast):

```json
{
  "id": "evt_…",
  "ts": 1714500000000,
  "provider": "openrouter"|"openai"|"openclaw"|"hermes"|"local",
  "agent_id": "queen"|"coder"|…,
  "session_id": "…",
  "type": "session_start"|"session_end"|"message_in"|"message_out"|
          "tool_call"|"tool_result"|"skill_generated"|"memory_write"|
          "usage"|"error"|"status",
  "payload": { … provider-native fields … },
  "cost_usd": 0.0024
}
```

## Per-provider event sources

| Provider | Source | Mechanism |
|---|---|---|
| OpenRouter | Our SSE stream of `/chat/completions` | Synthesized in the adapter |
| OpenAI | Responses API events | 1:1 mapping from typed events |
| OpenClaw | OpenClaw's local event bus | WS subscribe in adapter |
| Hermes | `WS /sessions/<id>/stream` | Direct proxy |
| Local (MCP) | `send_message` etc. on MCP server | MCP hook → dashboard |

## Keeping v1 Claude-Code hooks alive (optional)

The Python hooks still work for users running inside Claude Code. Map them
onto the v2 envelope:
- `session_start.py` → `type: "session_start", provider: "claude-code"`
- `post_tool_use.py` → `type: "tool_result"`
- etc.

The server-side normalization already exists from the v1 fix commit
(`2426490 fix(server): normalize hook input`). Extend that normalizer to
emit the v2 envelope.

## Narrator input

The narrator (see `ui-and-narrator.md`) reads from the unified event stream
and doesn't care which provider produced an event. One narrator, four
providers.

## Open decisions for the plan

- Do we keep the Python hooks or delete them in v2? (Delete if we commit to
  adapters; keep if users still run Claude Code as a fifth harness.)
- Event retention policy — size cap vs time cap vs both?
