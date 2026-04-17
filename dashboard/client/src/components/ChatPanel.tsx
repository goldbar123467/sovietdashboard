import { useState, useRef, useEffect } from "react";
import hammerSickleImg from "../assets/hammer-sickle.png";
import { useWebSocketContext } from "../hooks/useWebSocketContext";

interface ChatMessage {
  id: number;
  agent: string;
  text: string;
  time: string;
}

interface ServerChatMessage {
  from: string;
  to: string;
  body: string;
  timestamp: string;
}

const agentColor: Record<string, string> = {
  operator: "text-soviet-cream",
  queen: "text-soviet-red-bright",
  coder: "text-soviet-gold",
  tester: "text-soviet-teal",
  reviewer: "text-soviet-violet",
  system: "text-soviet-sky",
};

const STORAGE_KEY = "tovarish.chat.v1";
const STORAGE_LIMIT = 500;

function loadMessages(): ChatMessage[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function ChatPanel() {
  const [messages, setMessages] = useState<ChatMessage[]>(loadMessages);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const ws = useWebSocketContext();

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
    try {
      const trimmed = messages.slice(-STORAGE_LIMIT);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
    } catch {}
  }, [messages]);

  useEffect(() => {
    return ws.on("chat", (m: ServerChatMessage) => {
      if (m.from === "operator") return; // don't echo our own
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now() + Math.random(),
          agent: m.from,
          text: m.body,
          time: new Date(m.timestamp).toLocaleTimeString("en-US", { hour12: false }),
        },
      ]);
    });
  }, [ws]);

  async function send() {
    const text = input.trim();
    if (!text || sending) return;
    setSending(true);
    setMessages((prev) => [
      ...prev,
      {
        id: Date.now(),
        agent: "operator",
        text,
        time: new Date().toLocaleTimeString("en-US", { hour12: false }),
      },
    ]);
    setInput("");
    try {
      await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from: "operator", to: "queen", body: text }),
      });
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now() + 1,
          agent: "system",
          text: `Failed to reach server: ${err}`,
          time: new Date().toLocaleTimeString("en-US", { hour12: false }),
        },
      ]);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="relative flex flex-col flex-1 min-h-[200px] border-2 border-soviet-red bg-soviet-panel panel-strip overflow-hidden">
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
        className="flex-1 min-h-0 overflow-y-auto scroll-soviet px-3 py-1 space-y-1.5"
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
          placeholder={sending ? "Queen thinking..." : "Message queen..."}
          disabled={sending}
          autoFocus
          className="flex-1 bg-soviet-bg border-2 border-soviet-red/50 rounded-sm text-soviet-cream text-xs px-3 py-2
                     font-mono placeholder:text-soviet-cream/30
                     focus:outline-none focus:border-soviet-red focus:shadow-[0_0_10px_rgba(229,34,34,0.4)]"
        />
        <button
          onClick={send}
          disabled={sending}
          className="bg-soviet-red text-soviet-cream text-[11px] font-['Oswald'] uppercase tracking-wider rounded-sm
                     px-4 py-2 hover:bg-soviet-red-bright transition-colors cursor-pointer
                     disabled:opacity-40 disabled:cursor-not-allowed
                     shadow-[0_0_8px_rgba(196,30,30,0.3)]"
        >
          {sending ? "..." : "Send"}
        </button>
      </div>
    </div>
  );
}
