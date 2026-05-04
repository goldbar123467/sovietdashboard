import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { addEvent } from "./db.js";
import type { AgentStatus, ChatMessage } from "./types.js";

export interface AgentDef {
  id: string;
  name: string;
  role: string;
  model: string;
  systemPrompt: string;
}

const ROLE_PROMPTS: Record<string, string> = {
  queen:
    "You are the Queen Orchestrator of a small Soviet-themed agent collective. " +
    "You receive operator messages and reply with direct, terse mission guidance. " +
    "Keep replies to 2-4 sentences unless asked for detail. Use present tense. " +
    "Reply with plain text only — no markdown, no preamble.",
  coder:
    "You are the Code Worker. You write concise, production-grade code. " +
    "When asked to implement something, reply with just the code and a 1-line rationale. No markdown fences unless needed.",
  tester:
    "You are the Test Worker. You design minimal, high-signal tests. " +
    "Reply with test code or a short test plan. Keep it tight.",
  reviewer:
    "You are the Reviewer. You audit code and propose specific improvements. " +
    "Reply with a short bulleted list of issues and fixes. Plain text, no markdown fences.",
};

export const AGENTS: AgentDef[] = [
  { id: "queen", name: "Queen Orchestrator", role: "coordinator", model: "codex", systemPrompt: ROLE_PROMPTS.queen },
  { id: "coder", name: "Code Worker", role: "coder", model: "codex", systemPrompt: ROLE_PROMPTS.coder },
  { id: "tester", name: "Test Worker", role: "tester", model: "codex", systemPrompt: ROLE_PROMPTS.tester },
  { id: "reviewer", name: "Reviewer", role: "reviewer", model: "codex", systemPrompt: ROLE_PROMPTS.reviewer },
];

interface AgentRuntime {
  def: AgentDef;
  status: "active" | "waiting" | "idle";
  tokens: number;
  toolCalls: number;
  activeSince?: string;
  lastMessage?: string;
  queue: string[];
  running: boolean;
}

const runtimes = new Map<string, AgentRuntime>(
  AGENTS.map((a) => [a.id, { def: a, status: "idle", tokens: 0, toolCalls: 0, queue: [], running: false }]),
);

type Broadcaster = (type: "agent_status" | "chat", data: any) => void;
let broadcaster: Broadcaster | null = null;
export function setAgentBroadcaster(fn: Broadcaster) {
  broadcaster = fn;
}

export function listAgents(): AgentStatus[] {
  return [...runtimes.values()].map((r) => ({
    name: r.def.name,
    model: r.def.model,
    role: r.def.role,
    status: r.status,
    worktree: "main",
    tokens: r.tokens,
    tool_calls: r.toolCalls,
    active_since: r.activeSince,
  }));
}

function emitStatus() {
  broadcaster?.("agent_status", listAgents());
}

function emitChat(msg: ChatMessage) {
  broadcaster?.("chat", msg);
}

export function getAgent(id: string): AgentDef | undefined {
  return runtimes.get(id)?.def;
}

export function queuedDepth(): number {
  let n = 0;
  for (const r of runtimes.values()) n += r.queue.length;
  return n;
}

export async function dispatch(agentId: string, userBody: string): Promise<{ queued: boolean }> {
  const rt = runtimes.get(agentId);
  if (!rt) return { queued: false };
  rt.queue.push(userBody);
  if (!rt.running) drive(rt);
  return { queued: true };
}

async function drive(rt: AgentRuntime) {
  rt.running = true;
  try {
    while (rt.queue.length) {
      const msg = rt.queue.shift()!;
      rt.status = "active";
      rt.activeSince = new Date().toISOString();
      emitStatus();
      const started = Date.now();
      const reply = await runCodex(rt.def, msg);
      const elapsedMs = Date.now() - started;
      const elapsedS = Math.max(1, Math.round(elapsedMs / 1000));
      rt.toolCalls += 1;
      rt.tokens += Math.round((msg.length + (reply?.length ?? 0)) / 4); // rough
      rt.lastMessage = reply ?? "(codex returned no output)";
      rt.status = rt.queue.length ? "waiting" : "idle";
      rt.activeSince = undefined;
      addEvent({
        session_id: `agent-${rt.def.id}`,
        agent_id: rt.def.id,
        hook_event: "AgentRun",
        tool_name: "codex_exec",
        timestamp: new Date().toISOString(),
        duration_ms: elapsedMs,
        error: reply ? undefined : "codex_no_output",
      });
      emitStatus();
      emitChat({
        from: rt.def.id,
        to: "operator",
        body: rt.lastMessage + `\n\n[elapsed ${elapsedS}s]`,
        timestamp: new Date().toISOString(),
      });
    }
  } finally {
    rt.running = false;
    rt.status = "idle";
    emitStatus();
  }
}

async function runCodex(def: AgentDef, userMessage: string): Promise<string | null> {
  const workdir = mkdtempSync(join(tmpdir(), `agent-${def.id}-`));
  const outFile = join(workdir, "last.txt");

  const prompt = `${def.systemPrompt}\n\nOperator message:\n${userMessage}\n\nRespond now.`;

  const proc = spawn("codex", [
    "exec",
    "--ephemeral",
    "--skip-git-repo-check",
    "--sandbox", "read-only",
    "--cd", workdir,
    "--output-last-message", outFile,
    "--color", "never",
    prompt,
  ], {
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env },
  });

  const timeout = setTimeout(() => { try { proc.kill(); } catch {} }, 120_000);
  try {
    const code = await new Promise<number | null>((resolve, reject) => {
      proc.on("error", reject);
      proc.on("close", resolve);
    });
    if (code !== 0) {
      const err = await streamText(proc.stderr);
      console.error(`[agent:${def.id}] codex exit ${code}: ${err.slice(0, 300)}`);
      return null;
    }
    return readFileSync(outFile, "utf8").trim() || null;
  } catch (err) {
    console.error(`[agent:${def.id}] spawn error:`, err);
    return null;
  } finally {
    clearTimeout(timeout);
    try { rmSync(workdir, { recursive: true, force: true }); } catch {}
  }
}

async function streamText(stream: NodeJS.ReadableStream | null): Promise<string> {
  if (!stream) return "";
  let text = "";
  for await (const chunk of stream) {
    text += chunk.toString();
  }
  return text;
}
