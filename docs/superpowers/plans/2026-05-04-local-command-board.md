# Local Command Board Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a localhost command board for OpenClaw, Codex CLI, media playback, and embedded web browsing.

**Architecture:** Keep the existing React/Vite dashboard and replace the Bun-only backend with a Node HTTP + WebSocket backend. Add a safe local command registry, command board UI, and embedded web tab with YouTube URL normalization and external Chromium fallback launch.

**Tech Stack:** Node 24, TypeScript, React 19, Vite, Tailwind CSS, xterm.js, `ws`, Node `child_process`, Node `test`.

---

## File Map

- Modify `.gitignore`: ignore local worktrees.
- Modify `package.json`: add root scripts for server build/checks.
- Modify `dashboard/server/package.json`: replace Bun dev script with Node/tsx scripts and add `ws` dependencies.
- Modify `dashboard/server/tsconfig.json`: use Node types.
- Modify `dashboard/server/src/db.ts`: replace `bun:sqlite` with small JSON event store.
- Modify `dashboard/server/src/metrics.ts`: calculate metrics from JSON event rows.
- Modify `dashboard/server/src/narrator.ts`: use Node `child_process.spawn` instead of `Bun.spawn`.
- Modify `dashboard/server/src/agents.ts`: use Node `child_process.spawn` instead of `Bun.spawn`.
- Modify `dashboard/server/src/types.ts`: add command-board WebSocket types.
- Create `dashboard/server/src/commandRegistry.ts`: safe local commands and command execution.
- Create `dashboard/server/src/browserTools.ts`: URL normalization and browser launch helpers.
- Rewrite `dashboard/server/src/index.ts`: Node HTTP routing and `ws` server.
- Create `dashboard/server/src/commandRegistry.test.ts`: registry safety tests.
- Create `dashboard/server/src/browserTools.test.ts`: URL normalization tests.
- Modify `dashboard/client/src/App.tsx`: center surface tabs.
- Create `dashboard/client/src/components/CommandBoard.tsx`: OpenClaw, Codex, media, browser command controls.
- Create `dashboard/client/src/components/WebPanel.tsx`: embedded web tab.
- Modify `dashboard/client/src/components/TerminalPanel.tsx`: include command result stream lines.

## Tasks

- [x] **Task 1: Write design/spec doc**  
  Create `docs/superpowers/specs/2026-05-04-local-command-board-design.md` with architecture, tradeoffs, safety, and verification.

- [x] **Task 2: Add tests first**  
  Add Node test files for safe command lookup and URL normalization. Run them once to confirm they fail before implementation.

- [x] **Task 3: Implement Node backend foundation**  
  Replace Bun-only APIs with Node HTTP, `ws`, JSON event persistence, Node child process spawning, and server scripts.

- [x] **Task 4: Implement local command registry**  
  Add OpenClaw, Codex, media, and browser command handlers behind named command IDs and JSON APIs.

- [x] **Task 5: Implement command-board UI**  
  Add center tabs, command panels, status display, prompt input, media controls, embedded web tab, and WebSocket command result updates.

- [x] **Task 6: Verify**  
  Run server tests, TypeScript builds, frontend build, and browser smoke verification against the local dev server.

## Self-Review

- Spec coverage: OpenClaw, Codex, media, browser, YouTube, local hosting, and safe command execution are all mapped to tasks.
- Placeholder scan: no TBD/TODO placeholders.
- Type consistency: command board WebSocket events use `command_result` consistently across backend and frontend.
