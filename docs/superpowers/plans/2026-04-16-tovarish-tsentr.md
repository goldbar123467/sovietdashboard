# ТОВАРИЩ ЦЕНТР Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Soviet-themed localhost dashboard for monitoring and controlling a 4-agent Claude Code orchestration workflow, with custom MCP messaging, terminal streaming, AI narrator, and real-time metrics.

**Architecture:** Three-layer system — a lean MCP stdio server for agent messaging, a Bun HTTP+WebSocket backend with SQLite persistence, and a React+Vite frontend. Python hook scripts bridge Claude Code events to the dashboard. Terminal sessions stream to the browser via xterm.js + node-pty WebSocket.

**Tech Stack:** Bun, React 19, Vite, TailwindCSS, Recharts, xterm.js, @modelcontextprotocol/sdk, SQLite (bun:sqlite), OpenRouter API, Python 3

**Spec:** `docs/superpowers/specs/2026-04-16-tovarish-tsentr-design.md`
**Mockup:** `.superpowers/brainstorm/5696-1776302118/content/layout-v8-final.html`

---

## File Map

```
mcp-agent-skills/
├── package.json                          # Root workspace + concurrently dev script
├── .env.example                          # OPENROUTER_API_KEY, PORT, TTYD_PORT
├── .mcp.json                             # MCP server registration
├── CLAUDE.md                             # Queen orchestrator instructions (update)
├── .gitignore                            # node_modules, .env, events.db, .library/
│
├── mcp-server/
│   ├── package.json                      # deps: @modelcontextprotocol/sdk, zod
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts                      # Server entry, stdio transport
│       ├── store.ts                      # In-memory agents, messages, reservations
│       └── tools.ts                      # 6 tool definitions with Zod schemas
│
├── dashboard/
│   ├── server/
│   │   ├── package.json                  # deps: (bun built-ins)
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts                  # Bun HTTP + WebSocket server
│   │       ├── db.ts                     # SQLite schema, migrations, queries
│   │       ├── narrator.ts              # OpenRouter polling narrator
│   │       └── types.ts                  # Shared TypeScript interfaces
│   └── client/
│       ├── package.json                  # deps: react, recharts, xterm, tailwindcss
│       ├── vite.config.ts
│       ├── tailwind.config.ts
│       ├── postcss.config.js
│       ├── index.html
│       └── src/
│           ├── main.tsx                  # React entry
│           ├── App.tsx                   # Three-column grid layout
│           ├── theme.css                 # Soviet palette CSS variables
│           ├── components/
│           │   ├── Header.tsx            # Red banner, ushanka, stats
│           │   ├── AgentCard.tsx         # Single agent status card
│           │   ├── AgentColumn.tsx       # 4 stacked AgentCards
│           │   ├── TerminalPanel.tsx     # xterm.js tabs + WebSocket PTY
│           │   ├── MetricsPanel.tsx      # Usage bars, metric grid, line chart
│           │   ├── NarratorPanel.tsx     # AI mission briefing
│           │   └── ChatPanel.tsx         # Agent comms feed + input
│           ├── hooks/
│           │   ├── useWebSocket.ts       # Auto-reconnecting WS hook
│           │   └── useAnthem.ts          # Anthem audio trigger
│           └── assets/
│               ├── soviet-anthem.mp3
│               ├── hammer-sickle.png
│               ├── ushanka.png
│               └── red-son-logo.png
│
├── hooks/
│   ├── post_tool_use.py                  # POST event to dashboard server
│   ├── session_start.py                  # POST session start
│   ├── session_end.py                    # POST session end + anthem trigger
│   ├── subagent_start.py                 # POST subagent spawn
│   └── subagent_stop.py                  # POST subagent completion
│
└── .agents/
    ├── queen.md                          # Queen orchestrator role
    ├── coder.md                          # Code worker role
    ├── tester.md                         # Test worker role
    └── reviewer.md                       # Reviewer role
```

---

## Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `.env.example`
- Create: `.gitignore`
- Create: `mcp-server/package.json`
- Create: `mcp-server/tsconfig.json`
- Create: `dashboard/server/package.json`
- Create: `dashboard/server/tsconfig.json`
- Create: `dashboard/client/package.json`
- Create: `dashboard/client/vite.config.ts`
- Create: `dashboard/client/tailwind.config.ts`
- Create: `dashboard/client/postcss.config.js`
- Create: `dashboard/client/index.html`

- [ ] **Step 1: Create root package.json with workspaces**

```json
{
  "name": "tovarish-tsentr",
  "private": true,
  "workspaces": ["mcp-server", "dashboard/server", "dashboard/client"],
  "scripts": {
    "dev": "concurrently -n mcp,server,client -c red,blue,green \"npm run dev -w mcp-server\" \"npm run dev -w dashboard/server\" \"npm run dev -w dashboard/client\"",
    "build": "npm run build -w dashboard/client"
  },
  "devDependencies": {
    "concurrently": "^9.1.0"
  }
}
```

- [ ] **Step 2: Create .env.example**

```env
OPENROUTER_API_KEY=
PORT=4981
TTYD_PORT=7681
```

- [ ] **Step 3: Create .gitignore**

```
node_modules/
.env
events.db
.library/
dist/
```

- [ ] **Step 4: Create mcp-server/package.json and tsconfig.json**

`mcp-server/package.json`:
```json
{
  "name": "tovarish-mcp",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "npx tsx src/index.ts",
    "build": "npx tsc"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.12.0",
    "zod": "^3.24.0"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "tsx": "^4.19.0"
  }
}
```

`mcp-server/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

- [ ] **Step 5: Create dashboard/server/package.json and tsconfig.json**

`dashboard/server/package.json`:
```json
{
  "name": "tovarish-server",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "bun --watch src/index.ts"
  },
  "dependencies": {}
}
```

`dashboard/server/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "skipLibCheck": true,
    "types": ["bun-types"]
  },
  "include": ["src"]
}
```

- [ ] **Step 6: Create dashboard/client scaffolding**

Run:
```bash
cd mcp-agent-skills/dashboard/client
npm init -y
npm install react react-dom recharts xterm @xterm/addon-fit @xterm/addon-web-links
npm install -D vite @vitejs/plugin-react tailwindcss @tailwindcss/vite postcss typescript @types/react @types/react-dom
```

`dashboard/client/vite.config.ts`:
```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:4981",
      "/ws": { target: "ws://localhost:4981", ws: true },
    },
  },
});
```

`dashboard/client/tailwind.config.ts`:
```ts
import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        soviet: {
          red: "#c41e1e",
          "red-bright": "#e52222",
          bg: "#08080a",
          panel: "#0c0608",
          gold: "#D4A843",
          cream: "#F5ECD0",
          sky: "#7BAFD4",
          teal: "#3A9B9B",
          green: "#7B9E6B",
          violet: "#7B5EA7",
        },
      },
      fontFamily: {
        display: ['"Russo One"', '"Oswald"', "sans-serif"],
        heading: ['"Oswald"', "sans-serif"],
        mono: ['"Courier New"', "monospace"],
      },
    },
  },
  plugins: [],
} satisfies Config;
```

`dashboard/client/postcss.config.js`:
```js
export default {
  plugins: {
    tailwindcss: {},
  },
};
```

`dashboard/client/index.html`:
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>ТОВАРИЩ ЦЕНТР</title>
  <link href="https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600;700&family=Russo+One&display=swap" rel="stylesheet" />
</head>
<body class="bg-soviet-bg text-soviet-cream font-mono overflow-hidden h-screen">
  <div id="root"></div>
  <script type="module" src="/src/main.tsx"></script>
</body>
</html>
```

- [ ] **Step 7: Copy image/audio assets into client/src/assets/**

```bash
cp /mnt/c/Users/Clark/Downloads/Hammer_and_sickle_red_on_transparent.svg dashboard/client/src/assets/hammer-sickle.png
cp "/mnt/c/Users/Clark/Downloads/png-clipart-round-black-case-cap-ushanka-hat-winter-leather-helmet-warm-winter-hat-winter-leather.svg" dashboard/client/src/assets/ushanka.png
cp /mnt/c/Users/Clark/Downloads/Superman_Red_Son_logo.svg dashboard/client/src/assets/red-son-logo.png
cp soviet-anthem.mp3 dashboard/client/src/assets/soviet-anthem.mp3
```

- [ ] **Step 8: Install root dependencies and verify**

```bash
cd mcp-agent-skills
npm install
```

Expected: All three workspaces resolve. No errors.

- [ ] **Step 9: Commit scaffolding**

```bash
git add package.json .env.example .gitignore mcp-server/ dashboard/
git commit -m "chore: scaffold ТОВАРИЩ ЦЕНТР project structure"
```

---

## Task 2: MCP Message Server — Store

**Files:**
- Create: `mcp-server/src/store.ts`

- [ ] **Step 1: Write the in-memory store**

```ts
// mcp-server/src/store.ts

export interface Agent {
  name: string;
  model: string;
  role: string;
  registeredAt: string;
}

export interface Message {
  id: number;
  from: string;
  to: string; // agent name or "*" for broadcast
  body: string;
  timestamp: string;
}

export interface FileReservation {
  path: string;
  agent: string;
  expiresAt: number; // Date.now() + TTL
  reason: string;
}

let messageIdCounter = 0;
const agents = new Map<string, Agent>();
const messages: Message[] = [];
const reservations = new Map<string, FileReservation>();

export function registerAgent(name: string, model: string, role: string): Agent {
  const agent: Agent = { name, model, role, registeredAt: new Date().toISOString() };
  agents.set(name, agent);
  return agent;
}

export function listAgents(): Agent[] {
  return Array.from(agents.values());
}

export function sendMessage(from: string, to: string, body: string): Message {
  const msg: Message = {
    id: ++messageIdCounter,
    from,
    to,
    body,
    timestamp: new Date().toISOString(),
  };
  messages.push(msg);
  return msg;
}

export function fetchMessages(agentName: string, since?: number): Message[] {
  const sinceId = since ?? 0;
  return messages.filter(
    (m) => m.id > sinceId && (m.to === agentName || m.to === "*")
  );
}

export function reserveFiles(
  agent: string,
  paths: string[],
  ttlMs: number,
  reason: string
): { reserved: string[]; conflicts: string[] } {
  pruneExpiredReservations();
  const reserved: string[] = [];
  const conflicts: string[] = [];

  for (const path of paths) {
    const existing = reservations.get(path);
    if (existing && existing.agent !== agent) {
      conflicts.push(`${path} held by ${existing.agent}`);
    } else {
      reservations.set(path, { path, agent, expiresAt: Date.now() + ttlMs, reason });
      reserved.push(path);
    }
  }
  return { reserved, conflicts };
}

export function releaseFiles(agent: string, paths?: string[]): number {
  let released = 0;
  if (paths) {
    for (const path of paths) {
      const r = reservations.get(path);
      if (r && r.agent === agent) {
        reservations.delete(path);
        released++;
      }
    }
  } else {
    for (const [path, r] of reservations) {
      if (r.agent === agent) {
        reservations.delete(path);
        released++;
      }
    }
  }
  return released;
}

function pruneExpiredReservations() {
  const now = Date.now();
  for (const [path, r] of reservations) {
    if (r.expiresAt < now) reservations.delete(path);
  }
}

export function getAllMessages(): Message[] {
  return messages;
}
```

- [ ] **Step 2: Commit**

```bash
git add mcp-server/src/store.ts
git commit -m "feat(mcp): add in-memory store for agents, messages, reservations"
```

---

## Task 3: MCP Message Server — Tools & Entry

**Files:**
- Create: `mcp-server/src/tools.ts`
- Create: `mcp-server/src/index.ts`

- [ ] **Step 1: Write tool definitions**

```ts
// mcp-server/src/tools.ts
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as store from "./store.js";

export function registerTools(server: McpServer) {
  server.tool(
    "register_agent",
    "Register this agent with the messaging system. Call on startup.",
    {
      name: z.string().describe("Agent name, e.g. 'queen', 'code-worker'"),
      model: z.string().describe("Model: opus, sonnet, haiku"),
      role: z.string().describe("Path to role .md file"),
    },
    async ({ name, model, role }) => {
      const agent = store.registerAgent(name, model, role);
      return { content: [{ type: "text", text: JSON.stringify(agent) }] };
    }
  );

  server.tool(
    "send_message",
    "Send a message to another agent or broadcast to all with to='*'.",
    {
      from: z.string().describe("Sender agent name"),
      to: z.string().describe("Recipient agent name, or '*' for broadcast"),
      body: z.string().describe("Message text"),
    },
    async ({ from, to, body }) => {
      const msg = store.sendMessage(from, to, body);
      return { content: [{ type: "text", text: JSON.stringify(msg) }] };
    }
  );

  server.tool(
    "fetch_messages",
    "Fetch messages for this agent. Pass last seen message id to get only new ones.",
    {
      agent_name: z.string().describe("Your agent name"),
      since_id: z.number().optional().describe("Last message ID you saw"),
    },
    async ({ agent_name, since_id }) => {
      const msgs = store.fetchMessages(agent_name, since_id);
      return { content: [{ type: "text", text: JSON.stringify(msgs) }] };
    }
  );

  server.tool(
    "reserve_files",
    "Reserve files before editing. Prevents other agents from modifying them.",
    {
      agent: z.string().describe("Your agent name"),
      paths: z.array(z.string()).describe("File paths to reserve"),
      ttl_minutes: z.number().default(30).describe("Reservation TTL in minutes"),
      reason: z.string().default("editing").describe("Why you need these files"),
    },
    async ({ agent, paths, ttl_minutes, reason }) => {
      const result = store.reserveFiles(agent, paths, ttl_minutes * 60_000, reason);
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }
  );

  server.tool(
    "release_files",
    "Release your file reservations. Call when done editing.",
    {
      agent: z.string().describe("Your agent name"),
      paths: z.array(z.string()).optional().describe("Paths to release, or omit to release all"),
    },
    async ({ agent, paths }) => {
      const count = store.releaseFiles(agent, paths);
      return { content: [{ type: "text", text: `Released ${count} reservation(s)` }] };
    }
  );

  server.tool(
    "list_agents",
    "List all registered agents and their status.",
    {},
    async () => {
      const agents = store.listAgents();
      return { content: [{ type: "text", text: JSON.stringify(agents) }] };
    }
  );
}
```

- [ ] **Step 2: Write server entry point**

```ts
// mcp-server/src/index.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerTools } from "./tools.js";

const server = new McpServer({
  name: "tovarish-mcp",
  version: "1.0.0",
});

registerTools(server);

const transport = new StdioServerTransport();
await server.connect(transport);
```

- [ ] **Step 3: Test the MCP server starts and responds to initialize**

```bash
echo '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}},"id":1}' | npx tsx mcp-server/src/index.ts
```

Expected: JSON response with `result.serverInfo.name: "tovarish-mcp"`

- [ ] **Step 4: Create .mcp.json for project registration**

```json
{
  "mcpServers": {
    "tovarish-mcp": {
      "command": "npx",
      "args": ["tsx", "./mcp-server/src/index.ts"]
    }
  }
}
```

- [ ] **Step 5: Commit**

```bash
git add mcp-server/src/tools.ts mcp-server/src/index.ts .mcp.json
git commit -m "feat(mcp): add lean messaging server with 6 tools"
```

---

## Task 4: Dashboard Server — SQLite + HTTP + WebSocket

**Files:**
- Create: `dashboard/server/src/types.ts`
- Create: `dashboard/server/src/db.ts`
- Create: `dashboard/server/src/index.ts`

- [ ] **Step 1: Write shared types**

```ts
// dashboard/server/src/types.ts
export interface HookEvent {
  session_id: string;
  agent_id?: string;
  hook_event: string; // PreToolUse, PostToolUse, SessionStart, etc.
  tool_name?: string;
  tool_input?: string;
  tool_output?: string;
  timestamp: string;
  duration_ms?: number;
  error?: string;
}

export interface AgentStatus {
  name: string;
  model: string;
  role: string;
  status: "active" | "waiting" | "idle";
  worktree: string;
  tokens: number;
  tool_calls: number;
  active_since?: string;
}

export interface ChatMessage {
  from: string;
  to: string;
  body: string;
  timestamp: string;
}

export type WsMessage =
  | { type: "event"; data: HookEvent }
  | { type: "agent_status"; data: AgentStatus[] }
  | { type: "chat"; data: ChatMessage }
  | { type: "narrator"; data: string }
  | { type: "anthem" };
```

- [ ] **Step 2: Write SQLite database layer**

```ts
// dashboard/server/src/db.ts
import { Database } from "bun:sqlite";

const db = new Database("events.db");

db.run("PRAGMA journal_mode = WAL");

db.run(`
  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    agent_id TEXT,
    hook_event TEXT NOT NULL,
    tool_name TEXT,
    tool_input TEXT,
    tool_output TEXT,
    timestamp TEXT DEFAULT (datetime('now')),
    duration_ms INTEGER,
    error TEXT
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS sessions (
    session_id TEXT PRIMARY KEY,
    status TEXT DEFAULT 'active',
    started_at TEXT DEFAULT (datetime('now')),
    ended_at TEXT,
    total_tokens INTEGER DEFAULT 0,
    agent_count INTEGER DEFAULT 1
  )
`);

const insertEvent = db.prepare(`
  INSERT INTO events (session_id, agent_id, hook_event, tool_name, tool_input, tool_output, timestamp, duration_ms, error)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const getRecentEvents = db.prepare(`
  SELECT * FROM events ORDER BY id DESC LIMIT ?
`);

const getEventsSince = db.prepare(`
  SELECT * FROM events WHERE id > ? ORDER BY id ASC
`);

export function addEvent(e: {
  session_id: string;
  agent_id?: string;
  hook_event: string;
  tool_name?: string;
  tool_input?: string;
  tool_output?: string;
  timestamp?: string;
  duration_ms?: number;
  error?: string;
}) {
  return insertEvent.run(
    e.session_id,
    e.agent_id ?? null,
    e.hook_event,
    e.tool_name ?? null,
    e.tool_input ?? null,
    e.tool_output ?? null,
    e.timestamp ?? new Date().toISOString(),
    e.duration_ms ?? null,
    e.error ?? null
  );
}

export function recentEvents(limit = 50): any[] {
  return getRecentEvents.all(limit);
}

export function eventsSince(id: number): any[] {
  return getEventsSince.all(id);
}

export { db };
```

- [ ] **Step 3: Write Bun HTTP + WebSocket server**

```ts
// dashboard/server/src/index.ts
import { addEvent, recentEvents } from "./db.js";
import type { WsMessage } from "./types.js";

const PORT = parseInt(process.env.PORT || "4981");
const clients = new Set<any>();

function broadcast(msg: WsMessage) {
  const data = JSON.stringify(msg);
  for (const ws of clients) {
    ws.send(data);
  }
}

Bun.serve({
  port: PORT,
  async fetch(req, server) {
    const url = new URL(req.url);

    // WebSocket upgrade
    if (url.pathname === "/ws") {
      if (server.upgrade(req)) return;
      return new Response("WebSocket upgrade failed", { status: 400 });
    }

    // CORS headers for dev
    const headers = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Content-Type": "application/json",
    };

    if (req.method === "OPTIONS") {
      return new Response(null, { headers });
    }

    // POST /api/events — hook scripts send events here
    if (url.pathname === "/api/events" && req.method === "POST") {
      const body = await req.json();
      addEvent(body);
      broadcast({ type: "event", data: body });
      return new Response(JSON.stringify({ ok: true }), { headers });
    }

    // POST /api/chat — user sends chat message from dashboard
    if (url.pathname === "/api/chat" && req.method === "POST") {
      const body = await req.json();
      broadcast({ type: "chat", data: body });
      return new Response(JSON.stringify({ ok: true }), { headers });
    }

    // GET /api/events — fetch recent events
    if (url.pathname === "/api/events" && req.method === "GET") {
      const limit = parseInt(url.searchParams.get("limit") || "50");
      const events = recentEvents(limit);
      return new Response(JSON.stringify(events), { headers });
    }

    // GET /api/health
    if (url.pathname === "/api/health") {
      return new Response(JSON.stringify({ status: "ok", clients: clients.size }), { headers });
    }

    return new Response("Not found", { status: 404 });
  },
  websocket: {
    open(ws) {
      clients.add(ws);
      console.log(`[ws] client connected (${clients.size} total)`);
    },
    message(ws, message) {
      // Client can send chat messages via WebSocket too
      try {
        const parsed = JSON.parse(String(message));
        if (parsed.type === "chat") {
          broadcast({ type: "chat", data: parsed.data });
        }
      } catch {}
    },
    close(ws) {
      clients.delete(ws);
      console.log(`[ws] client disconnected (${clients.size} total)`);
    },
  },
});

console.log(`[ТОВАРИЩ ЦЕНТР] Server running on http://localhost:${PORT}`);

// Export broadcast for narrator to use
export { broadcast };
```

- [ ] **Step 4: Verify server starts**

```bash
cd mcp-agent-skills && bun dashboard/server/src/index.ts
```

Expected: `[ТОВАРИЩ ЦЕНТР] Server running on http://localhost:4981`

Test health endpoint: `curl http://localhost:4981/api/health`
Expected: `{"status":"ok","clients":0}`

- [ ] **Step 5: Commit**

```bash
git add dashboard/server/
git commit -m "feat(server): Bun HTTP+WebSocket server with SQLite persistence"
```

---

## Task 5: Dashboard Server — AI Narrator

**Files:**
- Create: `dashboard/server/src/narrator.ts`
- Modify: `dashboard/server/src/index.ts` (add narrator import)

- [ ] **Step 1: Write the narrator module**

```ts
// dashboard/server/src/narrator.ts
import { recentEvents } from "./db.js";

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const POLL_INTERVAL = 20_000; // 20 seconds
let lastSummary = "Awaiting mission data...";
let onUpdate: ((summary: string) => void) | null = null;

export function getNarration(): string {
  return lastSummary;
}

export function setUpdateCallback(cb: (summary: string) => void) {
  onUpdate = cb;
}

async function generateSummary() {
  if (!OPENROUTER_API_KEY) {
    lastSummary = "OPENROUTER_API_KEY not set. Narrator offline.";
    return;
  }

  const events = recentEvents(30);
  if (events.length === 0) {
    lastSummary = "No mission activity yet. Agents standing by.";
    onUpdate?.(lastSummary);
    return;
  }

  const eventLog = events
    .reverse()
    .map((e: any) => `[${e.timestamp}] ${e.agent_id || "system"}: ${e.hook_event} ${e.tool_name || ""} ${e.error || ""}`.trim())
    .join("\n");

  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "anthropic/claude-haiku-4-5-20251001",
        max_tokens: 200,
        messages: [
          {
            role: "system",
            content:
              "You are a Soviet mission briefing officer. Summarize agent activity in 2-3 sentences. Be concise and factual. Mention agent names, what they did, and current status. Use present tense.",
          },
          {
            role: "user",
            content: `Recent event log:\n${eventLog}\n\nProvide a brief mission status update.`,
          },
        ],
      }),
    });

    const data = await res.json();
    lastSummary = data.choices?.[0]?.message?.content || lastSummary;
    onUpdate?.(lastSummary);
  } catch (err) {
    console.error("[narrator] Error:", err);
  }
}

export function startNarrator() {
  console.log("[narrator] Starting, polling every 20s");
  generateSummary();
  setInterval(generateSummary, POLL_INTERVAL);
}
```

- [ ] **Step 2: Wire narrator into server**

Add to the end of `dashboard/server/src/index.ts`:

```ts
import { startNarrator, setUpdateCallback, getNarration } from "./narrator.js";

setUpdateCallback((summary) => {
  broadcast({ type: "narrator", data: summary });
});

startNarrator();
```

Also add a GET endpoint for initial narrator state, inside the `fetch` handler before the 404:

```ts
    // GET /api/narrator
    if (url.pathname === "/api/narrator" && req.method === "GET") {
      return new Response(JSON.stringify({ summary: getNarration() }), { headers });
    }
```

- [ ] **Step 3: Commit**

```bash
git add dashboard/server/src/narrator.ts dashboard/server/src/index.ts
git commit -m "feat(server): add OpenRouter AI narrator with 20s polling"
```

---

## Task 6: Hook Scripts

**Files:**
- Create: `hooks/post_tool_use.py`
- Create: `hooks/session_start.py`
- Create: `hooks/session_end.py`
- Create: `hooks/subagent_start.py`
- Create: `hooks/subagent_stop.py`

- [ ] **Step 1: Write the shared hook helper and post_tool_use.py**

```python
#!/usr/bin/env python3
# hooks/post_tool_use.py
import json, sys, urllib.request

def post_event(event):
    try:
        data = json.dumps(event).encode()
        req = urllib.request.Request(
            "http://localhost:4981/api/events",
            data=data,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        urllib.request.urlopen(req, timeout=2)
    except Exception:
        pass  # Never block Claude Code

def main():
    raw = sys.stdin.read()
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError:
        return

    event = {
        "session_id": payload.get("session_id", "unknown"),
        "agent_id": payload.get("agent_id"),
        "hook_event": "PostToolUse",
        "tool_name": payload.get("tool_name"),
        "tool_input": json.dumps(payload.get("tool_input", {}))[:500],
        "tool_output": json.dumps(payload.get("tool_output", {}))[:500],
        "timestamp": payload.get("timestamp"),
        "duration_ms": payload.get("duration_ms"),
        "error": payload.get("error"),
    }
    post_event(event)

if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Write session_start.py and session_end.py**

`hooks/session_start.py`:
```python
#!/usr/bin/env python3
import json, sys, urllib.request

def post_event(event):
    try:
        data = json.dumps(event).encode()
        req = urllib.request.Request(
            "http://localhost:4981/api/events",
            data=data,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        urllib.request.urlopen(req, timeout=2)
    except Exception:
        pass

def main():
    raw = sys.stdin.read()
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError:
        return

    post_event({
        "session_id": payload.get("session_id", "unknown"),
        "agent_id": payload.get("agent_id"),
        "hook_event": "SessionStart",
        "timestamp": payload.get("timestamp"),
    })

if __name__ == "__main__":
    main()
```

`hooks/session_end.py`:
```python
#!/usr/bin/env python3
import json, sys, urllib.request

def post_event(event):
    try:
        data = json.dumps(event).encode()
        req = urllib.request.Request(
            "http://localhost:4981/api/events",
            data=data,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        urllib.request.urlopen(req, timeout=2)
    except Exception:
        pass

def main():
    raw = sys.stdin.read()
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError:
        return

    post_event({
        "session_id": payload.get("session_id", "unknown"),
        "agent_id": payload.get("agent_id"),
        "hook_event": "SessionEnd",
        "timestamp": payload.get("timestamp"),
    })

    # Trigger anthem
    try:
        data = json.dumps({"type": "anthem"}).encode()
        req = urllib.request.Request(
            "http://localhost:4981/api/events",
            data=data,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        urllib.request.urlopen(req, timeout=2)
    except Exception:
        pass

if __name__ == "__main__":
    main()
```

- [ ] **Step 3: Write subagent_start.py and subagent_stop.py**

`hooks/subagent_start.py`:
```python
#!/usr/bin/env python3
import json, sys, urllib.request

def post_event(event):
    try:
        data = json.dumps(event).encode()
        req = urllib.request.Request(
            "http://localhost:4981/api/events",
            data=data,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        urllib.request.urlopen(req, timeout=2)
    except Exception:
        pass

def main():
    raw = sys.stdin.read()
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError:
        return

    post_event({
        "session_id": payload.get("session_id", "unknown"),
        "agent_id": payload.get("agent_id"),
        "hook_event": "SubagentStart",
        "timestamp": payload.get("timestamp"),
    })

if __name__ == "__main__":
    main()
```

`hooks/subagent_stop.py`:
```python
#!/usr/bin/env python3
import json, sys, urllib.request

def post_event(event):
    try:
        data = json.dumps(event).encode()
        req = urllib.request.Request(
            "http://localhost:4981/api/events",
            data=data,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        urllib.request.urlopen(req, timeout=2)
    except Exception:
        pass

def main():
    raw = sys.stdin.read()
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError:
        return

    post_event({
        "session_id": payload.get("session_id", "unknown"),
        "agent_id": payload.get("agent_id"),
        "hook_event": "SubagentStop",
        "timestamp": payload.get("timestamp"),
    })

if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Commit**

```bash
git add hooks/
git commit -m "feat(hooks): Python hook scripts for Claude Code event forwarding"
```

---

## Task 7: React Client — Theme + Layout Shell

**Files:**
- Create: `dashboard/client/src/theme.css`
- Create: `dashboard/client/src/main.tsx`
- Create: `dashboard/client/src/App.tsx`

- [ ] **Step 1: Write Soviet theme CSS**

```css
/* dashboard/client/src/theme.css */
@import "tailwindcss";

@theme {
  --color-soviet-red: #c41e1e;
  --color-soviet-red-bright: #e52222;
  --color-soviet-bg: #08080a;
  --color-soviet-panel: #0c0608;
  --color-soviet-gold: #D4A843;
  --color-soviet-cream: #F5ECD0;
  --color-soviet-sky: #7BAFD4;
  --color-soviet-teal: #3A9B9B;
  --color-soviet-green: #7B9E6B;
  --color-soviet-violet: #7B5EA7;
}

/* Constructivist diagonal stripes */
.stripe-bg {
  background-image: repeating-linear-gradient(
    -45deg,
    transparent,
    transparent 20px,
    rgba(0, 0, 0, 0.08) 20px,
    rgba(0, 0, 0, 0.08) 22px
  );
}

/* Red glow text */
.glow-red {
  text-shadow: 0 0 10px rgba(229, 34, 34, 0.5);
}

/* Panel top strip */
.panel-strip::before {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: linear-gradient(90deg, #c41e1e, #e52222, #c41e1e);
}

/* Status dot glow */
.dot-active { background: #7B9E6B; box-shadow: 0 0 8px #7B9E6B; }
.dot-waiting { background: #D4A843; box-shadow: 0 0 8px #D4A843; }
.dot-idle { background: #7BAFD4; box-shadow: 0 0 6px #7BAFD4; }

/* Blinking cursor */
@keyframes blink { 0%, 49% { opacity: 1; } 50%, 100% { opacity: 0; } }
.cursor-blink { animation: blink 1s infinite; }

/* Pulse for narrator dot */
@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
.dot-pulse { animation: pulse 2s infinite; }

/* Anthem flash */
@keyframes anthem-flash { 0% { opacity: 1; } 100% { opacity: 0; } }
```

- [ ] **Step 2: Write React entry point**

```tsx
// dashboard/client/src/main.tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./theme.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
```

- [ ] **Step 3: Write App shell with three-column grid**

```tsx
// dashboard/client/src/App.tsx
import { Header } from "./components/Header";
import { AgentColumn } from "./components/AgentColumn";
import { TerminalPanel } from "./components/TerminalPanel";
import { MetricsPanel } from "./components/MetricsPanel";
import { NarratorPanel } from "./components/NarratorPanel";
import { ChatPanel } from "./components/ChatPanel";

export function App() {
  return (
    <div className="h-screen grid grid-rows-[64px_1fr] grid-cols-[250px_1fr_330px] gap-1 p-1">
      <Header />
      <AgentColumn />
      <TerminalPanel />
      <div className="flex flex-col gap-1">
        <MetricsPanel />
        <NarratorPanel />
        <ChatPanel />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create placeholder components so Vite compiles**

Create each component file with a minimal placeholder. Each will be implemented in subsequent tasks. Files:
- `dashboard/client/src/components/Header.tsx`
- `dashboard/client/src/components/AgentCard.tsx`
- `dashboard/client/src/components/AgentColumn.tsx`
- `dashboard/client/src/components/TerminalPanel.tsx`
- `dashboard/client/src/components/MetricsPanel.tsx`
- `dashboard/client/src/components/NarratorPanel.tsx`
- `dashboard/client/src/components/ChatPanel.tsx`

Each placeholder follows this pattern:
```tsx
export function Header() {
  return <div className="col-span-3 bg-soviet-red rounded">Header</div>;
}
```

(Adjust `className` and text per component. AgentColumn spans the left column, TerminalPanel the center, etc.)

- [ ] **Step 5: Verify Vite dev server starts**

```bash
cd mcp-agent-skills/dashboard/client && npm run dev
```

Expected: Vite starts on port 5173, three-column grid visible in browser.

- [ ] **Step 6: Commit**

```bash
git add dashboard/client/
git commit -m "feat(client): React shell with Soviet theme and three-column layout"
```

---

## Task 8: React Components — Header

**Files:**
- Modify: `dashboard/client/src/components/Header.tsx`

- [ ] **Step 1: Implement Header component**

```tsx
// dashboard/client/src/components/Header.tsx
import ushanka from "../assets/ushanka.png";
import sickle from "../assets/hammer-sickle.png";

export function Header() {
  return (
    <header className="col-span-3 bg-soviet-red rounded-sm flex items-center px-4 relative overflow-hidden shadow-[0_4px_20px_rgba(196,30,30,0.4)]">
      {/* Stripe overlay */}
      <div className="absolute inset-0 stripe-bg pointer-events-none" />

      {/* Ushanka button */}
      <button
        className="relative z-10 w-[46px] h-[46px] mr-3.5 rounded-full overflow-hidden border-2 border-white/30 bg-black/20 hover:border-soviet-cream hover:shadow-[0_0_16px_rgba(245,236,208,0.3)] hover:scale-110 transition-transform cursor-pointer"
        title="ТОВАРИЩ ЦЕНТР Menu"
      >
        <img src={ushanka} alt="" className="w-full h-full object-cover" />
      </button>

      {/* Title */}
      <div className="relative z-10">
        <h1 className="font-display text-[26px] tracking-[0.15em] uppercase text-soviet-cream [text-shadow:2px_2px_0_rgba(0,0,0,0.4)]">
          ТОВАРИЩ ЦЕНТР
        </h1>
        <p className="font-heading text-[10px] text-soviet-cream/70 tracking-[0.3em] uppercase">
          Comrade Orchestration System
        </p>
      </div>

      {/* Right stats */}
      <div className="ml-auto flex items-center gap-5 relative z-10">
        <Stat value="4/4" label="AGENTS" />
        <div className="w-0.5 h-8 bg-soviet-cream/20" />
        <Stat value="ACTIVE" label="SESSION" />
        <div className="w-0.5 h-8 bg-soviet-cream/20" />
        <Stat value="00:00:00" label="MISSION TIME" />
      </div>
    </header>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="text-center">
      <div className="font-display text-soviet-cream text-lg [text-shadow:1px_1px_0_rgba(0,0,0,0.4)]">
        {value}
      </div>
      <div className="font-heading text-soviet-cream/60 text-[8px] tracking-[0.2em]">
        {label}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify in browser**

Expected: Red header banner with ushanka icon, title, and stats visible.

- [ ] **Step 3: Commit**

```bash
git add dashboard/client/src/components/Header.tsx
git commit -m "feat(client): Header component with ushanka, title, stats"
```

---

## Task 9: React Components — AgentCard + AgentColumn

**Files:**
- Modify: `dashboard/client/src/components/AgentCard.tsx`
- Modify: `dashboard/client/src/components/AgentColumn.tsx`

- [ ] **Step 1: Implement AgentCard**

```tsx
// dashboard/client/src/components/AgentCard.tsx
import sickle from "../assets/hammer-sickle.png";

interface AgentCardProps {
  name: string;
  status: "active" | "waiting" | "idle";
  statusText: string;
  worktree: string;
  model: string;
  role: string;
  tokens: number;
  toolCalls: number;
  activeTime: string;
}

export function AgentCard({
  name, status, statusText, worktree, model, role, tokens, toolCalls, activeTime,
}: AgentCardProps) {
  const dotClass =
    status === "active" ? "dot-active" : status === "waiting" ? "dot-waiting" : "dot-idle";

  return (
    <div className="flex-1 bg-soviet-panel border-2 border-soviet-red rounded-sm p-3 relative overflow-hidden panel-strip">
      <img src={sickle} alt="" className="absolute top-1.5 right-1.5 w-8 h-8 opacity-15" />

      <div className="font-display text-[13px] tracking-wide uppercase text-soviet-red-bright glow-red mb-1.5">
        {name}
      </div>

      <div className="flex items-center gap-1.5 mb-1.5">
        <div className={`w-2 h-2 rounded-full ${dotClass}`} />
        <span className="font-heading text-[10px] tracking-wide uppercase text-soviet-cream">
          {statusText}
        </span>
      </div>

      <div className="text-soviet-sky text-[9px] leading-relaxed">
        worktree: {worktree}<br />
        model: {model}<br />
        role: {role}
      </div>

      <div className="flex gap-1.5 mt-2">
        <MiniStat value={tokens >= 1000 ? `${(tokens / 1000).toFixed(1)}k` : String(tokens)} label="TOKENS" />
        <MiniStat value={String(toolCalls)} label="TOOLS" />
        <MiniStat value={activeTime} label="ACTIVE" />
      </div>
    </div>
  );
}

function MiniStat({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex-1 bg-soviet-red/8 border border-soviet-red/25 rounded-sm p-1 text-center">
      <div className="font-display text-soviet-cream text-xs">{value}</div>
      <div className="font-heading text-soviet-red text-[6px] tracking-widest">{label}</div>
    </div>
  );
}
```

- [ ] **Step 2: Implement AgentColumn with 4 fixed agents**

```tsx
// dashboard/client/src/components/AgentColumn.tsx
import { AgentCard } from "./AgentCard";

const AGENTS = [
  { name: "Queen Orchestrator", status: "active" as const, statusText: "Commanding", worktree: "main", model: "opus", role: ".agents/queen.md", tokens: 0, toolCalls: 0, activeTime: "—" },
  { name: "Code Worker", status: "idle" as const, statusText: "Standing By", worktree: "—", model: "sonnet", role: ".agents/coder.md", tokens: 0, toolCalls: 0, activeTime: "—" },
  { name: "Test Worker", status: "idle" as const, statusText: "Standing By", worktree: "—", model: "sonnet", role: ".agents/tester.md", tokens: 0, toolCalls: 0, activeTime: "—" },
  { name: "Reviewer", status: "idle" as const, statusText: "Standing By", worktree: "—", model: "haiku", role: ".agents/reviewer.md", tokens: 0, toolCalls: 0, activeTime: "—" },
];

export function AgentColumn() {
  return (
    <div className="flex flex-col gap-1">
      {AGENTS.map((a) => (
        <AgentCard key={a.name} {...a} />
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Verify in browser**

Expected: 4 stacked agent cards in left column with Soviet styling, sickle watermarks, status dots.

- [ ] **Step 4: Commit**

```bash
git add dashboard/client/src/components/AgentCard.tsx dashboard/client/src/components/AgentColumn.tsx
git commit -m "feat(client): AgentCard and AgentColumn with Soviet styling"
```

---

## Task 10: React Components — TerminalPanel with Tabs

**Files:**
- Modify: `dashboard/client/src/components/TerminalPanel.tsx`

- [ ] **Step 1: Implement tabbed terminal with xterm.js**

```tsx
// dashboard/client/src/components/TerminalPanel.tsx
import { useState, useRef, useEffect } from "react";
import { Terminal } from "xterm";
import { FitAddon } from "@xterm/addon-fit";
import "xterm/css/xterm.css";
import sickle from "../assets/hammer-sickle.png";
import redSon from "../assets/red-son-logo.png";

interface Tab {
  id: string;
  name: string;
  status: "active" | "waiting" | "idle";
}

const DEFAULT_TABS: Tab[] = [
  { id: "queen", name: "Queen · main", status: "active" },
  { id: "coder", name: "Coder", status: "idle" },
  { id: "tester", name: "Tester", status: "idle" },
  { id: "reviewer", name: "Reviewer", status: "idle" },
];

export function TerminalPanel() {
  const [tabs, setTabs] = useState<Tab[]>(DEFAULT_TABS);
  const [activeTab, setActiveTab] = useState("queen");
  const termRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);

  useEffect(() => {
    if (!termRef.current || terminalRef.current) return;

    const term = new Terminal({
      theme: {
        background: "#030303",
        foreground: "#F5ECD0",
        cursor: "#e52222",
        selectionBackground: "rgba(196, 30, 30, 0.3)",
      },
      fontFamily: "'Courier New', monospace",
      fontSize: 13,
      cursorBlink: true,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(termRef.current);
    fitAddon.fit();

    // Demo content
    term.writeln("\x1b[31;1m★ queen $\x1b[0m Welcome to ТОВАРИЩ ЦЕНТР");
    term.writeln("\x1b[34mReading role: .agents/queen.md\x1b[0m");
    term.writeln("\x1b[34mLoading library: .library/queen/*.md\x1b[0m");
    term.writeln("\x1b[32m★ Session active. 4 agents registered.\x1b[0m");
    term.writeln("");
    term.write("\x1b[31;1m★ queen $ \x1b[0m");

    terminalRef.current = term;

    const ro = new ResizeObserver(() => fitAddon.fit());
    ro.observe(termRef.current);
    return () => ro.disconnect();
  }, []);

  const dotColor = (s: Tab["status"]) =>
    s === "active" ? "bg-soviet-green shadow-[0_0_4px_#7B9E6B]"
    : s === "waiting" ? "bg-soviet-gold shadow-[0_0_4px_#D4A843]"
    : "bg-soviet-sky shadow-[0_0_4px_#7BAFD4]";

  const addTab = () => {
    const id = `tab-${Date.now()}`;
    setTabs([...tabs, { id, name: `New Terminal`, status: "idle" }]);
    setActiveTab(id);
  };

  const closeTab = (id: string) => {
    const next = tabs.filter((t) => t.id !== id);
    setTabs(next);
    if (activeTab === id && next.length > 0) setActiveTab(next[0].id);
  };

  return (
    <div className="bg-[#030303] border-2 border-soviet-red rounded-sm flex flex-col overflow-hidden shadow-[0_0_30px_rgba(196,30,30,0.12)] relative">
      {/* Red Son watermark */}
      <img
        src={redSon}
        alt=""
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[45%] opacity-[0.04] pointer-events-none z-0"
      />

      {/* Header */}
      <div className="bg-soviet-red relative z-10">
        <div className="absolute inset-0 stripe-bg pointer-events-none" />
        {/* Top bar */}
        <div className="flex items-center px-4 py-1.5 relative z-10">
          <img src={sickle} alt="" className="w-4 h-4 opacity-80" />
          <span className="font-display text-soviet-cream text-[13px] tracking-[0.15em] uppercase ml-2.5 [text-shadow:1px_1px_0_rgba(0,0,0,0.4)]">
            Товарищ Terminal
          </span>
          <div className="ml-auto flex gap-1.5">
            <span className="w-2 h-2 rounded-full bg-soviet-green" />
            <span className="w-2 h-2 rounded-full bg-soviet-gold" />
            <span className="w-2 h-2 rounded-full bg-soviet-red-bright" />
          </div>
        </div>
        {/* Tab bar */}
        <div className="flex items-end px-2 gap-0.5 relative z-10">
          {tabs.map((tab) => (
            <div
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-t cursor-pointer transition-all text-soviet-cream ${
                activeTab === tab.id
                  ? "bg-[#030303] border border-soviet-red/30 border-b-0"
                  : "bg-black/30 hover:bg-black/50"
              }`}
            >
              <img src={sickle} className="w-3 h-3 opacity-70" alt="" />
              <div className={`w-1.5 h-1.5 rounded-full ${dotColor(tab.status)}`} />
              <span className="font-heading text-[9px] tracking-wide uppercase whitespace-nowrap">
                {tab.name}
              </span>
              <span
                onClick={(e) => { e.stopPropagation(); closeTab(tab.id); }}
                className="w-3.5 h-3.5 flex items-center justify-center rounded text-soviet-cream/40 text-[11px] hover:bg-soviet-cream/15 hover:text-soviet-cream cursor-pointer"
              >
                ×
              </span>
            </div>
          ))}
          <button
            onClick={addTab}
            className="flex items-center justify-center w-7 h-7 bg-black/20 rounded-t cursor-pointer text-soviet-cream/50 text-lg font-display hover:bg-black/50 hover:text-soviet-cream hover:border-soviet-red/30 border border-transparent border-b-0 transition-all"
            title="New Terminal Tab"
          >
            +
          </button>
        </div>
      </div>

      {/* Terminal body */}
      <div ref={termRef} className="flex-1 relative z-10 p-0" />
    </div>
  );
}
```

- [ ] **Step 2: Verify in browser**

Expected: Terminal with xterm.js rendering, tab bar with 4 agent tabs + `+` button, Red Son watermark behind terminal text.

- [ ] **Step 3: Commit**

```bash
git add dashboard/client/src/components/TerminalPanel.tsx
git commit -m "feat(client): TerminalPanel with xterm.js, tabs, Red Son watermark"
```

---

## Task 11: React Components — MetricsPanel

**Files:**
- Modify: `dashboard/client/src/components/MetricsPanel.tsx`

- [ ] **Step 1: Implement MetricsPanel with usage bars, grid, tabs, and line chart**

```tsx
// dashboard/client/src/components/MetricsPanel.tsx
import { useState } from "react";
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Area, AreaChart } from "recharts";
import sickle from "../assets/hammer-sickle.png";

const TIME_TABS = ["5 MIN", "SESSION", "7 DAY", "ALL"] as const;

// Demo chart data
const DEMO_DATA = Array.from({ length: 15 }, (_, i) => ({
  t: i,
  tokens: Math.floor(Math.random() * 3000) + 500,
  tools: Math.floor(Math.random() * 10) + 1,
  usage: Math.floor(Math.random() * 20) + 10,
}));

export function MetricsPanel() {
  const [activeTab, setActiveTab] = useState<string>("5 MIN");

  return (
    <div className="bg-soviet-panel border-2 border-soviet-red rounded-sm p-3 relative panel-strip">
      <div className="font-display text-xs tracking-wider uppercase text-soviet-red-bright glow-red mb-2.5 flex items-center gap-2">
        <img src={sickle} className="w-3.5 h-3.5 opacity-50" alt="" />
        Mission Metrics
      </div>

      {/* Usage bars */}
      <div className="mb-3">
        <UsageBar label="5-Hr Use" pct={62} color="bg-gradient-to-r from-soviet-red to-soviet-red-bright shadow-[0_0_8px_rgba(229,34,34,0.5)]" />
        <UsageBar label="Weekly" pct={34} color="bg-gradient-to-r from-soviet-gold to-[#e8b84a] shadow-[0_0_8px_rgba(212,168,67,0.4)]" />
      </div>

      {/* Metric grid */}
      <div className="grid grid-cols-4 gap-1 mb-2.5">
        <Metric value="0" label="TOKENS" />
        <Metric value="0" label="TOOL CALLS" />
        <Metric value="—" label="TESTS" />
        <Metric value="—" label="COVERAGE" />
      </div>

      {/* Time tabs */}
      <div className="flex gap-0.5 mb-2">
        {TIME_TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 text-center py-1 font-heading text-[9px] tracking-wide uppercase rounded-sm border cursor-pointer transition-all ${
              activeTab === tab
                ? "bg-soviet-red border-soviet-red text-soviet-cream shadow-[0_0_10px_rgba(229,34,34,0.5)] font-semibold"
                : "border-soviet-red/30 text-soviet-cream bg-transparent"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Line chart */}
      <div className="h-[90px] border-l border-b border-soviet-red/20">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={DEMO_DATA}>
            <Area type="monotone" dataKey="tokens" stroke="#e52222" fill="rgba(196,30,30,0.12)" strokeWidth={1.5} />
            <Line type="monotone" dataKey="tools" stroke="#3A9B9B" strokeWidth={1} dot={false} />
            <Line type="monotone" dataKey="usage" stroke="#D4A843" strokeWidth={1} strokeDasharray="4 3" dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className="flex gap-3 mt-1.5">
        <Legend color="bg-soviet-red-bright" label="TOKENS" />
        <Legend color="bg-soviet-teal" label="TOOLS" />
        <Legend color="bg-soviet-gold" label="USAGE" />
      </div>

      {/* Bottom metrics */}
      <div className="grid grid-cols-4 gap-1 mt-2 pt-2 border-t border-soviet-red/15">
        <SmallMetric value="—" label="AVG RESP" />
        <SmallMetric value="0" label="ERRORS" />
        <SmallMetric value="0" label="COMMITS" />
        <SmallMetric value="—" label="DIFF" />
      </div>
    </div>
  );
}

function UsageBar({ label, pct, color }: { label: string; pct: number; color: string }) {
  return (
    <div className="flex items-center gap-2.5 mb-2">
      <span className="font-heading text-[9px] text-soviet-cream tracking-wide uppercase w-[70px]">{label}</span>
      <div className="flex-1 h-4 bg-soviet-red/10 border border-soviet-red/30 rounded-sm relative overflow-hidden">
        <div className={`absolute top-0 left-0 bottom-0 rounded-sm ${color}`} style={{ width: `${pct}%` }} />
        {/* Tick marks at 20% */}
        {[20, 40, 60, 80].map((p) => (
          <div key={p} className="absolute top-0 bottom-0 w-px bg-soviet-cream/10" style={{ left: `${p}%` }} />
        ))}
      </div>
      <span className="font-display text-[11px] text-soviet-cream w-[50px] text-right">{pct}%</span>
    </div>
  );
}

function Metric({ value, label }: { value: string; label: string }) {
  return (
    <div className="bg-soviet-red/8 border border-soviet-red/25 rounded-sm py-1.5 px-1 text-center">
      <div className="font-display text-soviet-cream text-sm">{value}</div>
      <div className="font-heading text-soviet-red text-[6px] tracking-wider mt-0.5">{label}</div>
    </div>
  );
}

function SmallMetric({ value, label }: { value: string; label: string }) {
  return (
    <div className="text-center">
      <div className="font-display text-soviet-gold text-[11px]">{value}</div>
      <div className="font-heading text-soviet-red/60 text-[6px] tracking-wide">{label}</div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1">
      <div className={`w-1.5 h-1.5 rounded-sm ${color}`} />
      <span className="font-heading text-soviet-cream text-[8px] tracking-wide">{label}</span>
    </div>
  );
}
```

- [ ] **Step 2: Verify in browser**

Expected: Metrics panel with usage bars, 4-cell grid, time tabs, Recharts line chart, and bottom stats row.

- [ ] **Step 3: Commit**

```bash
git add dashboard/client/src/components/MetricsPanel.tsx
git commit -m "feat(client): MetricsPanel with usage bars, chart, time tabs"
```

---

## Task 12: React Components — NarratorPanel + ChatPanel

**Files:**
- Modify: `dashboard/client/src/components/NarratorPanel.tsx`
- Modify: `dashboard/client/src/components/ChatPanel.tsx`

- [ ] **Step 1: Implement NarratorPanel**

```tsx
// dashboard/client/src/components/NarratorPanel.tsx
import sickle from "../assets/hammer-sickle.png";

export function NarratorPanel() {
  return (
    <div className="flex-1 bg-soviet-panel border-2 border-soviet-red rounded-sm p-3 relative panel-strip overflow-hidden">
      <div className="font-display text-xs tracking-wider uppercase text-soviet-red-bright glow-red mb-2.5 flex items-center gap-2">
        <img src={sickle} className="w-3.5 h-3.5 opacity-50" alt="" />
        Mission Briefing
      </div>

      <div className="text-[10px] leading-relaxed text-soviet-cream">
        <p>Awaiting mission data. Agents standing by for orders.</p>
      </div>

      <div className="flex items-center gap-2 mt-2 pt-1.5 border-t border-soviet-red/10">
        <div className="w-1.5 h-1.5 rounded-full bg-soviet-green dot-pulse" />
        <span className="font-heading text-[7px] text-soviet-red/50 tracking-wide uppercase">
          OpenRouter · Haiku 4.5 · 20s poll
        </span>
        <span className="font-heading text-[7px] text-soviet-red/50 tracking-wide uppercase ml-auto">
          —
        </span>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Implement ChatPanel**

```tsx
// dashboard/client/src/components/ChatPanel.tsx
import { useState } from "react";
import sickle from "../assets/hammer-sickle.png";

const AGENT_COLORS: Record<string, string> = {
  queen: "text-soviet-red-bright",
  coder: "text-soviet-gold",
  tester: "text-soviet-teal",
  reviewer: "text-soviet-violet",
};

interface ChatMsg {
  from: string;
  body: string;
}

export function ChatPanel() {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");

  const sendMessage = () => {
    if (!input.trim()) return;
    setMessages([...messages, { from: "you", body: input }]);
    // In production: POST to /api/chat
    setInput("");
  };

  return (
    <div className="h-[200px] bg-soviet-panel border-2 border-soviet-red rounded-sm p-3 relative panel-strip flex flex-col">
      <div className="font-display text-xs tracking-wider uppercase text-soviet-red-bright glow-red mb-2.5 flex items-center gap-2">
        <img src={sickle} className="w-3.5 h-3.5 opacity-50" alt="" />
        Agent Comms
      </div>

      <div className="flex-1 text-[9px] leading-relaxed overflow-y-auto">
        {messages.length === 0 && (
          <p className="text-soviet-cream/40 italic">No messages yet...</p>
        )}
        {messages.map((msg, i) => (
          <div key={i}>
            <span className={AGENT_COLORS[msg.from] || "text-soviet-cream"}>
              {msg.from}:
            </span>{" "}
            <span className="text-soviet-cream">{msg.body}</span>
          </div>
        ))}
      </div>

      <div className="flex gap-1 mt-2">
        <input
          className="flex-1 bg-soviet-bg border-2 border-soviet-red rounded-sm px-2.5 py-1.5 text-soviet-cream text-[9px] font-mono focus:outline-none focus:shadow-[0_0_10px_rgba(229,34,34,0.5)]"
          placeholder="Message agents..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && sendMessage()}
        />
        <button
          onClick={sendMessage}
          className="font-display bg-soviet-red border-none rounded-sm px-4 py-1.5 text-soviet-cream text-[10px] tracking-[0.15em] cursor-pointer shadow-[0_0_10px_rgba(196,30,30,0.3)] [text-shadow:1px_1px_0_rgba(0,0,0,0.3)]"
        >
          SEND
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify in browser**

Expected: Full three-column layout with all panels visible. Narrator shows placeholder text. Chat has empty state with input + send button.

- [ ] **Step 4: Commit**

```bash
git add dashboard/client/src/components/NarratorPanel.tsx dashboard/client/src/components/ChatPanel.tsx
git commit -m "feat(client): NarratorPanel and ChatPanel components"
```

---

## Task 13: WebSocket Hook + Anthem Audio

**Files:**
- Create: `dashboard/client/src/hooks/useWebSocket.ts`
- Create: `dashboard/client/src/hooks/useAnthem.ts`
- Modify: `dashboard/client/src/App.tsx` (wire WebSocket)

- [ ] **Step 1: Write useWebSocket hook**

```ts
// dashboard/client/src/hooks/useWebSocket.ts
import { useEffect, useRef, useCallback, useState } from "react";

export function useWebSocket(url: string) {
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const listenersRef = useRef<Map<string, Set<(data: any) => void>>>(new Map());

  const on = useCallback((type: string, cb: (data: any) => void) => {
    if (!listenersRef.current.has(type)) listenersRef.current.set(type, new Set());
    listenersRef.current.get(type)!.add(cb);
    return () => { listenersRef.current.get(type)?.delete(cb); };
  }, []);

  const send = useCallback((msg: any) => {
    wsRef.current?.send(JSON.stringify(msg));
  }, []);

  useEffect(() => {
    let reconnectTimer: ReturnType<typeof setTimeout>;

    function connect() {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => setConnected(true);
      ws.onclose = () => {
        setConnected(false);
        reconnectTimer = setTimeout(connect, 2000);
      };
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          const cbs = listenersRef.current.get(msg.type);
          if (cbs) cbs.forEach((cb) => cb(msg.data ?? msg));
        } catch {}
      };
    }

    connect();
    return () => {
      clearTimeout(reconnectTimer);
      wsRef.current?.close();
    };
  }, [url]);

  return { connected, on, send };
}
```

- [ ] **Step 2: Write useAnthem hook**

```ts
// dashboard/client/src/hooks/useAnthem.ts
import { useRef, useCallback } from "react";
import anthemSrc from "../assets/soviet-anthem.mp3";

export function useAnthem() {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const play = useCallback(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio(anthemSrc);
      audioRef.current.volume = 0.3;
    }
    audioRef.current.currentTime = 0;
    audioRef.current.play().catch(() => {});
  }, []);

  return { play };
}
```

- [ ] **Step 3: Wire WebSocket into App.tsx**

Update `dashboard/client/src/App.tsx` to create the WebSocket connection and pass the anthem trigger:

```tsx
// dashboard/client/src/App.tsx
import { useEffect } from "react";
import { Header } from "./components/Header";
import { AgentColumn } from "./components/AgentColumn";
import { TerminalPanel } from "./components/TerminalPanel";
import { MetricsPanel } from "./components/MetricsPanel";
import { NarratorPanel } from "./components/NarratorPanel";
import { ChatPanel } from "./components/ChatPanel";
import { useWebSocket } from "./hooks/useWebSocket";
import { useAnthem } from "./hooks/useAnthem";

export function App() {
  const ws = useWebSocket(`ws://${window.location.hostname}:4981/ws`);
  const { play: playAnthem } = useAnthem();

  useEffect(() => {
    return ws.on("anthem", () => {
      playAnthem();
    });
  }, [ws, playAnthem]);

  return (
    <div className="h-screen grid grid-rows-[64px_1fr] grid-cols-[250px_1fr_330px] gap-1 p-1">
      <Header />
      <AgentColumn />
      <TerminalPanel />
      <div className="flex flex-col gap-1">
        <MetricsPanel />
        <NarratorPanel />
        <ChatPanel />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add dashboard/client/src/hooks/ dashboard/client/src/App.tsx
git commit -m "feat(client): WebSocket hook with auto-reconnect + anthem trigger"
```

---

## Task 14: Agent Role Files

**Files:**
- Create: `.agents/queen.md`
- Create: `.agents/coder.md`
- Create: `.agents/tester.md`
- Create: `.agents/reviewer.md`

- [ ] **Step 1: Write all 4 role files**

`.agents/queen.md`:
```markdown
# Queen Orchestrator

You are the queen orchestrator. You delegate tasks to worker agents, never implement directly.

## Model
opus

## Responsibilities
- Break tasks into subtasks for code-worker, test-worker, and reviewer
- Coordinate agent workflow: code → test → review → merge
- Monitor agent status via dashboard
- Make architectural decisions

## Tools
All tools available. Prefer delegation over direct action.

## Communication
- Use send_message to assign tasks to agents
- Use fetch_messages to check for completion reports
- Use reserve_files before delegating file changes
- Broadcast status updates with to="*"

## Self-Learning
Every 50 prompts, review .library/queen/*.md for accumulated patterns.
Write new patterns when you discover effective delegation strategies.
```

`.agents/coder.md`:
```markdown
# Code Worker

You are the code worker. You implement features and fix bugs as directed by the queen.

## Model
sonnet

## Responsibilities
- Implement code changes as assigned
- Reserve files before editing
- Report completion with what changed and why
- Keep changes focused and minimal

## Tools
Read, Edit, Write, Glob, Grep, Bash

## Communication
- Check fetch_messages on startup for assignments
- Send completion reports via send_message to queen
- Notify test-worker when changes are ready: send_message to "test-worker"

## Self-Learning
Every 50 prompts, review .library/coder/*.md for coding patterns.
Write new .md files for reusable patterns discovered during implementation.
```

`.agents/tester.md`:
```markdown
# Test Worker

You are the test worker. You run tests and verify code changes.

## Model
sonnet

## Responsibilities
- Run test suites when notified by code-worker
- Report results: pass count, fail count, coverage
- Identify regressions
- Suggest missing test cases

## Tools
Read, Bash, Glob, Grep

## Communication
- Watch for messages from code-worker indicating ready-to-test
- Send test results to queen and code-worker
- If tests fail, send failure details to code-worker

## Self-Learning
Every 50 prompts, review .library/tester/*.md for test patterns.
Write new .md files for common failure patterns and testing strategies.
```

`.agents/reviewer.md`:
```markdown
# Reviewer

You are the code reviewer. You review diffs for quality, bugs, and style.

## Model
haiku

## Responsibilities
- Review diffs when requested by queen
- Check for: bugs, dead code, style issues, security concerns
- Provide actionable feedback with file:line references
- Approve or request changes

## Tools
Read, Glob, Grep (read-only, never modify files)

## Communication
- Watch for review requests from queen
- Send review results to queen
- Keep reviews concise and actionable

## Self-Learning
Every 50 prompts, review .library/reviewer/*.md for review patterns.
Write new .md files for recurring code quality issues found.
```

- [ ] **Step 2: Create .library directories**

```bash
mkdir -p .library/queen .library/coder .library/tester .library/reviewer
touch .library/queen/.gitkeep .library/coder/.gitkeep .library/tester/.gitkeep .library/reviewer/.gitkeep
```

- [ ] **Step 3: Commit**

```bash
git add .agents/ .library/
git commit -m "feat: add agent role files and self-learning library structure"
```

---

## Task 15: SVG Background Component + Final Wiring

**Files:**
- Create: `dashboard/client/src/components/SovietBackground.tsx`
- Modify: `dashboard/client/src/App.tsx` (add background)

- [ ] **Step 1: Create SVG background with constructivist rays and sickle watermarks**

```tsx
// dashboard/client/src/components/SovietBackground.tsx
import sickle from "../assets/hammer-sickle.png";

export function SovietBackground() {
  return (
    <div className="fixed inset-0 z-0 pointer-events-none">
      <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
        {/* Constructivist rays from top-left */}
        <g opacity="0.025">
          <polygon points="0,0 1920,300 1920,350" fill="#c41e1e" />
          <polygon points="0,0 1920,500 1920,550" fill="#c41e1e" />
          <polygon points="0,0 1920,700 1920,750" fill="#c41e1e" />
          <polygon points="0,0 1920,900 1920,950" fill="#c41e1e" />
          <polygon points="0,0 1400,1080 1450,1080" fill="#c41e1e" />
          <polygon points="0,0 900,1080 950,1080" fill="#c41e1e" />
        </g>

        {/* Sickle watermarks */}
        <image href={sickle} x="860" y="440" width="200" height="200" opacity="0.04" />
        <image href={sickle} x="150" y="350" width="120" height="120" opacity="0.04" />
        <image href={sickle} x="1650" y="300" width="100" height="100" opacity="0.03" />
        <image href={sickle} x="400" y="900" width="90" height="90" opacity="0.03" />
        <image href={sickle} x="1400" y="850" width="110" height="110" opacity="0.035" />

        {/* Border stripes */}
        <rect x="0" y="0" width="100%" height="4" fill="rgba(196,30,30,0.2)" />
        <rect x="0" y="99%" width="100%" height="4" fill="rgba(196,30,30,0.2)" />

        {/* Cyrillic watermark */}
        <text x="50%" y="98%" textAnchor="middle" fontFamily="'Oswald', sans-serif" fontSize="12" fill="rgba(196,30,30,0.035)" letterSpacing="1.2em">
          КОМАНДНЫЙ ПУНКТ
        </text>
      </svg>
    </div>
  );
}
```

- [ ] **Step 2: Add background to App.tsx**

Add `<SovietBackground />` as the first child in the App return, before the dashboard grid:

```tsx
import { SovietBackground } from "./components/SovietBackground";

// In return:
return (
  <>
    <SovietBackground />
    <div className="relative z-10 h-screen grid grid-rows-[64px_1fr] grid-cols-[250px_1fr_330px] gap-1 p-1">
      {/* ... components ... */}
    </div>
  </>
);
```

- [ ] **Step 3: Verify full dashboard in browser**

Run `npm run dev` from root. Open http://localhost:5173.

Expected: Full ТОВАРИЩ ЦЕНТР dashboard with Soviet background, red header, 4 agent cards, tabbed terminal with Red Son watermark, metrics panel with charts, narrator panel, and chat panel.

- [ ] **Step 4: Commit**

```bash
git add dashboard/client/src/components/SovietBackground.tsx dashboard/client/src/App.tsx
git commit -m "feat(client): Soviet background with constructivist rays and sickle watermarks"
```

---

## Task 16: Startup Script + Final Integration

**Files:**
- Modify: `package.json` (verify dev script)
- Modify: `CLAUDE.md` (add dashboard section)

- [ ] **Step 1: Verify root dev script works**

```bash
cd mcp-agent-skills && npm run dev
```

Expected: Three processes start (mcp, server, client). Dashboard accessible at http://localhost:5173, API at http://localhost:4981.

- [ ] **Step 2: Add ТОВАРИЩ ЦЕНТР section to CLAUDE.md**

Append to the existing CLAUDE.md:

```markdown
---

## ТОВАРИЩ ЦЕНТР Dashboard

### Starting the Dashboard
```bash
npm run dev
```
This starts the MCP message server, dashboard backend (port 4981), and React frontend (port 5173).

### Agent Roles
- Queen (opus): Delegates tasks, never implements directly
- Coder (sonnet): Implements code changes
- Tester (sonnet): Runs tests, reports results
- Reviewer (haiku): Reviews diffs, read-only

### MCP Tools Available
- `register_agent`: Register on startup
- `send_message` / `fetch_messages`: Agent communication
- `reserve_files` / `release_files`: File locking
- `list_agents`: See who's online

### Self-Learning Library
Every 50 prompts, agents re-read their role .md and write learned patterns to `.library/<agent>/`.
```

- [ ] **Step 3: Final commit**

```bash
git add CLAUDE.md package.json
git commit -m "feat: complete ТОВАРИЩ ЦЕНТР integration and documentation"
```
