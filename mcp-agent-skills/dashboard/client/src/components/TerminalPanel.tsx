import { useEffect, useRef, useState } from "react";
import { Terminal } from "xterm";
import { FitAddon } from "@xterm/addon-fit";
import "xterm/css/xterm.css";
import hammerSickleImg from "../assets/hammer-sickle.png";
import redSonLogo from "../assets/red-son-logo.png";

interface TabInfo {
  id: string;
  name: string;
  status: "active" | "waiting" | "idle";
}

const defaultTabs: TabInfo[] = [
  { id: "queen", name: "Queen", status: "active" },
  { id: "coder", name: "Coder", status: "idle" },
  { id: "tester", name: "Tester", status: "idle" },
  { id: "reviewer", name: "Reviewer", status: "idle" },
];

const dotClass: Record<string, string> = {
  active: "dot-active",
  waiting: "dot-waiting",
  idle: "dot-idle",
};

export function TerminalPanel() {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const [tabs, setTabs] = useState<TabInfo[]>(defaultTabs);
  const [activeTab, setActiveTab] = useState("queen");

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new Terminal({
      theme: {
        background: "#030303",
        foreground: "#F5ECD0",
        cursor: "#c41e1e",
        cursorAccent: "#030303",
        selectionBackground: "rgba(196, 30, 30, 0.3)",
      },
      cursorBlink: true,
      fontFamily: "'Courier New', monospace",
      fontSize: 13,
      lineHeight: 1.3,
    });

    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(containerRef.current);
    fit.fit();

    termRef.current = term;
    fitRef.current = fit;

    // Demo text
    term.writeln("\x1b[1;31m========================================\x1b[0m");
    term.writeln("\x1b[1;33m  ТОВАРИЩ ЦЕНТР — Terminal Interface\x1b[0m");
    term.writeln("\x1b[1;31m========================================\x1b[0m");
    term.writeln("");
    term.writeln("\x1b[36m[SYSTEM]\x1b[0m Loading agent roles...");
    term.writeln("\x1b[32m[READY]\x1b[0m  Queen Orchestrator — \x1b[1mopus\x1b[0m");
    term.writeln("\x1b[34m[IDLE]\x1b[0m   Code Worker — \x1b[1msonnet\x1b[0m");
    term.writeln("\x1b[34m[IDLE]\x1b[0m   Test Worker — \x1b[1msonnet\x1b[0m");
    term.writeln("\x1b[34m[IDLE]\x1b[0m   Reviewer — \x1b[1mhaiku\x1b[0m");
    term.writeln("");
    term.writeln("\x1b[32m[SESSION]\x1b[0m Active. Awaiting mission directives...");
    term.writeln("");
    term.write("\x1b[31m>\x1b[0m ");

    // ResizeObserver
    const ro = new ResizeObserver(() => {
      try {
        fit.fit();
      } catch {
        // ignore fit errors during unmount
      }
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      term.dispose();
    };
  }, []);

  function addTab() {
    const id = `tab-${Date.now()}`;
    setTabs((prev) => [...prev, { id, name: `Agent ${prev.length + 1}`, status: "idle" }]);
    setActiveTab(id);
  }

  function closeTab(id: string) {
    setTabs((prev) => {
      const next = prev.filter((t) => t.id !== id);
      if (activeTab === id && next.length > 0) {
        setActiveTab(next[0].id);
      }
      return next;
    });
  }

  return (
    <div className="relative flex flex-col border-2 border-soviet-red bg-soviet-panel overflow-hidden">
      {/* Header bar */}
      <div className="relative flex items-center h-8 bg-soviet-red shrink-0">
        <div className="stripe-bg absolute inset-0 pointer-events-none" />
        <img src={hammerSickleImg} alt="" className="relative z-10 w-4 h-4 ml-2 opacity-80" />
        <span className="relative z-10 ml-2 text-xs font-['Russo_One'] text-soviet-cream tracking-wider">
          Товарищ Terminal
        </span>
      </div>

      {/* Tabs */}
      <div className="flex items-center h-7 bg-soviet-panel border-b border-soviet-red/40 shrink-0 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1 px-2.5 h-full text-[11px] font-['Oswald'] uppercase tracking-wider
              border-r border-soviet-red/20 transition-colors
              ${activeTab === tab.id ? "bg-soviet-red/20 text-soviet-cream" : "text-soviet-cream/50 hover:text-soviet-cream/80"}`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${dotClass[tab.status]}`} />
            {tab.name}
            <span
              onClick={(e) => {
                e.stopPropagation();
                closeTab(tab.id);
              }}
              className="ml-1 text-soviet-cream/30 hover:text-soviet-red-bright cursor-pointer"
            >
              x
            </span>
          </button>
        ))}
        <button
          onClick={addTab}
          className="px-2 h-full text-soviet-cream/30 hover:text-soviet-cream/70 text-sm"
          title="Add tab"
        >
          +
        </button>
      </div>

      {/* Terminal body */}
      <div className="relative flex-1 min-h-0">
        {/* Background watermark */}
        <img
          src={redSonLogo}
          alt=""
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 opacity-[0.04] pointer-events-none select-none"
        />
        <div ref={containerRef} className="absolute inset-0 p-1" />
      </div>
    </div>
  );
}
