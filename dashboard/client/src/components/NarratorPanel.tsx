import { useEffect, useState } from "react";
import hammerSickleImg from "../assets/hammer-sickle.png";
import { useWebSocketContext } from "../hooks/useWebSocketContext";

export function NarratorPanel() {
  const [summary, setSummary] = useState("Awaiting mission data. Agents standing by for orders.");
  const [updatedAt, setUpdatedAt] = useState<string>("--:--:--");
  const ws = useWebSocketContext();

  useEffect(() => {
    fetch("/api/narrator").then((r) => r.json()).then((d) => {
      if (d?.summary) setSummary(d.summary);
    }).catch(() => {});
    return ws.on("narrator", (text: string) => {
      setSummary(text);
      setUpdatedAt(new Date().toLocaleTimeString("en-US", { hour12: false }));
    });
  }, [ws]);

  return (
    <div className="relative border-2 border-soviet-red bg-soviet-panel panel-strip overflow-hidden">
      <div className="px-3 pt-4 pb-2">
        <div className="flex items-center gap-2">
          <img src={hammerSickleImg} alt="" className="w-4 h-4 opacity-60" />
          <h3 className="text-xs font-['Russo_One'] text-soviet-red-bright glow-red uppercase tracking-wider">
            Mission Briefing
          </h3>
        </div>

        <p className="mt-2 text-[11px] font-['Oswald'] text-soviet-cream/70 leading-relaxed">
          {summary}
        </p>

        <div className="mt-3 flex items-center gap-2 text-[9px] font-mono text-soviet-cream/40">
          <span className="w-2 h-2 rounded-full dot-active dot-pulse" />
          <span className="font-['Oswald'] uppercase tracking-wider">
            Codex CLI &middot; 60s poll
          </span>
          <span className="ml-auto">{updatedAt}</span>
        </div>
      </div>
    </div>
  );
}
