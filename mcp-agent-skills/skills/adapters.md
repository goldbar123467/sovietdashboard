# Skill: Backend Adapter Architecture

Capability: isolate every provider behind a small interface so the rest of
the dashboard can stay provider-agnostic.

## Target layout

```
dashboard/server/src/
  adapters/
    base.ts           # interface + shared types
    openrouter.ts
    openai.ts
    openclaw.ts
    hermes.ts
    index.ts          # registry + dispatcher
  index.ts            # HTTP + WS entry (exists)
  db.ts               # SQLite (exists, extended)
  narrator.ts         # (exists, retargeted)
  types.ts            # (exists, extended)
```

## Interface

```ts
export interface ProviderAdapter {
  readonly name: ProviderName;

  testConnection(): Promise<{ ok: boolean; detail?: string }>;

  listModels(): Promise<ModelInfo[]>;

  // Raw inference (OpenRouter, OpenAI). Throws on harness providers.
  streamChat(req: ChatRequest): AsyncIterable<NormalizedEvent>;

  // Agent-session providers (OpenClaw, Hermes). Throws on inference providers.
  listSessions(): Promise<SessionInfo[]>;
  attachSession(id: string): AsyncIterable<NormalizedEvent>;
  sendInput(id: string, input: string): Promise<void>;

  // Skills + memory
  listSkills(agentId?: string): Promise<SkillRecord[]>;
  readMemory?(sessionId: string): Promise<MemorySnapshot>;
}
```

Capability flags on each adapter so the dispatcher can refuse misuse early:

```ts
openrouter.capabilities = { chat: true, sessions: false, skills: false };
openai.capabilities     = { chat: true, sessions: true,  skills: false };
openclaw.capabilities   = { chat: false, sessions: true, skills: true };
hermes.capabilities     = { chat: false, sessions: true, skills: true };
```

(OpenAI has `sessions: true` because Assistants/Responses with conversation
state qualify.)

## Registry

`adapters/index.ts` constructs adapters from the auth vault, keeps them in a
`Map<ProviderName, ProviderAdapter>`, and exposes:

```ts
getAdapter(name): ProviderAdapter
listProviders(): ProviderName[]
```

## Event fan-out

Every `NormalizedEvent` yielded by an adapter goes to:
1. `db.ts` — persist in `events` table
2. `ws` — broadcast to connected clients
3. `narrator.ts` — enqueue for LLM narration

One central function `publish(event)` does all three. Adapters never touch
the DB or WS directly.

## Error handling

- Connection errors → emit `{type:"error"}` event, do not throw from the
  generator. The dispatcher keeps the agent column alive.
- Auth errors → flip the adapter into a `disconnected` state and surface in
  the header status pill.

## Testing

Each adapter gets a `fake.ts` sibling that replays a recorded event stream
from a JSON fixture. The dashboard boot script checks `NODE_ENV=test` and
swaps real adapters for fakes.

## Open decisions for the plan

- Do we write adapters in TypeScript or generate them from OpenAPI specs
  where available (OpenAI has one)?
- Process model: one adapter per Bun worker, or all adapters in-process?
  (In-process is simpler for v2; workers if we hit event-loop pressure.)
