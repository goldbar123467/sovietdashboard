# Tovarish Tsentr

Local command board for driving Codex CLI, OpenClaw checks, and live dashboard stats from one browser UI.

This repo is built for local workstation use. It is public, but runtime data, generated browser artifacts, local databases, and Codex run ledgers are ignored so prompts, session output, and machine-specific files do not get committed by default.

## What It Does

- Sends Agent Comms prompts directly to the local Codex CLI.
- Streams command output into the main board.
- Tracks live Codex run stats for 1 hour, 1 day, 7 days, and lifetime windows.
- Persists Codex run summaries in a local ignored ledger.
- Plays the first five seconds of the Soviet anthem when successful prompt-style runs complete.
- Provides safe local Codex CLI controls such as version, login status, MCP servers, and feature flags.
- Provides OpenClaw status/start controls plus a Text OpenClaw prompt box.
- Includes **Tovarish Byte**, a lazy-loaded Three.js Soviet signal-bot pet dock that reacts to Codex status.

The old browser tab, Apple Music controls, Queen/subagent flow, and Codex one-shot panel were intentionally removed. The current workflow is direct operator-to-Codex through Agent Comms.

## Stack

- npm workspaces
- React 19 + Vite + Tailwind CSS for the dashboard client
- Node HTTP + WebSocket server
- TypeScript server/client code
- Three.js for the dashboard pet scene
- Node test runner with `tsx`

## Quick Start

```bash
npm install
npm run dev
```

Open the Vite dashboard:

```text
http://localhost:5173
```

The server runs on:

```text
http://localhost:4981
```

## Useful Commands

```bash
npm test
npm run build
npm run test -w dashboard/server
npm run test -w dashboard/client
npm run build -w dashboard/server
npm run build -w dashboard/client
```

## Environment

Copy `.env.example` if you need local overrides:

```bash
cp .env.example .env
```

Supported values:

```env
OPENROUTER_API_KEY=
PORT=4981
TTYD_PORT=7681
```

Notes:

- `.env` is ignored.
- The dashboard does not require committing secrets.
- `OPENCLAW_REPO` can override the default local OpenClaw checkout path.
- Set `NARRATOR_DISABLED=1` to disable the narrator background loop.

## Local Data

These are intentionally ignored:

- `.playwright-cli/`
- `output/`
- `events.db`
- `tovarish.db*`
- `codex-runs.json`
- `dashboard/server/codex-runs.json`
- `dashboard/server/tovarish-events.json`
- `dashboard/client/dist/`
- `dashboard/server/dist/`
- `node_modules/`

The Codex run ledger stores summaries and previews for dashboard stats, not full prompt history by default.

## Main Endpoints

- `GET /api/health`
- `GET /api/codex/session`
- `GET /api/codex/runs?limit=50`
- `POST /api/codex/chat`
- `GET /api/command-board/status`
- `POST /api/command-board/commands/:id`
- `GET /api/events`
- `GET /ws`

## Project Layout

```text
dashboard/client/        React dashboard UI
dashboard/server/        Local HTTP/WebSocket command server
mcp-server/              MCP server workspace
docs/superpowers/        Planning/spec notes
hooks/                   Local hook scripts
COMMAND_BOARD_TODO.md    Completed workflow notes and near-term tasks
ideastobuild.md          Longer-running ideas
```

## Tovarish Byte

The dashboard pet is a local Three.js component, not the official Codex app pet package. It lives in:

```text
dashboard/client/src/components/SovietPetScene.tsx
dashboard/client/src/components/PetDock.tsx
dashboard/client/src/components/petLogic.ts
```

For a real Codex app pet package, use the local `hatch-pet` skill and the Codex pet format. The dashboard can keep its richer Three.js companion separately.

## Verification Snapshot

Recent gates used while building the current dashboard:

```bash
npm test -w dashboard/server
npm test -w dashboard/client
npm run build
```

Browser verification was also done with Chromium/Playwright for the command board, Red Son output stage, and Three.js pet canvas.
