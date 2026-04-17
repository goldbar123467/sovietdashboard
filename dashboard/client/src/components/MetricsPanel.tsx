import { useCallback, useEffect, useState } from "react";
import {
  AreaChart,
  Area,
  ResponsiveContainer,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { useWebSocketContext } from "../hooks/useWebSocketContext";

const timeTabs = [
  { label: "5 MIN", value: "5m" },
  { label: "SESSION", value: "session" },
  { label: "7 DAY", value: "7d" },
  { label: "ALL", value: "all" },
] as const;

type Window = (typeof timeTabs)[number]["value"];

interface MetricsSeriesPoint {
  t: number;
  ts: string;
  tools: number;
  errors: number;
  avg_duration_ms: number;
}

interface MetricsSnapshot {
  window: Window;
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

function fmtShort(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(n);
}

function fmtDuration(ms: number): string {
  if (!ms) return "--";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function UsageBar({ label, pct, color }: { label: string; pct: number; color: string }) {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] font-['Oswald'] text-soviet-cream/60 w-14 shrink-0 uppercase">
        {label}
      </span>
      <div className="flex-1 h-3 bg-soviet-bg border border-soviet-red/30 relative">
        {[20, 40, 60, 80].map((t) => (
          <div
            key={t}
            className="absolute top-0 bottom-0 w-px bg-soviet-cream/10"
            style={{ left: `${t}%` }}
          />
        ))}
        <div className="h-full" style={{ width: `${clamped}%`, background: color }} />
      </div>
      <span className="text-[10px] font-mono text-soviet-cream w-8 text-right">{Math.round(clamped)}%</span>
    </div>
  );
}

export function MetricsPanel() {
  const [window, setWindow] = useState<Window>("session");
  const [data, setData] = useState<MetricsSnapshot | null>(null);
  const ws = useWebSocketContext();

  const refresh = useCallback((w: Window) => {
    fetch(`/api/metrics?window=${w}`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => {});
  }, []);

  useEffect(() => {
    refresh(window);
  }, [window, refresh]);

  useEffect(() => {
    const offStatus = ws.on("agent_status", () => refresh(window));
    const offEvent = ws.on("event", () => refresh(window));
    return () => { offStatus(); offEvent(); };
  }, [ws, window, refresh]);

  const totals = data?.totals;
  const series = data?.series ?? [];
  const busyPct = totals ? (totals.active_agents / 4) * 100 : 0;
  const errorPct = totals && totals.events > 0 ? (totals.errors / totals.events) * 100 : 0;

  const metricCells = [
    { label: "Tokens", value: totals ? fmtShort(totals.tokens) : "--" },
    { label: "Tool Calls", value: totals ? String(totals.tool_calls) : "--" },
    { label: "Events", value: totals ? String(totals.events) : "--" },
    { label: "Queued", value: totals ? String(totals.queued) : "--" },
  ];

  const bottomCells = [
    { label: "Avg Resp", value: totals ? fmtDuration(totals.avg_duration_ms) : "--" },
    { label: "Errors", value: totals ? String(totals.errors) : "--" },
    { label: "Active", value: totals ? `${totals.active_agents}/4` : "--" },
    { label: "Window", value: timeTabs.find((t) => t.value === window)?.label ?? "" },
  ];

  return (
    <div className="relative border-2 border-soviet-red bg-soviet-panel panel-strip overflow-hidden">
      <div className="px-3 pt-4 pb-2 space-y-2">
        <UsageBar
          label="Busy"
          pct={busyPct}
          color="linear-gradient(90deg, #c41e1e, #e52222)"
        />
        <UsageBar
          label="Err Rate"
          pct={errorPct}
          color="linear-gradient(90deg, #D4A843, #e8c462)"
        />

        <div className="grid grid-cols-4 gap-1 mt-2">
          {metricCells.map((m) => (
            <div
              key={m.label}
              className="border border-soviet-red/30 bg-soviet-bg/50 px-1 py-1 text-center"
            >
              <div className="text-[9px] font-['Oswald'] text-soviet-cream/40 uppercase">
                {m.label}
              </div>
              <div className="text-sm font-mono text-soviet-cream font-bold">{m.value}</div>
            </div>
          ))}
        </div>

        <div className="flex gap-0.5 mt-1">
          {timeTabs.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setWindow(tab.value)}
              className={`flex-1 text-[9px] font-['Oswald'] uppercase tracking-wider py-1 transition-all
                ${
                  window === tab.value
                    ? "bg-soviet-red text-soviet-cream shadow-[0_0_8px_rgba(229,34,34,0.4)]"
                    : "bg-soviet-bg text-soviet-cream/40 hover:text-soviet-cream/70"
                }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="h-[90px] mt-1">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={series} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(196,30,30,0.15)" />
              <Tooltip
                contentStyle={{
                  background: "#0c0608",
                  border: "1px solid #c41e1e",
                  fontSize: 10,
                  color: "#F5ECD0",
                }}
                labelFormatter={(v) => `bucket ${v}`}
              />
              <Area
                type="monotone"
                dataKey="tools"
                stroke="#c41e1e"
                fill="rgba(196,30,30,0.2)"
                strokeWidth={1.5}
                isAnimationActive={false}
              />
              <Area
                type="monotone"
                dataKey="errors"
                stroke="#D4A843"
                fill="transparent"
                strokeWidth={1}
                strokeDasharray="4 2"
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="flex justify-center gap-3 text-[9px] font-['Oswald'] uppercase">
          <span className="flex items-center gap-1">
            <span className="w-2 h-0.5 bg-soviet-red inline-block" /> Tools
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-0.5 bg-soviet-gold inline-block" style={{ borderTop: "1px dashed #D4A843" }} /> Errors
          </span>
        </div>

        <div className="grid grid-cols-4 gap-1 text-[9px] text-center font-mono text-soviet-cream/60">
          {bottomCells.map((c) => (
            <div key={c.label}>
              <span className="text-soviet-cream/30 font-['Oswald'] uppercase block">{c.label}</span>
              {c.value}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
