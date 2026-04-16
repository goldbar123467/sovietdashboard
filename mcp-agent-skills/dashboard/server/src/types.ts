export interface HookEvent {
  session_id: string;
  agent_id?: string;
  hook_event: string;
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
