# Skill: Skills & Memory

Capability: one UI to browse, edit, and version the "knowledge" each agent
accumulates. v1 had `.library/<agent>/*.md` as a stub. v2 unifies three
sources:

1. **v1 `.library/<agent>/`** — hand-written patterns, re-read every 50 prompts.
2. **OpenClaw SOUL.md agents** — YAML+markdown configs that define an agent
   (persona, tools, channels, cron jobs). The `awesome-openclaw-agents`
   repo has 162 templates across 19 categories.
3. **Hermes auto-generated skills** — Hermes watches its own sessions,
   extracts reusable patterns, and writes them to its skill store.

## Unified skill record

```
skills(
  id TEXT PRIMARY KEY,          -- "<provider>:<agent>:<slug>"
  provider TEXT,                -- 'local' | 'openclaw' | 'hermes'
  agent_id TEXT,
  title TEXT,
  body_md TEXT,                 -- canonical markdown
  source_path TEXT,             -- original on-disk path if any
  auto_generated INT,           -- 0 local/SOUL, 1 Hermes
  created_at INT,
  updated_at INT,
  tags JSON
)
```

Canonical form is markdown. For SOUL.md we preserve YAML front-matter
verbatim; for Hermes we serialize their skill objects into markdown +
front-matter.

## Sync direction

- **v1 `.library/`**: local file is source of truth; dashboard reads/writes
  the file, SQLite is a cache.
- **OpenClaw SOUL.md**: the OpenClaw repo/folder is source of truth; the
  dashboard reads and offers a "push edit" flow with `git diff` review
  before writing back.
- **Hermes skills**: Hermes is source of truth; the dashboard is read-only
  by default (Hermes owns the learning loop). Opt-in "promote to
  .library/" button to copy a Hermes skill into v1.

## Memory

Separate from skills — memory is per-agent running context.
- OpenClaw: stored in OpenClaw's DB. We read, we do not write.
- Hermes: persistent memory exposed via `/sessions/<id>/memory`. Same.
- Local agents (OpenRouter/OpenAI): the dashboard is the store. Use the
  existing SQLite events table; summarize on demand with a cheap model.

## UI

New panel: **Library**.
- Tree: Provider → Agent → Skill.
- Right pane: markdown editor (readonly for Hermes, editable otherwise).
- "Used in last 24h" counter next to each skill.
- Filter: auto-generated / manual, tag chips.

## Open decisions for the plan

- Do we try to **merge** SOUL.md-style configs with v1 `.agents/*.md` role
  files, or keep them separate?
- When Hermes generates a skill that duplicates a `.library/` one, do we
  offer a merge UI or just show both?
