import { useEffect } from "react";
import { Header } from "./components/Header";
import { CommandBoard } from "./components/CommandBoard";
import { SovietBackground } from "./components/SovietBackground";
import { useWebSocket } from "./hooks/useWebSocket";
import { WsContext } from "./hooks/useWebSocketContext";
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
    <WsContext.Provider value={ws}>
      <SovietBackground />
      <div className="relative z-10 h-screen grid grid-rows-[64px_1fr] gap-1 p-1">
        <Header connected={ws.connected} />
        <main className="min-h-0 overflow-hidden">
          <CommandBoard />
        </main>
      </div>
    </WsContext.Provider>
  );
}
