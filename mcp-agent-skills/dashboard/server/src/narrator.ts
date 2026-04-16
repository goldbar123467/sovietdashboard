import { recentEvents } from "./db.js";

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const POLL_INTERVAL = 20_000; // 20 seconds
let lastSummary = "Awaiting mission data...";
let onUpdate: ((summary: string) => void) | null = null;

export function getNarration(): string {
  return lastSummary;
}

export function setUpdateCallback(cb: (summary: string) => void) {
  onUpdate = cb;
}

async function generateSummary() {
  if (!OPENROUTER_API_KEY) {
    lastSummary = "OPENROUTER_API_KEY not set. Narrator offline.";
    return;
  }

  const events = recentEvents(30);
  if (events.length === 0) {
    lastSummary = "No mission activity yet. Agents standing by.";
    onUpdate?.(lastSummary);
    return;
  }

  const eventLog = events
    .reverse()
    .map((e: any) => `[${e.timestamp}] ${e.agent_id || "system"}: ${e.hook_event} ${e.tool_name || ""} ${e.error || ""}`.trim())
    .join("\n");

  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "anthropic/claude-haiku-4-5-20251001",
        max_tokens: 200,
        messages: [
          {
            role: "system",
            content: "You are a Soviet mission briefing officer. Summarize agent activity in 2-3 sentences. Be concise and factual. Mention agent names, what they did, and current status. Use present tense.",
          },
          {
            role: "user",
            content: `Recent event log:\n${eventLog}\n\nProvide a brief mission status update.`,
          },
        ],
      }),
    });

    const data = await res.json();
    lastSummary = data.choices?.[0]?.message?.content || lastSummary;
    onUpdate?.(lastSummary);
  } catch (err) {
    console.error("[narrator] Error:", err);
  }
}

export function startNarrator() {
  console.log("[narrator] Starting, polling every 20s");
  generateSummary();
  setInterval(generateSummary, POLL_INTERVAL);
}
