import { useEffect } from "react";
import { Header } from "./components/Header";
import { AgentColumn } from "./components/AgentColumn";
import { TerminalPanel } from "./components/TerminalPanel";
import { MetricsPanel } from "./components/MetricsPanel";
import { NarratorPanel } from "./components/NarratorPanel";
import { ChatPanel } from "./components/ChatPanel";
import { useWebSocket } from "./hooks/useWebSocket";
import { useAnthem } from "./hooks/useAnthem";

export function App() {
  const ws = useWebSocket(`ws://${window.location.hostname}:4981/ws`);
  const { play: playAnthem } = useAnthem();

  useEffect(() => {
    return ws.on("anthem", () => {
      playAnthem();
    });
  }, [ws, playAnthem]);

  return (
    <div className="h-screen grid grid-rows-[64px_1fr] grid-cols-[250px_1fr_330px] gap-1 p-1">
      <Header />
      <AgentColumn />
      <TerminalPanel />
      <div className="flex flex-col gap-1">
        <MetricsPanel />
        <NarratorPanel />
        <ChatPanel />
      </div>
    </div>
  );
}
