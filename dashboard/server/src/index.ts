import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { WebSocket, WebSocketServer } from "ws";
import { addEvent, recentEvents } from "./db.js";
import type { ChatMessage, HookEvent, WsMessage } from "./types.js";
import { startNarrator, setUpdateCallback, getNarration } from "./narrator.js";
import { listAgents, dispatch, getAgent, setAgentBroadcaster } from "./agents.js";
import { snapshot, type MetricsWindow } from "./metrics.js";
import { listCommandDefinitions, runRegisteredCommand } from "./commandRegistry.js";
import { launchExternalBrowser, normalizeBrowserUrl, toEmbeddableUrl } from "./browserTools.js";

const PORT = Number(process.env.PORT) || 4981;

const clients = new Set<WebSocket>();

export function broadcast(msg: WsMessage): void {
  const payload = JSON.stringify(msg);
  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) ws.send(payload);
  }
}

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function sendJson(res: ServerResponse, data: unknown, status = 200): void {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
    ...CORS_HEADERS,
  });
  res.end(body);
}

function sendText(res: ServerResponse, text: string, status = 200): void {
  res.writeHead(status, {
    "Content-Type": "text/plain; charset=utf-8",
    "Content-Length": Buffer.byteLength(text),
    ...CORS_HEADERS,
  });
  res.end(text);
}

async function readJson<T>(req: IncomingMessage): Promise<T> {
  let body = "";
  for await (const chunk of req) body += chunk.toString();
  return body ? JSON.parse(body) as T : {} as T;
}

function normalizeEvent(body: any): HookEvent {
  return {
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
}

async function route(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const method = req.method || "GET";

  if (method === "OPTIONS") {
    res.writeHead(204, CORS_HEADERS);
    res.end();
    return;
  }

  if (method === "POST" && url.pathname === "/api/events") {
    const event = normalizeEvent(await readJson(req));
    addEvent(event);
    broadcast({ type: "event", data: event });
    sendJson(res, { ok: true });
    return;
  }

  if (method === "POST" && url.pathname === "/api/chat") {
    const body = await readJson<ChatMessage>(req);
    if (!body.from || !body.body) {
      sendJson(res, { error: "Missing required fields: from, body" }, 400);
      return;
    }
    const msg: ChatMessage = {
      from: body.from,
      to: body.to || "queen",
      body: body.body,
      timestamp: body.timestamp || new Date().toISOString(),
    };
    broadcast({ type: "chat", data: msg });
    if (getAgent(msg.to)) dispatch(msg.to, msg.body);
    sendJson(res, { ok: true });
    return;
  }

  if (method === "GET" && url.pathname === "/api/agents") {
    sendJson(res, listAgents());
    return;
  }

  if (method === "GET" && url.pathname === "/api/metrics") {
    const w = (url.searchParams.get("window") || "session") as MetricsWindow;
    const valid: MetricsWindow[] = ["5m", "session", "7d", "all"];
    sendJson(res, snapshot(valid.includes(w) ? w : "session"));
    return;
  }

  if (method === "POST" && url.pathname.startsWith("/api/agents/") && url.pathname.endsWith("/dispatch")) {
    const id = url.pathname.split("/")[3];
    if (!getAgent(id)) {
      sendJson(res, { error: "unknown agent" }, 404);
      return;
    }
    const body = await readJson<{ body?: string }>(req);
    if (!body.body) {
      sendJson(res, { error: "missing body" }, 400);
      return;
    }
    sendJson(res, await dispatch(id, body.body));
    return;
  }

  if (method === "GET" && url.pathname === "/api/events") {
    sendJson(res, recentEvents(Number(url.searchParams.get("limit")) || 50));
    return;
  }

  if (method === "GET" && url.pathname === "/api/health") {
    sendJson(res, {
      status: "ok",
      clients: clients.size,
      runtime: "node",
      commandBoard: true,
    });
    return;
  }

  if (method === "GET" && url.pathname === "/api/narrator") {
    sendJson(res, { summary: getNarration() });
    return;
  }

  if (method === "GET" && url.pathname === "/api/command-board/status") {
    sendJson(res, {
      commands: listCommandDefinitions(),
      host: {
        platform: process.platform,
        wsl: Boolean(process.env.WSL_DISTRO_NAME),
        openclawRepo: process.env.OPENCLAW_REPO || "/home/clark/code/openclaw",
      },
    });
    return;
  }

  if (method === "POST" && url.pathname.startsWith("/api/command-board/commands/")) {
    const id = decodeURIComponent(url.pathname.split("/").pop() || "");
    const body = await readJson<{ prompt?: string; url?: string }>(req);
    const result = await runRegisteredCommand(id, body);
    broadcast({ type: "command_result", data: result });
    sendJson(res, result, result.ok ? 200 : 400);
    return;
  }

  if (method === "POST" && url.pathname === "/api/command-board/browser/open") {
    const body = await readJson<{ url?: string }>(req);
    const rawUrl = body.url || "https://www.youtube.com";
    const result = await launchExternalBrowser(rawUrl);
    const commandResult = {
      id: "browser.open",
      title: "Open External Browser",
      ok: result.ok,
      output: result.message,
      code: result.ok ? 0 : 1,
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
    };
    broadcast({ type: "command_result", data: commandResult });
    sendJson(res, {
      ...result,
      normalizedUrl: normalizeBrowserUrl(rawUrl),
      embeddableUrl: toEmbeddableUrl(rawUrl),
    }, result.ok ? 200 : 400);
    return;
  }

  sendText(res, "Not found", 404);
}

const server = createServer((req, res) => {
  route(req, res).catch((err) => {
    console.error("[server] route error", err);
    sendJson(res, { error: String(err) }, 500);
  });
});

const wss = new WebSocketServer({ noServer: true });

server.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  if (url.pathname !== "/ws") {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit("connection", ws, req);
  });
});

wss.on("connection", (ws) => {
  clients.add(ws);
  ws.on("close", () => clients.delete(ws));
});

server.listen(PORT, () => {
  console.log(`[ТОВАРИЩ ЦЕНТР] Server running on http://localhost:${PORT}`);
});

setUpdateCallback((summary) => {
  broadcast({ type: "narrator", data: summary });
});

setAgentBroadcaster((type, data) => {
  broadcast({ type, data } as WsMessage);
});

if (process.env.NARRATOR_DISABLED === "1") {
  console.log("[narrator] Disabled by NARRATOR_DISABLED=1");
} else {
  startNarrator();
}
