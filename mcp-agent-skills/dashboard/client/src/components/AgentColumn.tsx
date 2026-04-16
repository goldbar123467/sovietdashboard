import { AgentCard } from "./AgentCard";

const agents = [
  {
    name: "Queen Orchestrator",
    status: "active" as const,
    statusText: "Orchestrating",
    worktree: "main",
    model: "opus",
    role: "coordinator",
    tokens: 12480,
    toolCalls: 34,
    activeTime: "12:34",
  },
  {
    name: "Code Worker",
    status: "idle" as const,
    statusText: "Standing by",
    worktree: "feat/ui",
    model: "sonnet",
    role: "coder",
    tokens: 8200,
    toolCalls: 18,
    activeTime: "08:12",
  },
  {
    name: "Test Worker",
    status: "idle" as const,
    statusText: "Standing by",
    worktree: "feat/tests",
    model: "sonnet",
    role: "tester",
    tokens: 4100,
    toolCalls: 9,
    activeTime: "04:55",
  },
  {
    name: "Reviewer",
    status: "idle" as const,
    statusText: "Standing by",
    worktree: "main",
    model: "haiku",
    role: "reviewer",
    tokens: 1500,
    toolCalls: 3,
    activeTime: "01:20",
  },
];

export function AgentColumn() {
  return (
    <div className="flex flex-col gap-1 overflow-y-auto">
      {agents.map((a) => (
        <AgentCard key={a.name} {...a} />
      ))}
    </div>
  );
}
