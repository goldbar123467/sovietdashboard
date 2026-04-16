# Skill: UI + Narrator Updates

Capability: keep the Soviet-themed layout, retarget the panels from
Claude-Code-only to four providers.

## Panels that survive unchanged

- **SovietBackground** — constructivist rays, sickle watermarks. Keep.
- **Header** — anthem on connect, hammer-sickle. Keep.
- **AgentColumn / AgentCard** — 4 columns, 4 agents. Keep the shape.
- **TerminalPanel** — xterm, read-only (per `08021ae` fix). Keep.
- **NarratorPanel** — streaming commentary. Keep the component.
- **ChatPanel** — user-to-queen chat. Keep.

## Panels that get reskinned

### AgentCard
Add a **slot binding** dropdown:
```
[queen] bound to: [OpenRouter › claude-3.5-sonnet ▾]
                  [OpenClaw › queen.soul.md       ▾]
                  [Hermes  › session abc123       ▾]
                  [OpenAI  › gpt-5 (responses)    ▾]
```
Below: model id, context window, $in/$out, live token/cost counters.

### MetricsPanel
Grouped by provider:
- OpenRouter: spend today, requests, top models.
- OpenAI: same, plus per-project breakdown if org/project headers set.
- OpenClaw: running agents, channel event counts.
- Hermes: active sessions, skills learned today, memory bytes.

### New panel: Library
Described in `skills-and-memory.md`. Replaces the empty `.library/` stubs.

### New panel: Settings → Providers
Described in `auth.md`.

## Narrator retarget

v1 narrator polls every 20s, narrates Claude-Code tool uses, speaks in
Soviet-propaganda style. v2 keeps the voice, broadens the input:

- Consumes the unified event stream (`events-and-hooks.md`).
- Per-event-type templates so the narrator knows how to frame a
  `skill_generated` (Hermes) vs a `tool_call` (OpenClaw) vs a `usage` spike
  (OpenRouter).
- Model for the narrator itself should be cheap and steerable — Haiku via
  OpenRouter is a good default; make it configurable in settings.
- Rate limit: no more than one narration per 20s per agent, regardless of
  event volume.

Propaganda voice examples (for the prompt):
- `tool_call`: "Comrade queen delegates to the coder brigade — the five-year
  plan advances."
- `skill_generated` (Hermes): "A new skill emerges from the workers'
  experience. Filed in the great library."
- `usage` spike: "The furnace burns hot — 40k tokens consumed this hour."

## Open decisions for the plan

- One narrator for all providers, or a narrator per provider with a
  "news desk" anchor that reads from all of them?
- Do we keep the anthem-on-connect, or change it when a non-Claude provider
  connects (e.g. OpenClaw gets a lobster chord)?
