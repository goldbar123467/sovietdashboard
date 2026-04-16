import type { ServerWebSocket } from "bun";
import { addEvent, recentEvents } from "./db";
import type { HookEvent, ChatMessage, WsMessage } from "./types";
import { startNarrator, setUpdateCallback, getNarration } from "./narrator";

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
        const body = (await req.json()) as HookEvent;
        if (!body.session_id || !body.hook_event || !body.timestamp) {
          return json({ error: "Missing required fields: session_id, hook_event, timestamp" }, 400);
        }
        addEvent(body);
        broadcast({ type: "event", data: body });
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
        broadcast({ type: "chat", data: body });
        return json({ ok: true });
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

startNarrator();
