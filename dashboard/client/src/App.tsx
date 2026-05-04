import { useEffect, useState } from "react";
import { Header } from "./components/Header";
import { MetricsPanel } from "./components/MetricsPanel";
import { NarratorPanel } from "./components/NarratorPanel";
import { ChatPanel } from "./components/ChatPanel";
import { CommandBoard } from "./components/CommandBoard";
import { SovietBackground } from "./components/SovietBackground";
import { WebPanel } from "./components/WebPanel";
import { useWebSocket } from "./hooks/useWebSocket";
import { WsContext } from "./hooks/useWebSocketContext";
import { useAnthem } from "./hooks/useAnthem";

export function App() {
  const ws = useWebSocket(`ws://${window.location.hostname}:4981/ws`);
  const { play: playAnthem } = useAnthem();
  const [centerTab, setCenterTab] = useState<"control" | "web">("control");

  useEffect(() => {
    return ws.on("anthem", () => {
      playAnthem();
    });
  }, [ws, playAnthem]);

  return (
    <WsContext.Provider value={ws}>
      <SovietBackground />
      <div className="relative z-10 h-screen grid grid-rows-[64px_1fr] grid-cols-[minmax(0,1fr)_330px] gap-1 p-1">
        <Header />
        <main className="min-h-0 flex flex-col overflow-hidden">
          <div className="flex h-8 shrink-0 border-2 border-b-0 border-soviet-red bg-soviet-bg/80">
            {[
              ["control", "Command Board"],
              ["web", "Web Tab"],
            ].map(([id, label]) => (
              <button
                key={id}
                onClick={() => setCenterTab(id as typeof centerTab)}
                className={`px-4 border-r border-soviet-red/35 text-[11px] font-['Oswald'] uppercase tracking-wider transition-colors
                  ${centerTab === id ? "bg-soviet-red text-soviet-cream" : "text-soviet-cream/55 hover:text-soviet-cream hover:bg-soviet-red/15"}`}
              >
                {label}
              </button>
            ))}
            <div className="ml-auto flex items-center gap-2 px-3 text-[10px] font-mono text-soviet-cream/45">
              <span className={`w-2 h-2 rounded-full ${ws.connected ? "dot-active" : "dot-waiting"}`} />
              {ws.connected ? "WS ONLINE" : "RECONNECTING"}
            </div>
          </div>
          <div className="flex-1 min-h-0">
            {centerTab === "control" && <CommandBoard />}
            {centerTab === "web" && <WebPanel />}
          </div>
        </main>
        <div className="flex flex-col gap-1 min-h-0 overflow-hidden">
          <MetricsPanel />
          <NarratorPanel />
          <ChatPanel />
        </div>
      </div>
    </WsContext.Provider>
  );
}
