import { recentEvents } from "./db.js";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

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

  const proc = spawn("codex", args, {
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env },
  });

  const timer = setTimeout(() => {
    try { proc.kill(); } catch {}
  }, CODEX_TIMEOUT_MS);

  try {
    const stderrPromise = streamText(proc.stderr);
    const code = await new Promise<number | null>((resolve, reject) => {
      proc.on("error", reject);
      proc.on("close", resolve);
    });
    clearTimeout(timer);
    if (code !== 0) {
      const err = await stderrPromise;
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

async function streamText(stream: NodeJS.ReadableStream | null): Promise<string> {
  if (!stream) return "";
  let text = "";
  for await (const chunk of stream) text += chunk.toString();
  return text;
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
