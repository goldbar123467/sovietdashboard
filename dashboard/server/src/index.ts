import type { ServerWebSocket } from "bun";
import { addEvent, recentEvents } from "./db";
import type { HookEvent, ChatMessage, WsMessage } from "./types";
import { startNarrator, setUpdateCallback, getNarration } from "./narrator";
import { listAgents, dispatch, getAgent, setAgentBroadcaster } from "./agents";
import { snapshot, type MetricsWindow } from "./metrics";

const PORT = Number(process.env.PORT) || 4981;

// ---------- WebSocket client tracking ----------

const clients = new Set<ServerWebSocket<unknown>>();

/** Broadcast a WsMessage to every connected client. */
export function broadcast(msg: WsMessage): void {
  const payload = JSON.stringify(msg);
  for (const ws of clients) {
    ws.send(payload);
  }
}

// ---------- CORS helpers ----------

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

// ---------- Server ----------

Bun.serve({
  port: PORT,

  fetch(req, server) {
    const url = new URL(req.url);

    // --- Preflight ---
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    // --- WebSocket upgrade ---
    if (url.pathname === "/ws") {
      const upgraded = server.upgrade(req);
      if (!upgraded) {
        return new Response("WebSocket upgrade failed", { status: 400 });
      }
      return undefined;
    }

    // --- POST /api/events ---
    if (req.method === "POST" && url.pathname === "/api/events") {
      return (async () => {
        const body = (await req.json()) as any;

        // Normalize: Claude Code hook stdin uses tool_name/tool_input/tool_response
        // but dashboard expects hook_event/tool_output. Fill defaults.
        const event: HookEvent = {
          session_id: body.session_id || "unknown",
          agent_id: body.agent_id,
          hook_event: body.hook_event || (body.tool_name ? "PostToolUse" : "Unknown"),
          tool_name: body.tool_name,
          tool_input: typeof body.tool_input === "string"
            ? body.tool_input
            : body.tool_input ? JSON.stringify(body.tool_input).slice(0, 500) : undefined,
          tool_output: body.tool_output
            ?? (body.tool_response ? JSON.stringify(body.tool_response).slice(0, 500) : undefined),
          timestamp: body.timestamp || new Date().toISOString(),
          duration_ms: body.duration_ms,
          error: body.error,
        };

        addEvent(event);
        broadcast({ type: "event", data: event });
        return json({ ok: true });
      })();
    }

    // --- POST /api/chat ---
    if (req.method === "POST" && url.pathname === "/api/chat") {
      return (async () => {
        const body = (await req.json()) as ChatMessage;
        if (!body.from || !body.body) {
          return json({ error: "Missing required fields: from, body" }, 400);
        }
        const msg: ChatMessage = {
          from: body.from,
          to: body.to || "queen",
          body: body.body,
          timestamp: body.timestamp || new Date().toISOString(),
        };
        broadcast({ type: "chat", data: msg });
        if (getAgent(msg.to)) {
          dispatch(msg.to, msg.body);
        }
        return json({ ok: true });
      })();
    }

    // --- GET /api/agents ---
    if (req.method === "GET" && url.pathname === "/api/agents") {
      return json(listAgents());
    }

    // --- GET /api/metrics?window=5m|session|7d|all ---
    if (req.method === "GET" && url.pathname === "/api/metrics") {
      const w = (url.searchParams.get("window") || "session") as MetricsWindow;
      const valid: MetricsWindow[] = ["5m", "session", "7d", "all"];
      const win = valid.includes(w) ? w : "session";
      return json(snapshot(win));
    }

    // --- POST /api/agents/:id/dispatch ---
    if (req.method === "POST" && url.pathname.startsWith("/api/agents/") && url.pathname.endsWith("/dispatch")) {
      return (async () => {
        const id = url.pathname.split("/")[3];
        if (!getAgent(id)) return json({ error: "unknown agent" }, 404);
        const body = (await req.json()) as { body?: string };
        if (!body.body) return json({ error: "missing body" }, 400);
        const result = await dispatch(id, body.body);
        return json(result);
      })();
    }

    // --- GET /api/events ---
    if (req.method === "GET" && url.pathname === "/api/events") {
      const limit = Number(url.searchParams.get("limit")) || 50;
      const events = recentEvents(limit);
      return json(events);
    }

    // --- GET /api/health ---
    if (req.method === "GET" && url.pathname === "/api/health") {
      return json({ status: "ok", clients: clients.size });
    }

    // --- GET /api/narrator ---
    if (req.method === "GET" && url.pathname === "/api/narrator") {
      return json({ summary: getNarration() });
    }

    return new Response("Not found", { status: 404, headers: CORS_HEADERS });
  },

  websocket: {
    open(ws) {
      clients.add(ws);
    },
    message(_ws, _message) {
      // Clients don't send actionable messages yet
    },
    close(ws) {
      clients.delete(ws);
    },
  },
});

console.log(`[\u0422\u041E\u0412\u0410\u0420\u0418\u0429 \u0426\u0415\u041D\u0422\u0420] Server running on http://localhost:${PORT}`);

setUpdateCallback((summary) => {
  broadcast({ type: "narrator", data: summary });
});

setAgentBroadcaster((type, data) => {
  broadcast({ type, data } as WsMessage);
});

startNarrator();
