# ТОВАРИЩ ЦЕНТР — Agent Orchestration Dashboard

**Date:** 2026-04-16
**Status:** Approved (mockup v8)
**Mockup:** `.superpowers/brainstorm/5696-1776302118/content/layout-v8-final.html`

---

## Overview

A localhost web dashboard for monitoring and controlling a 4-agent Claude Code orchestration workflow. Soviet retro-futurist aesthetic (Red Son Superman style). Replaces mcp-agent-mail with a lean custom messaging MCP server. Includes terminal streaming, real-time metrics, AI-narrated mission briefings, and agent-to-agent chat.

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│  ТОВАРИЩ ЦЕНТР — React + Vite + TailwindCSS              │
│  http://localhost:4981                                    │
│  Three-column layout, Soviet aesthetic, Recharts          │
├──────────────────────────────────────────────────────────┤
│  CUSTOM MCP MESSAGE SERVER (replaces agent-mail)          │
│  TypeScript, stdio transport, lean agent messaging        │
│  Tools: register, send, receive, reserve_files, release   │
├──────────────────────────────────────────────────────────┤
│  TERMINAL STREAMING (ttyd or custom WebSocket PTY)        │
│  Streams real terminal to browser, bidirectional I/O      │
│  Tab system — one tab per agent, + button for new tabs    │
├──────────────────────────────────────────────────────────┤
│  HOOK SCRIPTS (Python, lightweight)                       │
│  POST events to dashboard server on every tool call       │
│  Trigger anthem audio on prompt completion                │
├──────────────────────────────────────────────────────────┤
│  DATA LAYER                                               │
│  SQLite (events.db) for persistence                       │
│  WebSocket relay for real-time streaming                   │
│  Agent role .md files + self-learning library              │
└──────────────────────────────────────────────────────────┘
```

**Data flow:**
```
Claude Code Agents → Hook Scripts (Python) → HTTP POST →
Bun Server (SQLite) → WebSocket → React Dashboard
```

## Layout (Three Columns)

### Left Column (250px) — Agent Status Cards

4 fixed agent slots, vertical stack:

1. **Queen Orchestrator** — model: opus, worktree: main
2. **Code Worker** — model: sonnet, worktree: feature branch
3. **Test Worker** — model: sonnet, worktree: feature branch
4. **Reviewer** — model: haiku, read-only

Each card displays:
- Agent role name (Russo One font, red glow)
- Status dot (green=active, gold=waiting, blue=idle) + status text
- Worktree, model, role `.md` path
- Mini metric row: tokens, tool calls, active time
- Transparent hammer & sickle emblem watermark (top-right)

### Center Column (flex) — Tabbed Terminal

- **Terminal header:** Solid red banner with diagonal stripe texture, hammer & sickle icon, "ТОВАРИЩ TERMINAL" title
- **Tab bar:** One tab per agent, each with sickle emblem + status dot + name + worktree + close button. `+` button to spawn new terminal tabs.
- **Terminal body:** Real terminal streamed via ttyd/WebSocket (bidirectional). Superman Red Son logo as background watermark at ~4% opacity.
- **In production:** Each tab is a separate PTY session connected to a Claude Code agent process.

### Right Column (330px) — Metrics + Briefing + Chat

Three stacked panels:

#### 1. Mission Metrics (top)
- **Claude usage bars:** 5-hour rolling usage + weekly rotation (matching Claude subscription limits). Red fill for 5hr, gold for weekly. Tick marks at 20% intervals.
- **Metric grid (4 cells):** Tokens, Tool Calls, Tests, Coverage
- **Time-tabbed line chart:** 5 MIN | SESSION | 7 DAY | ALL tabs. Three series: tokens (red), tools (teal), usage (gold dashed). Live-updating with "NOW" marker.
- **Bottom row:** Avg response time, errors, commits, diff stats

#### 2. Mission Briefing (middle, replaces event log)
- **AI narrator:** A small OpenRouter model (Haiku 4.5) reads the raw event log every 20 seconds and writes a natural language summary of what the agents are doing.
- Highlights agent names in red, key metrics in gold.
- Shows model name, poll interval, and last update timestamp.
- Green pulsing dot indicates live connection.

#### 3. Agent Comms (bottom)
- **Live chat feed** from the custom MCP messaging system. Shows agent-to-agent messages in real time.
- Each agent's name color-coded: queen=red, coder=gold, tester=teal, reviewer=violet.
- **Input field + SEND button** — user can inject messages into the agent chat.

### Header Bar

- Solid red banner with constructivist diagonal stripe texture
- **Ushanka hat icon** (clickable, round with hover glow) — dashboard menu / anthem trigger
- **ТОВАРИЩ ЦЕНТР** title (Russo One, 26px, cream with text-shadow)
- **Comrade Orchestration System** subtitle (Oswald, 10px)
- Right-aligned stats: Agents online (4/4), Session status (ACTIVE), Mission time (uptime counter)

## Visual Identity — Soviet Retro-Futurist

### Palette
```
--red:    #c41e1e    (borders, headers, primary)
--red-b:  #e52222    (bright accents, text glow)
--bg:     #08080a    (background)
--panel:  #0c0608    (panel backgrounds, dark red-black)
--gold:   #D4A843    (secondary data, gold series)
--cream:  #F5ECD0    (primary text)
--sky:    #7BAFD4    (info text, idle status)
--teal:   #3A9B9B    (tester color, data series)
--green:  #7B9E6B    (active status, success)
--violet: #7B5EA7    (reviewer color)
```

### Fonts
- **Display/titles:** Russo One (blocky Soviet display face)
- **Headings/labels:** Oswald (condensed, militaristic)
- **Monospace/data:** Courier New

### SVG/Image Assets
- **Hammer & sickle:** Transparent PNG, used as watermarks on agent cards, tab emblems, panel title icons, background scatter (multiple sizes, 2-4% opacity)
- **Superman Red Son logo:** Terminal background watermark (~4% opacity)
- **Ushanka hat:** Clickable dashboard icon in header (round, bordered)
- **Constructivist rays:** Triangular wedges radiating from top-left corner in background
- **Cyrillic watermark:** "КОМАНДНЫЙ ПУНКТ" faintly at bottom

### Design Rules
- All borders: 2px solid `--red`
- Red gradient top-strip on every panel (3px)
- Diagonal stripe texture on all red banners
- No pure white or pure black text
- Red glow (`text-shadow: 0 0 10px`) on all role/title text
- Status dots: always with matching `box-shadow` glow

## Audio

- **Soviet Anthem (1944 version):** Plays when a prompt completes. Triggered by PostToolUse hook detecting session end, relayed via WebSocket to dashboard. Red radial flash overlay animation accompanies playback. Volume: 0.3 (30%).
- Audio file: `soviet-anthem.mp3` in project root.

## Environment Variables

```env
OPENROUTER_API_KEY=     # For AI narrator (Haiku 4.5)
PORT=4981               # Dashboard server port
TTYD_PORT=7681          # Terminal streaming port (ttyd default)
```

## Custom MCP Messaging Server

Replaces `mcp-agent-mail`. Lean stdio MCP server keeping only essential features:

### Tools (keep)
| Tool | Purpose |
|------|---------|
| `register_agent` | Agent announces itself (name, model, role) |
| `send_message` | Send message to another agent or broadcast |
| `fetch_messages` | Get messages for an agent |
| `reserve_files` | Lock files before editing (paths, TTL) |
| `release_files` | Release file reservations |
| `list_agents` | Who's online |

### Stripped (from agent-mail)
- `ensure_project` / project management ceremony
- Complex threading (`thread_id`, `reply_message`)
- `acknowledge_message`, `mark_message_read`
- `search_messages` (complex query system)
- `whois` (merged into `list_agents`)
- `macro_start_session` (over-engineered)
- Separate web UI (dashboard replaces it)

### Message format
```json
{
  "from": "queen",
  "to": "code-worker",
  "body": "Refactor src/map.ts. Preserve physics coupling.",
  "timestamp": "2026-04-16T14:32:01Z"
}
```

## Agent Role System

### Role `.md` Files (`.agents/` directory)
Each agent reads its role file on startup. Defines:
- Agent identity and responsibilities
- Tool allowlist
- Communication protocols
- How to interact with the dashboard (what to report)

### Self-Learning Library (`.library/<agent>/`)
- Every 50 prompts, agents re-read their role `.md`
- Agents write new `.md` files capturing learned patterns, decisions, mistakes
- Library accumulates over time — human-readable RAG
- All agents can reference each other's libraries

### Fixed Roles
| Role | Model | Worktree | Tools |
|------|-------|----------|-------|
| Queen Orchestrator | opus | main | All (delegates, doesn't implement) |
| Code Worker | sonnet | feature branch | Read, Edit, Write, Glob, Grep, Bash |
| Test Worker | sonnet | feature branch | Read, Bash, Glob, Grep |
| Reviewer | haiku | none (read-only) | Read, Glob, Grep |

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Dashboard frontend | React 19 + Vite + TailwindCSS |
| Charts | Recharts |
| Terminal streaming | ttyd (or custom WebSocket PTY bridge) |
| Dashboard server | Bun + TypeScript |
| Database | SQLite (via bun:sqlite) |
| Real-time | WebSocket (native Bun) |
| MCP server | TypeScript (@modelcontextprotocol/sdk), stdio |
| Hook scripts | Python (lightweight, fast startup) |
| AI narrator | OpenRouter API → Haiku 4.5, 20s poll |
| Fonts | Google Fonts (Russo One, Oswald) |

## Startup

Single command: `npm run dev` (via concurrently)
1. Starts MCP message server
2. Starts Bun dashboard server (port 4981)
3. Starts Vite dev server (React client)
4. Starts ttyd for terminal streaming
5. Opens browser to http://localhost:4981

## File Structure

```
mcp-agent-skills/
├── .agents/
│   ├── queen.md
│   ├── coder.md
│   ├── tester.md
│   └── reviewer.md
├── .library/
│   ├── queen/
│   ├── coder/
│   ├── tester/
│   └── reviewer/
├── mcp-server/
│   ├── src/
│   │   ├── index.ts          # MCP server entry
│   │   ├── tools.ts          # register, send, fetch, reserve, release, list
│   │   └── store.ts          # In-memory message/reservation store
│   └── package.json
├── dashboard/
│   ├── server/
│   │   ├── src/
│   │   │   ├── index.ts      # Bun HTTP + WebSocket server
│   │   │   ├── db.ts         # SQLite schema + queries
│   │   │   └── narrator.ts   # OpenRouter AI narrator (20s poll)
│   │   └── package.json
│   ├── client/
│   │   ├── src/
│   │   │   ├── App.tsx
│   │   │   ├── components/
│   │   │   │   ├── Header.tsx
│   │   │   │   ├── AgentCard.tsx
│   │   │   │   ├── Terminal.tsx
│   │   │   │   ├── MetricsPanel.tsx
│   │   │   │   ├── NarratorPanel.tsx
│   │   │   │   └── ChatPanel.tsx
│   │   │   ├── hooks/
│   │   │   │   ├── useWebSocket.ts
│   │   │   │   └── useMetrics.ts
│   │   │   └── assets/
│   │   │       ├── soviet-anthem.mp3
│   │   │       ├── hammer-sickle.png
│   │   │       ├── ushanka.png
│   │   │       └── red-son-logo.png
│   │   ├── package.json
│   │   └── vite.config.ts
│   └── package.json           # Workspace root
├── hooks/
│   ├── post_tool_use.py
│   ├── session_start.py
│   ├── session_end.py
│   ├── subagent_start.py
│   └── subagent_stop.py
├── .mcp.json                  # MCP server registration
├── CLAUDE.md                  # Queen orchestrator instructions
├── package.json               # Root with concurrently
└── docs/
    └── superpowers/
        └── specs/
            └── 2026-04-16-tovarish-tsentr-design.md
```
