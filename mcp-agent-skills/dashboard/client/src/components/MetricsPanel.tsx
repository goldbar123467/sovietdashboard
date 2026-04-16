import { useState } from "react";
import {
  AreaChart,
  Area,
  ResponsiveContainer,
  CartesianGrid,
  Tooltip,
} from "recharts";

const demoData = [
  { t: 1, tokens: 400, tools: 8, usage: 30 },
  { t: 2, tokens: 800, tools: 14, usage: 42 },
  { t: 3, tokens: 650, tools: 11, usage: 38 },
  { t: 4, tokens: 1200, tools: 22, usage: 55 },
  { t: 5, tokens: 900, tools: 18, usage: 48 },
  { t: 6, tokens: 1400, tools: 28, usage: 62 },
  { t: 7, tokens: 1100, tools: 20, usage: 58 },
  { t: 8, tokens: 1600, tools: 32, usage: 70 },
];

const timeTabs = ["5 MIN", "SESSION", "7 DAY", "ALL"] as const;

function UsageBar({ label, pct, color }: { label: string; pct: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] font-['Oswald'] text-soviet-cream/60 w-14 shrink-0 uppercase">
        {label}
      </span>
      <div className="flex-1 h-3 bg-soviet-bg border border-soviet-red/30 relative">
        {/* Tick marks at 20% intervals */}
        {[20, 40, 60, 80].map((t) => (
          <div
            key={t}
            className="absolute top-0 bottom-0 w-px bg-soviet-cream/10"
            style={{ left: `${t}%` }}
          />
        ))}
        <div
          className="h-full"
          style={{
            width: `${pct}%`,
            background: color,
          }}
        />
      </div>
      <span className="text-[10px] font-mono text-soviet-cream w-8 text-right">{pct}%</span>
    </div>
  );
}

export function MetricsPanel() {
  const [activeTime, setActiveTime] = useState<(typeof timeTabs)[number]>("SESSION");

  return (
    <div className="relative border-2 border-soviet-red bg-soviet-panel panel-strip overflow-hidden">
      <div className="px-3 pt-4 pb-2 space-y-2">
        {/* Usage bars */}
        <UsageBar
          label="5-Hr Use"
          pct={62}
          color="linear-gradient(90deg, #c41e1e, #e52222)"
        />
        <UsageBar
          label="Weekly"
          pct={34}
          color="linear-gradient(90deg, #D4A843, #e8c462)"
        />

        {/* 4-cell metric grid */}
        <div className="grid grid-cols-4 gap-1 mt-2">
          {[
            { label: "Tokens", value: "26.3K" },
            { label: "Tool Calls", value: "64" },
            { label: "Tests", value: "12" },
            { label: "Coverage", value: "78%" },
          ].map((m) => (
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

        {/* Time tab selector */}
        <div className="flex gap-0.5 mt-1">
          {timeTabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTime(tab)}
              className={`flex-1 text-[9px] font-['Oswald'] uppercase tracking-wider py-1 transition-all
                ${
                  activeTime === tab
                    ? "bg-soviet-red text-soviet-cream shadow-[0_0_8px_rgba(229,34,34,0.4)]"
                    : "bg-soviet-bg text-soviet-cream/40 hover:text-soviet-cream/70"
                }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Chart */}
        <div className="h-[90px] mt-1">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={demoData} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(196,30,30,0.15)" />
              <Tooltip
                contentStyle={{
                  background: "#0c0608",
                  border: "1px solid #c41e1e",
                  fontSize: 10,
                  color: "#F5ECD0",
                }}
              />
              <Area
                type="monotone"
                dataKey="tokens"
                stroke="#c41e1e"
                fill="rgba(196,30,30,0.2)"
                strokeWidth={1.5}
              />
              <Area
                type="monotone"
                dataKey="tools"
                stroke="#3A9B9B"
                fill="transparent"
                strokeWidth={1}
              />
              <Area
                type="monotone"
                dataKey="usage"
                stroke="#D4A843"
                fill="transparent"
                strokeWidth={1}
                strokeDasharray="4 2"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Legend */}
        <div className="flex justify-center gap-3 text-[9px] font-['Oswald'] uppercase">
          <span className="flex items-center gap-1">
            <span className="w-2 h-0.5 bg-soviet-red inline-block" /> Tokens
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-0.5 bg-soviet-teal inline-block" /> Tools
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-0.5 bg-soviet-gold inline-block" style={{ borderTop: "1px dashed #D4A843" }} /> Usage
          </span>
        </div>

        {/* Bottom stats */}
        <div className="grid grid-cols-4 gap-1 text-[9px] text-center font-mono text-soviet-cream/60">
          <div>
            <span className="text-soviet-cream/30 font-['Oswald'] uppercase block">Avg Resp</span>
            1.2s
          </div>
          <div>
            <span className="text-soviet-cream/30 font-['Oswald'] uppercase block">Errors</span>
            0
          </div>
          <div>
            <span className="text-soviet-cream/30 font-['Oswald'] uppercase block">Commits</span>
            3
          </div>
          <div>
            <span className="text-soviet-cream/30 font-['Oswald'] uppercase block">Diff</span>
            +142
          </div>
        </div>
      </div>
    </div>
  );
}
