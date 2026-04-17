import db from "./db.js";
import { listAgents, queuedDepth } from "./agents.js";

export type MetricsWindow = "5m" | "session" | "7d" | "all";

export interface MetricsSeriesPoint {
  t: number; // bucket index
  ts: string; // ISO timestamp of bucket end
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

const selectTotals = db.prepare(`
  SELECT COUNT(*) AS events,
         SUM(CASE WHEN error IS NOT NULL THEN 1 ELSE 0 END) AS errors,
         AVG(CASE WHEN duration_ms IS NOT NULL THEN duration_ms END) AS avg_duration_ms
    FROM events WHERE timestamp >= ?
`);

const selectBucketed = db.prepare(`
  SELECT timestamp, duration_ms, error FROM events WHERE timestamp >= ? ORDER BY timestamp ASC
`);

export function snapshot(window: MetricsWindow): MetricsSnapshot {
  const sinceIso = windowSinceIso(window);
  const sinceMs = new Date(sinceIso).getTime();
  const nowMs = Date.now();
  const spanMs = Math.max(1, nowMs - sinceMs);
  const bucketMs = spanMs / BUCKETS;

  const totalsRow = selectTotals.get(sinceIso) as {
    events: number; errors: number; avg_duration_ms: number | null;
  };

  const rows = selectBucketed.all(sinceIso) as Array<{
    timestamp: string; duration_ms: number | null; error: string | null;
  }>;

  const series: MetricsSeriesPoint[] = Array.from({ length: BUCKETS }, (_, i) => ({
    t: i,
    ts: new Date(sinceMs + (i + 1) * bucketMs).toISOString(),
    tools: 0,
    errors: 0,
    avg_duration_ms: 0,
  }));
  const durTotals = Array.from({ length: BUCKETS }, () => ({ sum: 0, count: 0 }));

  for (const row of rows) {
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

  const agents = listAgents();
  const tokens = agents.reduce((s, a) => s + (a.tokens ?? 0), 0);
  const toolCalls = agents.reduce((s, a) => s + (a.tool_calls ?? 0), 0);
  const activeAgents = agents.filter((a) => a.status === "active").length;

  return {
    window,
    since: sinceIso,
    totals: {
      tokens,
      tool_calls: toolCalls,
      events: totalsRow.events ?? 0,
      errors: totalsRow.errors ?? 0,
      avg_duration_ms: Math.round(totalsRow.avg_duration_ms ?? 0),
      active_agents: activeAgents,
      queued: queuedDepth(),
    },
    series,
  };
}
