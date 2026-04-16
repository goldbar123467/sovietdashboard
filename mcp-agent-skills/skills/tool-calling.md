# Skill: Tool Calling

Capability: let an agent call the dashboard's MCP tools (and external tools)
uniformly across providers. The MCP server from v1 stays as the shared tool
registry.

## Provider schemas

### OpenRouter / OpenAI Chat Completions
- Request: `tools: [{ type: "function", function: { name, description, parameters } }]`
- Response: `choices[0].message.tool_calls: [{ id, type:"function", function:{name, arguments} }]`
- `arguments` is a JSON **string** — always parse, never assume object.

### OpenAI Responses API
- Request: `tools: [{ type: "function", name, description, parameters, strict }]`
- Streamed events: `response.function_call_arguments.delta`, `.done`.
- `strict: true` enforces JSON-schema conformance on the model output.

### OpenClaw
- Tools are YAML-declared in SOUL.md (`tools:` section). Invocation is
  internal to OpenClaw.
- From the dashboard we **observe** tool calls via events (see
  `events-and-hooks.md`); we don't inject tool calls into a running OpenClaw
  agent from outside.

### Hermes Agent
- Hermes auto-generates skills from experience (see `skills-and-memory.md`).
- It exposes a `tools` list in its session API; we can register dashboard MCP
  tools as Hermes tools at session start.
- TODO: confirm the exact schema — check `hermes-agent/docs/tools`.

## Normalized dashboard shape

All adapters emit tool calls in one shape to the WS stream:

```json
{
  "type": "tool_call",
  "provider": "openrouter" | "openai" | "openclaw" | "hermes",
  "agent_id": "queen",
  "call_id": "tc_…",
  "name": "send_message",
  "arguments": { "to": "coder", "body": "…" },
  "status": "pending" | "running" | "ok" | "error",
  "result"?: any,
  "duration_ms"?: number
}
```

## MCP bridge

The dashboard MCP server already exposes `register_agent`, `send_message`,
`fetch_messages`, `reserve_files`, `release_files`, `list_agents`. In v2 the
adapter layer:

1. At agent start, reads the MCP tool manifest.
2. Converts it to each provider's native tool schema.
3. When a tool call arrives in a stream, executes it against the MCP server
   and returns the result back into the provider's continuation API.

## Open decisions for the plan

- Do we expose the full MCP toolset to every agent, or filter by role
  (reviewer read-only, queen full)?
- Hermes already has its own skill system — do we let its auto-skills call
  back into our MCP, or keep Hermes sandboxed?
