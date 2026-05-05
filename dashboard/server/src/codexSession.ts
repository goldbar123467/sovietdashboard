import { spawn } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";

export interface CodexUsage {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningOutputTokens: number;
  totalTokens: number;
}

export interface CodexExecSummary {
  threadId?: string;
  usage: CodexUsage;
  toolCalls: number;
  eventCount: number;
}

export interface CodexRunRecord {
  id: string;
  ok: boolean;
  prompt: string;
  reply: string;
  threadId?: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  usage: CodexUsage;
  toolCalls: number;
  error?: string;
}

export interface CodexSessionSummary {
  id: string;
  timestamp: string;
  cwd?: string;
  originator?: string;
  cliVersion?: string;
  modelProvider?: string;
  file: string;
  updatedAt: string;
}

export interface CodexDashboardState {
  status: "idle" | "running";
  activeThreadId?: string;
  activeRun?: {
    id: string;
    startedAt: string;
    prompt: string;
  };
  runs: CodexRunRecord[];
  totals: {
    turns: number;
    inputTokens: number;
    cachedInputTokens: number;
    outputTokens: number;
    reasoningOutputTokens: number;
    totalTokens: number;
    toolCalls: number;
    failures: number;
    avgDurationMs: number;
  };
}

export interface CodexDashboardSnapshot extends CodexDashboardState {
  recentSessions: CodexSessionSummary[];
}

const EMPTY_USAGE: CodexUsage = {
  inputTokens: 0,
  cachedInputTokens: 0,
  outputTokens: 0,
  reasoningOutputTokens: 0,
  totalTokens: 0,
};

const MAX_RUNS = 30;
const DEFAULT_TIMEOUT_MS = Number(process.env.CODEX_DASHBOARD_TIMEOUT_MS ?? "600000");
const CODEX_SESSIONS_ROOT = process.env.CODEX_SESSIONS_ROOT || join(homedir(), ".codex", "sessions");
const DEFAULT_SANDBOX_MODE = "workspace-write";

let state = createEmptyCodexDashboardState();
let broadcaster: ((snapshot: CodexDashboardSnapshot) => void) | null = null;

export function createEmptyCodexDashboardState(): CodexDashboardState {
  return {
    status: "idle",
    runs: [],
    totals: {
      turns: 0,
      inputTokens: 0,
      cachedInputTokens: 0,
      outputTokens: 0,
      reasoningOutputTokens: 0,
      totalTokens: 0,
      toolCalls: 0,
      failures: 0,
      avgDurationMs: 0,
    },
  };
}

export function setCodexSessionBroadcaster(fn: (snapshot: CodexDashboardSnapshot) => void): void {
  broadcaster = fn;
}

export function getCodexDashboardState(): CodexDashboardSnapshot {
  return {
    ...state,
    activeRun: state.activeRun ? { ...state.activeRun } : undefined,
    runs: state.runs.map((run) => ({ ...run, usage: { ...run.usage } })),
    totals: { ...state.totals },
    recentSessions: listCodexSessionSummaries(),
  };
}

function emitState(): void {
  broadcaster?.(getCodexDashboardState());
}

export function extractCodexExecSummary(output: string): CodexExecSummary {
  let threadId: string | undefined;
  let usage = { ...EMPTY_USAGE };
  let toolCalls = 0;
  let eventCount = 0;

  for (const line of output.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{")) continue;
    let event: any;
    try {
      event = JSON.parse(trimmed);
    } catch {
      continue;
    }
    eventCount += 1;
    if (event.type === "thread.started" && typeof event.thread_id === "string") {
      threadId = event.thread_id;
    }
    if (event.type === "item.completed" && String(event.item?.type ?? "").includes("tool")) {
      toolCalls += 1;
    }
    if (event.type === "turn.completed" && event.usage) {
      usage = normalizeUsage(event.usage);
    }
  }

  return { threadId, usage, toolCalls, eventCount };
}

export function applyCodexRunToState(target: CodexDashboardState, run: CodexRunRecord): void {
  if (run.threadId) {
    target.activeThreadId = run.threadId;
  }
  target.runs = [run, ...target.runs].slice(0, MAX_RUNS);
  target.totals.turns += 1;
  target.totals.inputTokens += run.usage.inputTokens;
  target.totals.cachedInputTokens += run.usage.cachedInputTokens;
  target.totals.outputTokens += run.usage.outputTokens;
  target.totals.reasoningOutputTokens += run.usage.reasoningOutputTokens;
  target.totals.totalTokens += run.usage.totalTokens;
  target.totals.toolCalls += run.toolCalls;
  if (!run.ok) target.totals.failures += 1;
  const durationTotal = target.runs.reduce((sum, item) => sum + item.durationMs, 0);
  target.totals.avgDurationMs = Math.round(durationTotal / target.runs.length);
}

export function listCodexSessionSummaries(
  root = CODEX_SESSIONS_ROOT,
  limit = 12,
): CodexSessionSummary[] {
  if (!existsSync(root)) return [];
  return findSessionFiles(root)
    .map((file) => readSessionSummary(file))
    .filter((item): item is CodexSessionSummary => Boolean(item))
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    .slice(0, limit);
}

export async function submitCodexPrompt(prompt: string, repoRoot: string): Promise<CodexRunRecord> {
  const body = prompt.trim();
  if (!body) {
    throw new Error("Prompt is required");
  }

  const startedAt = new Date().toISOString();
  const runId = `codex-${Date.now().toString(36)}`;
  state.status = "running";
  state.activeRun = { id: runId, startedAt, prompt: body };
  emitState();

  const workdir = mkdtempSync(join(tmpdir(), "dashboard-codex-"));
  const outFile = join(workdir, "last.txt");
  const startMs = Date.now();
  let stdout = "";
  let stderr = "";
  let code: number | null = null;
  try {
    const workspaceRoot = resolveCodexWorkspaceRoot(repoRoot);
    const args = buildCodexArgs(body, workspaceRoot, outFile, state.activeThreadId);
    const result = await runCodexProcess(args);
    stdout = result.stdout;
    stderr = result.stderr;
    code = result.code;
  } finally {
    state.status = "idle";
    state.activeRun = undefined;
  }

  const summary = extractCodexExecSummary(stdout);
  let reply = "";
  try {
    reply = readFileSync(outFile, "utf8").trim();
  } catch {
    reply = "";
  }
  rmSync(workdir, { recursive: true, force: true });

  const durationMs = Date.now() - startMs;
  const fallbackUsage = estimateUsage(body, reply);
  const usage = summary.usage.totalTokens > 0 ? summary.usage : fallbackUsage;
  const ok = code === 0 && Boolean(reply);
  const run: CodexRunRecord = {
    id: runId,
    ok,
    prompt: body,
    reply: reply || stderr.trim() || stdout.trim() || `(exit ${code})`,
    threadId: summary.threadId ?? state.activeThreadId,
    startedAt,
    finishedAt: new Date().toISOString(),
    durationMs,
    usage,
    toolCalls: summary.toolCalls,
    ...(ok ? {} : { error: stderr.trim() || `codex exited ${code}` }),
  };

  applyCodexRunToState(state, run);
  emitState();
  return run;
}

export function resolveCodexWorkspaceRoot(repoRoot: string): string {
  if (process.env.CODEX_DASHBOARD_WORKSPACE_ROOT) {
    return resolve(process.env.CODEX_DASHBOARD_WORKSPACE_ROOT);
  }
  return dirname(resolve(repoRoot));
}

export function buildCodexArgs(prompt: string, workspaceRoot: string, outFile: string, threadId?: string): string[] {
  if (threadId) {
    return [
      "exec",
      "resume",
      "--skip-git-repo-check",
      "--output-last-message",
      outFile,
      "--json",
      threadId,
      prompt,
    ];
  }
  return [
    "exec",
    "--skip-git-repo-check",
    "--sandbox",
    process.env.CODEX_DASHBOARD_SANDBOX || DEFAULT_SANDBOX_MODE,
    "--cd",
    workspaceRoot,
    "--output-last-message",
    outFile,
    "--color",
    "never",
    "--json",
    prompt,
  ];
}

function runCodexProcess(args: string[]): Promise<{ stdout: string; stderr: string; code: number | null }> {
  return new Promise((resolve, reject) => {
    const child = spawn("codex", args, {
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
      detached: process.platform !== "win32",
    });
    let stdout = "";
    let stderr = "";
    let forceKillTimer: NodeJS.Timeout | undefined;
    const signalChild = (signal: NodeJS.Signals) => {
      if (!child.pid) return;
      try {
        if (process.platform === "win32") {
          child.kill(signal);
        } else {
          process.kill(-child.pid, signal);
        }
      } catch {
        try {
          child.kill(signal);
        } catch {}
      }
    };
    const timeout = setTimeout(() => {
      signalChild("SIGTERM");
      forceKillTimer = setTimeout(() => signalChild("SIGKILL"), 2_000);
    }, DEFAULT_TIMEOUT_MS);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
      stdout = stdout.slice(-120_000);
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
      stderr = stderr.slice(-40_000);
    });
    child.on("error", (err) => {
      clearTimeout(timeout);
      if (forceKillTimer) clearTimeout(forceKillTimer);
      reject(err);
    });
    child.on("close", (closeCode) => {
      clearTimeout(timeout);
      if (forceKillTimer) clearTimeout(forceKillTimer);
      resolve({ stdout, stderr, code: closeCode });
    });
  });
}

function normalizeUsage(raw: any): CodexUsage {
  const inputTokens = numberValue(raw.input_tokens);
  const cachedInputTokens = numberValue(raw.cached_input_tokens);
  const outputTokens = numberValue(raw.output_tokens);
  const reasoningOutputTokens = numberValue(raw.reasoning_output_tokens);
  return {
    inputTokens,
    cachedInputTokens,
    outputTokens,
    reasoningOutputTokens,
    totalTokens: inputTokens + outputTokens,
  };
}

function estimateUsage(prompt: string, reply: string): CodexUsage {
  const inputTokens = Math.max(1, Math.round(prompt.length / 4));
  const outputTokens = Math.max(0, Math.round(reply.length / 4));
  return {
    inputTokens,
    cachedInputTokens: 0,
    outputTokens,
    reasoningOutputTokens: 0,
    totalTokens: inputTokens + outputTokens,
  };
}

function numberValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function findSessionFiles(root: string): string[] {
  const out: string[] = [];
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop()!;
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      continue;
    }
    for (const entry of entries) {
      const path = join(dir, entry);
      let stat;
      try {
        stat = statSync(path);
      } catch {
        continue;
      }
      if (stat.isDirectory()) {
        stack.push(path);
      } else if (entry.endsWith(".jsonl")) {
        out.push(path);
      }
    }
  }
  return out;
}

function readSessionSummary(file: string): CodexSessionSummary | null {
  let stat;
  try {
    stat = statSync(file);
  } catch {
    return null;
  }
  const text = readFileSync(file, "utf8");
  for (const line of text.split(/\r?\n/, 50)) {
    if (!line.trim()) continue;
    let parsed: any;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }
    if (parsed.type !== "session_meta" || !parsed.payload) continue;
    const payload = parsed.payload;
    const id = typeof payload.id === "string" ? payload.id : sessionIdFromFilename(file);
    if (!id) return null;
    return {
      id,
      timestamp: typeof payload.timestamp === "string" ? payload.timestamp : stat.mtime.toISOString(),
      cwd: typeof payload.cwd === "string" ? payload.cwd : undefined,
      originator: typeof payload.originator === "string" ? payload.originator : undefined,
      cliVersion: typeof payload.cli_version === "string" ? payload.cli_version : undefined,
      modelProvider: typeof payload.model_provider === "string" ? payload.model_provider : undefined,
      file,
      updatedAt: stat.mtime.toISOString(),
    };
  }
  return null;
}

function sessionIdFromFilename(file: string): string | undefined {
  const match = basename(file).match(/([0-9a-f]{8}-[0-9a-f-]{18,})\.jsonl$/i);
  return match?.[1];
}
