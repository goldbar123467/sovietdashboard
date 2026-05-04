import { eventsSince } from "./db.js";
import { getCodexDashboardState } from "./codexSession.js";

export type MetricsWindow = "5m" | "session" | "7d" | "all";

export interface MetricsSeriesPoint {
  t: number;
  ts: string;
  tools: number;
  errors: number;
  avg_duration_ms: number;
}

export interface MetricsSnapshot {
  window: MetricsWindow;
  since: string;
  totals: {
    tokens: number;
    tool_calls: number;
    events: number;
    errors: number;
    avg_duration_ms: number;
    active_agents: number;
    queued: number;
    turns: number;
    cached_tokens: number;
    reasoning_tokens: number;
    failures: number;
  };
  series: MetricsSeriesPoint[];
}

const BUCKETS = 10;
const SESSION_START_ISO = new Date().toISOString();

function windowSinceIso(window: MetricsWindow): string {
  const now = Date.now();
  switch (window) {
    case "5m": return new Date(now - 5 * 60_000).toISOString();
    case "7d": return new Date(now - 7 * 24 * 60 * 60_000).toISOString();
    case "all": return "1970-01-01T00:00:00.000Z";
    case "session": return SESSION_START_ISO;
  }
}

export function snapshot(window: MetricsWindow): MetricsSnapshot {
  const sinceIso = windowSinceIso(window);
  const sinceMs = new Date(sinceIso).getTime();
  const nowMs = Date.now();
  const spanMs = Math.max(1, nowMs - sinceMs);
  const bucketMs = spanMs / BUCKETS;
  const rows = eventsSince(sinceIso);

  const series: MetricsSeriesPoint[] = Array.from({ length: BUCKETS }, (_, i) => ({
    t: i,
    ts: new Date(sinceMs + (i + 1) * bucketMs).toISOString(),
    tools: 0,
    errors: 0,
    avg_duration_ms: 0,
  }));
  const durTotals = Array.from({ length: BUCKETS }, () => ({ sum: 0, count: 0 }));

  let errors = 0;
  let durationSum = 0;
  let durationCount = 0;

  for (const row of rows) {
    if (row.error) errors += 1;
    if (row.duration_ms != null) {
      durationSum += row.duration_ms;
      durationCount += 1;
    }

    const rowMs = new Date(row.timestamp).getTime();
    let idx = Math.floor((rowMs - sinceMs) / bucketMs);
    if (idx < 0) idx = 0;
    if (idx >= BUCKETS) idx = BUCKETS - 1;
    series[idx].tools += 1;
    if (row.error) series[idx].errors += 1;
    if (row.duration_ms != null) {
      durTotals[idx].sum += row.duration_ms;
      durTotals[idx].count += 1;
    }
  }

  for (let i = 0; i < BUCKETS; i++) {
    if (durTotals[i].count) {
      series[i].avg_duration_ms = Math.round(durTotals[i].sum / durTotals[i].count);
    }
  }

  const codex = getCodexDashboardState();

  return {
    window,
    since: sinceIso,
    totals: {
      tokens: codex.totals.totalTokens,
      tool_calls: codex.totals.toolCalls,
      events: rows.length,
      errors,
      avg_duration_ms: Math.round(durationCount ? durationSum / durationCount : 0),
      active_agents: codex.status === "running" ? 1 : 0,
      queued: 0,
      turns: codex.totals.turns,
      cached_tokens: codex.totals.cachedInputTokens,
      reasoning_tokens: codex.totals.reasoningOutputTokens,
      failures: codex.totals.failures,
    },
    series,
  };
}
