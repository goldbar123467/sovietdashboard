# Ideas To Build

## 1. Persistence: Codex Run Ledger

Keep the dashboard stats real after restarts by persisting every Codex run as an append-only local ledger.

### Why

- Current live stats are in-memory and reset when the server restarts.
- Recent Codex sessions are discoverable from `~/.codex/sessions`, but dashboard totals, replies, durations, and failures should belong to this project.
- A ledger makes the dashboard feel like a real command center instead of a temporary panel.

### First Version

- Store runs in `dashboard/server/codex-runs.json` or `dashboard/server/data/codex-runs.json`.
- Append one record per `/api/codex/chat` completion:
  - run id
  - thread id
  - prompt preview, not full prompt by default
  - reply preview, not full reply by default
  - started/finished timestamps
  - duration
  - usage: input, cached input, output, reasoning, total
  - tool call count
  - ok/failure/error
- Load the ledger on server boot and rebuild `totals`.
- Add `GET /api/codex/runs?limit=...` for historical rows.
- Add a “Since boot / All time” toggle in Live Codex Stats.

### Design Notes

- Keep privacy sane: default to previews so secrets are not copied into a long-lived dashboard file.
- Keep the file append-only or write with a safe temp-file swap.
- Reuse the project’s current JSON-store style from `dashboard/server/src/db.ts` before adding a database dependency.
- Add tests for restart hydration, max row trimming, and corrupt file fallback.

### Later

- Add a session detail drawer with per-turn usage charts.
- Add “best streak” stats: longest clean run, fastest run, biggest cached-input save.
- Add a local export button for the run ledger.
- Add daily/weekly rollups for token burn and output volume.

## 2. Soviet Codex Pet: Tovarish Byte

Create a custom Codex pet and embed a pet dock into this dashboard.

### Source

- Official Codex app settings page, Codex pets section: https://developers.openai.com/codex/app/settings#codex-pets
- Local skill: `$hatch-pet`
- Install note: `hatch-pet` is already installed at `/home/clark/.codex/skills/hatch-pet`. On a fresh machine, use `$skill-installer hatch-pet`, then restart Codex to pick it up.

### Pet Concept

Name: **Tovarish Byte**

Tiny Soviet-themed Codex companion inspired by this dashboard:

- small pixel-art-adjacent mascot
- ushanka or red scarf
- Red Son-style chest mark, simplified so it stays readable at pet scale
- terminal-green eyes or tiny command prompt face
- chunky dark outline
- limited red, cream, black, gold, and muted green palette
- no text inside the sprite
- no detached effects, speed lines, shadows, or UI bubbles

### Hatch-Pet Workflow

Use the `$hatch-pet` skill, not hand-drawn local scripts.

Checklist when ready to build:

1. Getting Tovarish Byte ready.
2. Imagining Tovarish Byte’s main look.
3. Picturing Tovarish Byte’s poses.
4. Hatching Tovarish Byte.

Expected output:

- `${CODEX_HOME:-$HOME/.codex}/pets/tovarish-byte/pet.json`
- `${CODEX_HOME:-$HOME/.codex}/pets/tovarish-byte/spritesheet.webp`
- QA contact sheet and preview videos in the hatch run folder

### Dashboard Pet Dock

Add a right-side or lower-corner “Pet Dock” panel:

- idle animation while Codex is ready
- review animation while a Codex prompt is running
- jumping or waving animation when a run succeeds
- failed animation when a run fails
- tiny local chat input: “Talk to Tovarish Byte”
- pet replies should be lightweight, local-dashboard personality lines, not a second agent workflow
- optional mood meter driven by success streaks, failures, and token burn

### Interaction Ideas

- Pet salutes when the Soviet anthem clip plays.
- Pet “reviews” when `/api/codex/session.status === running`.
- Pet comments on stats:
  - high cached input: “Excellent reuse, comrade.”
  - long run: “The machine thinks deeply.”
  - failed run: “We regroup.”
- Pet can offer one-click prompts:
  - “Summarize current diff”
  - “Run narrow tests”
  - “Explain token spike”

### Implementation Notes

- Keep the pet system separate from Agent Comms so it does not clutter the core coding workflow.
- Prefer a compact dock, not a huge decorative panel.
- Use the Codex pet package format for the actual pet files, then load the same spritesheet in the dashboard for preview/play.
- Add tests for pet state mapping: idle/running/success/failure.

## 3. Diff And Test Strip

Add a compact row above Agent Comms that shows:

- git branch and ahead/behind state
- dirty file count
- last test command
- last test result
- last build result

This should be dense and practical: a status strip, not another panel.

## 4. Token Spike Explainer

Add a small helper that compares the latest run to recent average:

- input spike
- cached-input ratio
- output spike
- reasoning spike
- duration spike

Then show one plain-English reason next to Live Codex Stats.
