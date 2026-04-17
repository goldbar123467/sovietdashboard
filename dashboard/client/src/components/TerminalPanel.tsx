import { useEffect, useRef, useState } from "react";
import { Terminal } from "xterm";
import { FitAddon } from "@xterm/addon-fit";
import "xterm/css/xterm.css";
import hammerSickleImg from "../assets/hammer-sickle.png";
import redSonLogo from "../assets/red-son-logo.png";
import { useWebSocketContext } from "../hooks/useWebSocketContext";

type AgentStatusValue = "active" | "waiting" | "idle";

interface AgentInfo {
  name: string;
  model: string;
  role: string;
  status: AgentStatusValue;
  worktree: string;
  tokens: number;
  tool_calls: number;
  active_since?: string;
}

interface ChatFrame {
  from: string;
  to: string;
  body: string;
  timestamp: string;
}

interface EventFrame {
  session_id: string;
  agent_id?: string;
  hook_event: string;
  tool_name?: string;
  timestamp: string;
  duration_ms?: number;
  error?: string;
}

const dotClass: Record<AgentStatusValue, string> = {
  active: "dot-active",
  waiting: "dot-waiting",
  idle: "dot-idle",
};

const ROLE_ID: Record<string, string> = {
  coordinator: "queen",
  coder: "coder",
  tester: "tester",
  reviewer: "reviewer",
};

const ROLE_LABEL: Record<string, string> = {
  queen: "Queen",
  coder: "Coder",
  tester: "Tester",
  reviewer: "Reviewer",
};

const BUFFER_LIMIT = 500;

function now(): string {
  const d = new Date();
  return d.toLocaleTimeString("en-US", { hour12: false });
}

const BANNER = [
  "\x1b[1;31m========================================\x1b[0m",
  "\x1b[1;33m  ТОВАРИЩ ЦЕНТР — Terminal Interface\x1b[0m",
  "\x1b[1;31m========================================\x1b[0m",
  "",
  "\x1b[36m[SYSTEM]\x1b[0m Backend: Codex CLI (ChatGPT auth)",
  "\x1b[36m[SYSTEM]\x1b[0m Awaiting agent traffic. Messages will appear here as they arrive.",
  "",
];

export function TerminalPanel() {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);

  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [activeTab, setActiveTab] = useState<string>("queen");

  // Per-agent ring buffer of raw lines (each already ANSI-encoded).
  const buffersRef = useRef<Map<string, string[]>>(new Map());
  const prevStatusRef = useRef<Map<string, AgentStatusValue>>(new Map());
  const activeTabRef = useRef<string>("queen");

  const ws = useWebSocketContext();

  // Keep ref in sync so async WS handlers see current tab.
  useEffect(() => { activeTabRef.current = activeTab; }, [activeTab]);

  function push(agentId: string, line: string) {
    const buf = buffersRef.current.get(agentId) ?? [];
    buf.push(line);
    if (buf.length > BUFFER_LIMIT) buf.splice(0, buf.length - BUFFER_LIMIT);
    buffersRef.current.set(agentId, buf);
    if (activeTabRef.current === agentId && termRef.current) {
      termRef.current.writeln(line);
    }
  }

  function replayActive() {
    const term = termRef.current;
    if (!term) return;
    term.clear();
    for (const l of BANNER) term.writeln(l);
    const buf = buffersRef.current.get(activeTabRef.current) ?? [];
    if (buf.length === 0) {
      term.writeln(`\x1b[2m[no activity yet on ${activeTabRef.current}]\x1b[0m`);
    } else {
      for (const l of buf) term.writeln(l);
    }
  }

  // Boot the xterm once.
  useEffect(() => {
    if (!containerRef.current) return;

    const term = new Terminal({
      theme: {
        background: "#030303",
        foreground: "#F5ECD0",
        cursor: "#c41e1e",
        cursorAccent: "#030303",
        selectionBackground: "rgba(196, 30, 30, 0.3)",
      },
      cursorBlink: false,
      fontFamily: "'Courier New', monospace",
      fontSize: 12,
      lineHeight: 1.3,
      disableStdin: true,
      scrollback: 2000,
      convertEol: true,
    });

    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(containerRef.current);
    fit.fit();

    termRef.current = term;
    fitRef.current = fit;

    for (const l of BANNER) term.writeln(l);

    const ro = new ResizeObserver(() => {
      try { fit.fit(); } catch { /* ignore */ }
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      term.dispose();
    };
  }, []);

  // Fetch initial agent list.
  useEffect(() => {
    fetch("/api/agents").then((r) => r.json()).then((list: AgentInfo[]) => {
      setAgents(list);
      for (const a of list) {
        const id = ROLE_ID[a.role] ?? a.role;
        prevStatusRef.current.set(id, a.status);
      }
    }).catch(() => {});
  }, []);

  // Subscribe to live WS streams.
  useEffect(() => {
    const offStatus = ws.on("agent_status", (list: AgentInfo[]) => {
      setAgents(list);
      for (const a of list) {
        const id = ROLE_ID[a.role] ?? a.role;
        const prev = prevStatusRef.current.get(id);
        if (prev && prev !== a.status) {
          const color =
            a.status === "active" ? "\x1b[32m" :
            a.status === "waiting" ? "\x1b[33m" :
            "\x1b[34m";
          push(id, `${color}[${now()}] status: ${prev} → ${a.status}\x1b[0m`);
        }
        prevStatusRef.current.set(id, a.status);
      }
    });

    const offChat = ws.on("chat", (m: ChatFrame) => {
      if (m.from === "operator") {
        const id = m.to;
        push(id, `\x1b[1;36m[${now()}] > ${m.body}\x1b[0m`);
      } else {
        const id = m.from;
        const text = m.body.split("\n");
        push(id, `\x1b[1;31m[${now()}] ${ROLE_LABEL[id] ?? id}:\x1b[0m`);
        for (const line of text) push(id, `  ${line}`);
        push(id, "");
      }
    });

    const offEvent = ws.on("event", (e: EventFrame) => {
      if (!e.agent_id) return;
      const id = e.agent_id;
      const dur = e.duration_ms != null ? ` (${(e.duration_ms / 1000).toFixed(1)}s)` : "";
      const tag = e.error ? "\x1b[31m[error]" : "\x1b[2m[event]";
      push(id, `${tag} ${e.hook_event} ${e.tool_name ?? ""}${dur}${e.error ? " " + e.error : ""}\x1b[0m`);
    });

    return () => { offStatus(); offChat(); offEvent(); };
  }, [ws]);

  // Replay buffer when active tab changes.
  useEffect(() => {
    replayActive();
    fitRef.current?.fit();
  }, [activeTab]);

  // Build visible tabs from live agents (stable order).
  const tabOrder = ["queen", "coder", "tester", "reviewer"];
  const tabs = tabOrder.map((id) => {
    const agent = agents.find((a) => (ROLE_ID[a.role] ?? a.role) === id);
    return {
      id,
      name: ROLE_LABEL[id] ?? id,
      status: (agent?.status ?? "idle") as AgentStatusValue,
    };
  });

  return (
    <div className="relative flex flex-col border-2 border-soviet-red bg-soviet-panel overflow-hidden">
      <div className="relative flex items-center h-8 bg-soviet-red shrink-0">
        <div className="stripe-bg absolute inset-0 pointer-events-none" />
        <img src={hammerSickleImg} alt="" className="relative z-10 w-4 h-4 ml-2 opacity-80" />
        <span className="relative z-10 ml-2 text-xs font-['Russo_One'] text-soviet-cream tracking-wider">
          Товарищ Terminal
        </span>
      </div>

      <div className="flex items-center h-7 bg-soviet-panel border-b border-soviet-red/40 shrink-0 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1 px-2.5 h-full text-[11px] font-['Oswald'] uppercase tracking-wider
              border-r border-soviet-red/20 transition-colors
              ${activeTab === tab.id ? "bg-soviet-red/20 text-soviet-cream" : "text-soviet-cream/50 hover:text-soviet-cream/80"}`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${dotClass[tab.status]}`} />
            {tab.name}
          </button>
        ))}
      </div>

      <div className="relative flex-1 min-h-0">
        <div ref={containerRef} className="absolute inset-0 p-1" />
        <img
          src={redSonLogo}
          alt=""
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[45%] opacity-[0.04] pointer-events-none select-none z-10"
        />
      </div>
    </div>
  );
}
