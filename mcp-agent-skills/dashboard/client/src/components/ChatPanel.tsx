import { useState, useRef, useEffect } from "react";
import hammerSickleImg from "../assets/hammer-sickle.png";

interface ChatMessage {
  id: number;
  agent: string;
  text: string;
  time: string;
}

const agentColor: Record<string, string> = {
  queen: "text-soviet-red-bright",
  coder: "text-soviet-gold",
  tester: "text-soviet-teal",
  reviewer: "text-soviet-violet",
};

export function ChatPanel() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  function send() {
    const text = input.trim();
    if (!text) return;
    setMessages((prev) => [
      ...prev,
      {
        id: Date.now(),
        agent: "queen",
        text,
        time: new Date().toLocaleTimeString("en-US", { hour12: false }),
      },
    ]);
    setInput("");
  }

  return (
    <div className="relative flex flex-col h-[200px] border-2 border-soviet-red bg-soviet-panel panel-strip overflow-hidden">
      <div className="px-3 pt-4 pb-1 shrink-0">
        <div className="flex items-center gap-2">
          <img src={hammerSickleImg} alt="" className="w-4 h-4 opacity-60" />
          <h3 className="text-xs font-['Russo_One'] text-soviet-red-bright glow-red uppercase tracking-wider">
            Agent Comms
          </h3>
        </div>
      </div>

      {/* Message feed */}
      <div
        ref={scrollRef}
        className="flex-1 min-h-0 overflow-y-auto px-3 py-1 space-y-1.5"
      >
        {messages.length === 0 ? (
          <p className="text-[11px] italic text-soviet-cream/30 mt-2">No messages yet...</p>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} className="text-[11px] leading-snug">
              <span
                className={`font-['Oswald'] font-semibold uppercase ${agentColor[msg.agent] ?? "text-soviet-cream"}`}
              >
                {msg.agent}
              </span>
              <span className="text-soviet-cream/30 ml-1 font-mono text-[9px]">{msg.time}</span>
              <p className="text-soviet-cream/80 mt-0.5">{msg.text}</p>
            </div>
          ))
        )}
      </div>

      {/* Input */}
      <div className="shrink-0 flex items-center gap-1 px-2 pb-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Message..."
          className="flex-1 bg-soviet-bg border border-soviet-red/40 text-soviet-cream text-[11px] px-2 py-1.5
                     font-mono placeholder:text-soviet-cream/20
                     focus:outline-none focus:border-soviet-red focus:shadow-[0_0_6px_rgba(229,34,34,0.3)]"
        />
        <button
          onClick={send}
          className="bg-soviet-red text-soviet-cream text-[10px] font-['Oswald'] uppercase tracking-wider
                     px-3 py-1.5 hover:bg-soviet-red-bright transition-colors"
        >
          Send
        </button>
      </div>
    </div>
  );
}
