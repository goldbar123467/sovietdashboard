import { useEffect, useState } from "react";
import { AgentCard } from "./AgentCard";
import { useWebSocketContext } from "../hooks/useWebSocketContext";

type AgentStatus = "active" | "waiting" | "idle";

interface AgentInfo {
  name: string;
  model: string;
  role: string;
  status: AgentStatus;
  worktree: string;
  tokens: number;
  tool_calls: number;
  active_since?: string;
}

const STATUS_TEXT: Record<AgentStatus, string> = {
  active: "Working",
  waiting: "Queued",
  idle: "Standing by",
};

function elapsed(since?: string): string {
  if (!since) return "--:--";
  const secs = Math.max(0, Math.floor((Date.now() - new Date(since).getTime()) / 1000));
  const mm = String(Math.floor(secs / 60)).padStart(2, "0");
  const ss = String(secs % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

export function AgentColumn() {
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [_, force] = useState(0);
  const ws = useWebSocketContext();

  useEffect(() => {
    fetch("/api/agents").then((r) => r.json()).then(setAgents).catch(() => {});
    const off = ws.on("agent_status", (data: AgentInfo[]) => setAgents(data));
    const t = setInterval(() => force((x) => x + 1), 1000);
    return () => { off(); clearInterval(t); };
  }, [ws]);

  return (
    <div className="flex flex-col gap-1 overflow-y-auto scroll-soviet min-h-0">
      {agents.map((a) => (
        <AgentCard
          key={a.name}
          name={a.name}
          status={a.status}
          statusText={STATUS_TEXT[a.status]}
          worktree={a.worktree}
          model={a.model}
          role={a.role}
          tokens={a.tokens}
          toolCalls={a.tool_calls}
          activeTime={elapsed(a.active_since)}
        />
      ))}
    </div>
  );
}
