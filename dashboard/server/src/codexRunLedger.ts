import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { CodexRunRecord, CodexUsage } from "./codexSession.js";

export type CodexStatsWindow = "1h" | "1d" | "7d" | "lifetime";

export interface CodexStatsTotals {
  turns: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningOutputTokens: number;
  totalTokens: number;
  toolCalls: number;
  failures: number;
  avgDurationMs: number;
}

export type CodexStatsWindows = Record<CodexStatsWindow, CodexStatsTotals>;

export interface LedgerCodexRun {
  id: string;
  ok: boolean;
  threadId?: string;
  promptPreview?: string;
  replyPreview?: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  usage: CodexUsage;
  toolCalls: number;
  error?: string;
}

interface LedgerFile {
  version: 1;
  runs: LedgerCodexRun[];
}

const MAX_LEDGER_RUNS = Number(process.env.CODEX_RUN_LEDGER_MAX ?? "5000");
const DEFAULT_LEDGER_PATH = resolve(process.env.CODEX_RUN_LEDGER_PATH || "codex-runs.json");

export function createEmptyCodexStatsTotals(): CodexStatsTotals {
  return {
    turns: 0,
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    reasoningOutputTokens: 0,
    totalTokens: 0,
    toolCalls: 0,
    failures: 0,
    avgDurationMs: 0,
  };
}

export function aggregateCodexRunWindows(
  runs: LedgerCodexRun[],
  now = new Date(),
): CodexStatsWindows {
  const nowMs = now.getTime();
  return {
    "1h": aggregateRuns(runs.filter((run) => isInsideWindow(run, nowMs, 60 * 60 * 1000))),
    "1d": aggregateRuns(runs.filter((run) => isInsideWindow(run, nowMs, 24 * 60 * 60 * 1000))),
    "7d": aggregateRuns(runs.filter((run) => isInsideWindow(run, nowMs, 7 * 24 * 60 * 60 * 1000))),
    lifetime: aggregateRuns(runs),
  };
}

export function toLedgerRun(run: CodexRunRecord): LedgerCodexRun {
  return {
    id: run.id,
    ok: run.ok,
    threadId: run.threadId,
    promptPreview: preview(run.prompt, 200),
    replyPreview: preview(run.reply, 240),
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    durationMs: run.durationMs,
    usage: { ...run.usage },
    toolCalls: run.toolCalls,
    error: run.error,
  };
}

export class JsonCodexRunLedger {
  private runs: LedgerCodexRun[];

  constructor(private readonly file = DEFAULT_LEDGER_PATH) {
    this.runs = this.load();
  }

  append(run: LedgerCodexRun): void {
    this.runs.push(run);
    if (this.runs.length > MAX_LEDGER_RUNS) {
      this.runs = this.runs.slice(-MAX_LEDGER_RUNS);
    }
    this.persist();
  }

  list(limit = MAX_LEDGER_RUNS): LedgerCodexRun[] {
    return this.runs.slice(-limit).reverse().map((run) => ({
      ...run,
      usage: { ...run.usage },
    }));
  }

  windows(now = new Date()): CodexStatsWindows {
    return aggregateCodexRunWindows(this.runs, now);
  }

  private load(): LedgerCodexRun[] {
    try {
      if (!existsSync(this.file)) return [];
      const parsed = JSON.parse(readFileSync(this.file, "utf8"));
      if (!parsed || !Array.isArray(parsed.runs)) return [];
      return parsed.runs.filter(isLedgerRun);
    } catch {
      return [];
    }
  }

  private persist(): void {
    mkdirSync(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    const data: LedgerFile = { version: 1, runs: this.runs };
    writeFileSync(tmp, JSON.stringify(data, null, 2));
    renameSync(tmp, this.file);
  }
}

export const codexRunLedger = new JsonCodexRunLedger();

function aggregateRuns(runs: LedgerCodexRun[]): CodexStatsTotals {
  const totals = createEmptyCodexStatsTotals();
  let durationTotal = 0;
  for (const run of runs) {
    totals.turns += 1;
    totals.inputTokens += run.usage.inputTokens;
    totals.cachedInputTokens += run.usage.cachedInputTokens;
    totals.outputTokens += run.usage.outputTokens;
    totals.reasoningOutputTokens += run.usage.reasoningOutputTokens;
    totals.totalTokens += run.usage.totalTokens;
    totals.toolCalls += run.toolCalls;
    if (!run.ok) totals.failures += 1;
    durationTotal += run.durationMs;
  }
  totals.avgDurationMs = runs.length ? Math.round(durationTotal / runs.length) : 0;
  return totals;
}

function isInsideWindow(run: LedgerCodexRun, nowMs: number, windowMs: number): boolean {
  const finishedMs = Date.parse(run.finishedAt);
  return Number.isFinite(finishedMs) && finishedMs >= nowMs - windowMs && finishedMs <= nowMs;
}

function preview(value: string, max: number): string {
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

function isLedgerRun(value: unknown): value is LedgerCodexRun {
  if (!value || typeof value !== "object") return false;
  const run = value as LedgerCodexRun;
  return typeof run.id === "string"
    && typeof run.ok === "boolean"
    && typeof run.startedAt === "string"
    && typeof run.finishedAt === "string"
    && typeof run.durationMs === "number"
    && typeof run.toolCalls === "number"
    && Boolean(run.usage)
    && typeof run.usage.totalTokens === "number";
}
