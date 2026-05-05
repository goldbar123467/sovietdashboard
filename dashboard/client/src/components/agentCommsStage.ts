export const AGENT_COMMS_STAGE_COPY = {
  signal: "SPY ROUTER LISTENING",
  primary: "Command output will stream into this board.",
};

export type AgentCommsBackdropMode = "empty" | "active";

export function agentCommsBackdropMode(resultCount: number): AgentCommsBackdropMode {
  return resultCount > 0 ? "active" : "empty";
}
