import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface CommandInput {
  prompt?: string;
  url?: string;
}

export interface CommandResult {
  id: string;
  ok: boolean;
  title: string;
  output: string;
  code?: number | null;
  startedAt: string;
  finishedAt: string;
}

export interface ProcessCommandDefinition {
  id: string;
  title: string;
  description: string;
  group: "openclaw" | "codex" | "browser";
  kind: "process";
  command: string;
  args: string[];
  cwd?: string;
  timeoutMs?: number;
  risky: false;
}

interface HandlerCommandDefinition {
  id: string;
  title: string;
  description: string;
  group: "openclaw" | "codex" | "browser";
  kind: "handler";
  handler: (input: CommandInput) => Promise<Omit<CommandResult, "id" | "title" | "startedAt" | "finishedAt">>;
  risky: false;
}

export type CommandDefinition = ProcessCommandDefinition | HandlerCommandDefinition;

const OPENCLAW_CWD = process.env.OPENCLAW_REPO || "/home/clark/code/openclaw";
const DEFAULT_TIMEOUT_MS = 45_000;

const COMMANDS: CommandDefinition[] = [
  {
    id: "openclaw.status",
    title: "OpenClaw Status",
    description: "Check local OpenClaw gateway/service status.",
    group: "openclaw",
    kind: "process",
    command: "pnpm",
    args: ["openclaw", "gateway", "status", "--deep"],
    cwd: OPENCLAW_CWD,
    timeoutMs: 30_000,
    risky: false,
  },
  {
    id: "openclaw.start",
    title: "Start OpenClaw",
    description: "Start the managed local OpenClaw gateway service.",
    group: "openclaw",
    kind: "process",
    command: "pnpm",
    args: ["openclaw", "gateway", "start"],
    cwd: OPENCLAW_CWD,
    timeoutMs: 30_000,
    risky: false,
  },
  {
    id: "openclaw.restart",
    title: "Restart OpenClaw",
    description: "Restart the managed local OpenClaw gateway service.",
    group: "openclaw",
    kind: "process",
    command: "pnpm",
    args: ["openclaw", "gateway", "restart", "--wait", "30s"],
    cwd: OPENCLAW_CWD,
    timeoutMs: 60_000,
    risky: false,
  },
  {
    id: "openclaw.doctor",
    title: "OpenClaw Doctor",
    description: "Run OpenClaw diagnostics without applying fixes.",
    group: "openclaw",
    kind: "process",
    command: "pnpm",
    args: ["openclaw", "doctor"],
    cwd: OPENCLAW_CWD,
    timeoutMs: 60_000,
    risky: false,
  },
  {
    id: "codex.version",
    title: "Codex Version",
    description: "Show the installed Codex CLI version.",
    group: "codex",
    kind: "process",
    command: "codex",
    args: ["--version"],
    timeoutMs: 10_000,
    risky: false,
  },
  {
    id: "codex.prompt",
    title: "Codex Prompt",
    description: "Send a one-shot prompt to Codex CLI and return its final answer.",
    group: "codex",
    kind: "handler",
    handler: runCodexPrompt,
    risky: false,
  },
];

export function listCommandDefinitions(): Array<Omit<CommandDefinition, "handler">> {
  return COMMANDS.map((command) => {
    if (command.kind === "handler") {
      const { handler: _handler, ...rest } = command;
      return rest;
    }
    return command;
  });
}

export function getCommandDefinition(id: string): CommandDefinition | undefined {
  return COMMANDS.find((command) => command.id === id);
}

export async function runRegisteredCommand(id: string, input: CommandInput = {}): Promise<CommandResult> {
  const command = getCommandDefinition(id);
  const startedAt = new Date().toISOString();
  if (!command) {
    const finishedAt = new Date().toISOString();
    return {
      id,
      ok: false,
      title: "Unknown command",
      output: `Command "${id}" is not registered.`,
      code: null,
      startedAt,
      finishedAt,
    };
  }

  const partial = command.kind === "process"
    ? await runProcess(command)
    : await command.handler(input);

  return {
    id: command.id,
    title: command.title,
    startedAt,
    finishedAt: new Date().toISOString(),
    ...partial,
  };
}

async function runProcess(command: ProcessCommandDefinition): Promise<Omit<CommandResult, "id" | "title" | "startedAt" | "finishedAt">> {
  return new Promise((resolve) => {
    const child = spawn(command.command, command.args, {
      cwd: command.cwd,
      env: process.env,
      shell: false,
    });

    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
    }, command.timeoutMs ?? DEFAULT_TIMEOUT_MS);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
      stdout = stdout.slice(-12_000);
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
      stderr = stderr.slice(-12_000);
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({ ok: false, output: String(err), code: null });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({
        ok: code === 0,
        output: [stdout.trim(), stderr.trim()].filter(Boolean).join("\n") || `(exit ${code})`,
        code,
      });
    });
  });
}

async function runCodexPrompt(input: CommandInput): Promise<Omit<CommandResult, "id" | "title" | "startedAt" | "finishedAt">> {
  const prompt = input.prompt?.trim();
  if (!prompt) {
    return { ok: false, output: "Enter a prompt before running Codex.", code: null };
  }

  const workdir = mkdtempSync(join(tmpdir(), "command-board-codex-"));
  const outFile = join(workdir, "last.txt");
  const result = await runProcess({
    id: "codex.prompt.internal",
    title: "Codex Prompt",
    description: "Internal Codex prompt runner.",
    group: "codex",
    kind: "process",
    command: "codex",
    args: [
      "exec",
      "--ephemeral",
      "--skip-git-repo-check",
      "--sandbox",
      "read-only",
      "--cd",
      workdir,
      "--output-last-message",
      outFile,
      "--color",
      "never",
      prompt,
    ],
    timeoutMs: 180_000,
    risky: false,
  });

  try {
    const finalText = readFileSync(outFile, "utf8").trim();
    if (finalText) return { ok: true, output: finalText, code: result.code };
  } catch {
    // Fall back to stdout/stderr below.
  } finally {
    try { rmSync(workdir, { recursive: true, force: true }); } catch {}
  }

  return result;
}
