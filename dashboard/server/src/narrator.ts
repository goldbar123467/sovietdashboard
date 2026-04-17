import { recentEvents } from "./db.js";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const POLL_INTERVAL = 60_000; // 60s — codex exec is slower and heavier than a chat API
const CODEX_TIMEOUT_MS = 90_000;
const CODEX_MODEL = process.env.NARRATOR_CODEX_MODEL; // optional override
let lastSummary = "Awaiting mission data...";
let onUpdate: ((summary: string) => void) | null = null;
let inflight = false;

export function getNarration(): string {
  return lastSummary;
}

export function setUpdateCallback(cb: (summary: string) => void) {
  onUpdate = cb;
}

const SYSTEM_BRIEF =
  "You are a Soviet mission briefing officer. Summarize agent activity in 2-3 sentences. " +
  "Be concise and factual. Mention agent names, what they did, and current status. Use present tense. " +
  "Reply with only the briefing text — no preamble, no markdown.";

async function runCodex(prompt: string): Promise<string | null> {
  const workdir = mkdtempSync(join(tmpdir(), "narrator-"));
  const outFile = join(workdir, "last.txt");

  const args = [
    "exec",
    "--ephemeral",
    "--skip-git-repo-check",
    "--sandbox", "read-only",
    "--cd", workdir,
    "--output-last-message", outFile,
    "--color", "never",
  ];
  if (CODEX_MODEL) args.push("--model", CODEX_MODEL);
  args.push(prompt);

  const proc = Bun.spawn(["codex", ...args], {
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env },
  });

  const timer = setTimeout(() => {
    try { proc.kill(); } catch {}
  }, CODEX_TIMEOUT_MS);

  try {
    const code = await proc.exited;
    clearTimeout(timer);
    if (code !== 0) {
      const err = await new Response(proc.stderr).text();
      console.error("[narrator] codex exited", code, err.slice(0, 400));
      return null;
    }
    const text = readFileSync(outFile, "utf8").trim();
    return text || null;
  } catch (err) {
    console.error("[narrator] codex spawn error:", err);
    return null;
  } finally {
    clearTimeout(timer);
    try { rmSync(workdir, { recursive: true, force: true }); } catch {}
  }
}

async function generateSummary() {
  if (inflight) return; // avoid overlap — codex calls can be slow
  inflight = true;
  try {
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

    const prompt = `${SYSTEM_BRIEF}\n\nRecent event log:\n${eventLog}\n\nProvide the briefing now.`;
    const text = await runCodex(prompt);
    if (text) {
      lastSummary = text;
      onUpdate?.(lastSummary);
    }
  } finally {
    inflight = false;
  }
}

export function startNarrator() {
  console.log(`[narrator] Starting (codex backend), polling every ${POLL_INTERVAL / 1000}s`);
  generateSummary();
  setInterval(generateSummary, POLL_INTERVAL);
}
