# Local Command Board Design

**Date:** 2026-05-04
**Status:** Auto-approved by operator instruction

## Goal

Turn Tovarish Tsentr into a locally hosted command board for this computer: monitor/control OpenClaw, send Codex CLI prompts, and browse/play YouTube from a built-in web tab.

## Front-Loaded Choices

- Keep the existing Soviet command-center visual system and three-panel density instead of redesigning the dashboard.
- Replace the Bun-only backend with a Node backend because this computer has Node and pnpm but no `bun` on PATH.
- Use a safe server-side command registry. The browser can only trigger named local commands, not arbitrary shell strings.
- Use OpenClaw from `/home/clark/code/openclaw` through `pnpm openclaw ...`.
- Use Codex through the authenticated `codex` CLI already on PATH.
- Implement the browser surface as an embedded web tab using an iframe with URL normalization for YouTube watch URLs. Sites that refuse framing can be launched in an external Chromium/Chrome/Edge window through the command board.

## Architecture

The dashboard remains React + Vite. The backend becomes a Node HTTP server with `ws` for realtime messages. Local command execution lives behind typed endpoints:

- `GET /api/command-board/status`
- `POST /api/command-board/commands/:id`
- `POST /api/command-board/browser/open`

The backend streams command results back over the existing WebSocket channel as `command_result` events. UI state stays local and does not require accounts or cloud services.

## UI

The center column becomes a tabbed work surface:

- `Terminal`: existing agent/codex event terminal.
- `Control`: OpenClaw, Codex, and browser launch controls.
- `Web`: URL bar, back/forward/reload controls, embedded iframe, YouTube embed conversion, and an external Chromium launch button.

The right column keeps metrics, narration, and agent comms so the command board still works as an orchestration dashboard.

## Safety

Only named commands are executable. Commands run with explicit argv arrays and known working directories. Destructive commands are not included. Long-running OpenClaw gateway commands are started detached; restart/stop/status use OpenClaw's CLI lifecycle commands instead of raw process deletion.

## Verification

- Unit tests cover command registry safety and URL normalization.
- TypeScript build verifies frontend and backend.
- Browser verification loads the local Vite app and exercises the new command-board UI.
