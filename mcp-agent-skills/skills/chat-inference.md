# Skill: Chat Inference (raw completions)

Capability: stream a chat completion through any inference provider with a
single dashboard call. Applies to OpenRouter and OpenAI. OpenClaw and Hermes
aren't raw-completion APIs — see `agent-sessions.md`.

## OpenRouter

- `POST https://openrouter.ai/api/v1/chat/completions`
- OpenAI-compatible request body — the common path.
- Streaming: `stream: true` → SSE, `data: {...}\n\n` chunks, terminates with
  `data: [DONE]`.
- Useful extensions: `provider.order`, `transforms: ["middle-out"]`,
  `route: "fallback"`.
- Cost per call reported in the final chunk's `usage` and in `x-*` response
  headers.

## OpenAI

Two APIs to choose between:

### Chat Completions (legacy, still supported)
- `POST https://api.openai.com/v1/chat/completions`
- Same shape as OpenRouter above.

### Responses API (modern)
- `POST https://api.openai.com/v1/responses`
- Event-based streaming: typed events like `response.output_text.delta`,
  `response.completed`, `response.error`.
- Supports built-in tools (`web_search`, `file_search`, `code_interpreter`)
  without us wiring the tool loop.
- First choice for v2; fall back to Chat Completions for older models.

## Dashboard contract

Backend exposes one endpoint regardless of provider:

```
POST /api/chat/stream
  { agent_id, provider, model, messages, tools?, … }
  → server-sent events, normalized to:
    { type: "delta", text: "…" }
    { type: "tool_call", id, name, args }
    { type: "usage", prompt, completion, cost_usd }
    { type: "done" }
    { type: "error", message }
```

The adapter per provider translates its native stream into this shape. See
`adapters.md`.

## Cancellation

- OpenRouter / OpenAI: close the SSE connection.
- Persist partial output and a `cancelled_at` timestamp so the UI can show
  "interrupted" and the narrator can narrate the cancel.

## Open decisions for the plan

- Do we store every delta, or only the concatenated final text? (Deltas cost
  disk but make the TerminalPanel replay exact.)
- Use Responses API for OpenAI everywhere, or only for models that support it?
