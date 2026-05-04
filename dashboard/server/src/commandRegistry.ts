import { spawn } from "node:child_process";

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
  anthemOnComplete?: boolean;
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
  anthemOnComplete?: boolean;
}

interface HandlerCommandDefinition {
  id: string;
  title: string;
  description: string;
  group: "openclaw" | "codex" | "browser";
  kind: "handler";
  handler: (input: CommandInput) => Promise<Omit<CommandResult, "id" | "title" | "startedAt" | "finishedAt">>;
  risky: false;
  anthemOnComplete?: boolean;
}

export type CommandDefinition = ProcessCommandDefinition | HandlerCommandDefinition;

const OPENCLAW_CWD = process.env.OPENCLAW_REPO || "/home/clark/code/openclaw";
const DEFAULT_TIMEOUT_MS = 45_000;
const OPENCLAW_TEXT_TIMEOUT_SECONDS = Number(process.env.OPENCLAW_TEXT_TIMEOUT_SECONDS ?? "120");

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
    id: "openclaw.text",
    title: "Text OpenClaw",
    description: "Send a one-shot text prompt to OpenClaw through the Gateway.",
    group: "openclaw",
    kind: "handler",
    handler: runOpenClawText,
    anthemOnComplete: true,
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
    anthemOnComplete: false,
    risky: false,
  },
  {
    id: "codex.loginStatus",
    title: "Login Status",
    description: "Show Codex CLI authentication status.",
    group: "codex",
    kind: "process",
    command: "codex",
    args: ["login", "status"],
    timeoutMs: 10_000,
    risky: false,
  },
  {
    id: "codex.mcpList",
    title: "MCP Servers",
    description: "List configured Codex MCP servers.",
    group: "codex",
    kind: "process",
    command: "codex",
    args: ["mcp", "list"],
    timeoutMs: 10_000,
    risky: false,
  },
  {
    id: "codex.features",
    title: "Feature Flags",
    description: "List Codex feature flags and effective states.",
    group: "codex",
    kind: "process",
    command: "codex",
    args: ["features", "list"],
    timeoutMs: 10_000,
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
    anthemOnComplete: command.anthemOnComplete ?? false,
    ...partial,
  };
}

export async function runProcess(command: ProcessCommandDefinition): Promise<Omit<CommandResult, "id" | "title" | "startedAt" | "finishedAt">> {
  return new Promise((resolve) => {
    const child = spawn(command.command, command.args, {
      cwd: command.cwd,
      env: process.env,
      shell: false,
      detached: process.platform !== "win32",
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let forceKillTimer: NodeJS.Timeout | undefined;
    const signalChild = (signal: NodeJS.Signals) => {
      if (!child.pid) return;
      try {
        if (process.platform === "win32") {
          child.kill(signal);
        } else {
          process.kill(-child.pid, signal);
        }
      } catch {
        try {
          child.kill(signal);
        } catch {
          // Process already exited.
        }
      }
    };
    const timer = setTimeout(() => {
      timedOut = true;
      signalChild("SIGTERM");
      forceKillTimer = setTimeout(() => signalChild("SIGKILL"), 2_000);
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
      if (forceKillTimer) clearTimeout(forceKillTimer);
      resolve({ ok: false, output: String(err), code: null });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (forceKillTimer) clearTimeout(forceKillTimer);
      const output = [stdout.trim(), stderr.trim()].filter(Boolean).join("\n");
      resolve({
        ok: code === 0 && !timedOut,
        output: timedOut
          ? `${output ? `${output}\n` : ""}Command timed out after ${command.timeoutMs ?? DEFAULT_TIMEOUT_MS}ms.`
          : output || `(exit ${code})`,
        code,
      });
    });
  });
}

export function extractLatestOpenClawSessionId(output: string): string | null {
  const jsonStart = output.indexOf("{");
  const jsonEnd = output.lastIndexOf("}");
  if (jsonStart === -1 || jsonEnd < jsonStart) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(output.slice(jsonStart, jsonEnd + 1));
  } catch {
    return null;
  }

  const sessions = getSessionArray(parsed);
  const directSessions = sessions
    .filter((session) => session.kind === "direct" && typeof session.sessionId === "string")
    .sort((a, b) => timestampMs(b.updatedAt) - timestampMs(a.updatedAt));
  const fallbackSessions = sessions
    .filter((session) => typeof session.sessionId === "string")
    .sort((a, b) => timestampMs(b.updatedAt) - timestampMs(a.updatedAt));

  return directSessions[0]?.sessionId ?? fallbackSessions[0]?.sessionId ?? null;
}

interface OpenClawSessionSummary {
  sessionId?: string;
  kind?: string;
  updatedAt?: string | number;
}

function getSessionArray(value: unknown): OpenClawSessionSummary[] {
  if (!value || typeof value !== "object") return [];
  const sessions = (value as { sessions?: unknown }).sessions;
  if (!Array.isArray(sessions)) return [];
  return sessions.filter((session): session is OpenClawSessionSummary => Boolean(session) && typeof session === "object");
}

function timestampMs(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function runOpenClawText(input: CommandInput): Promise<Omit<CommandResult, "id" | "title" | "startedAt" | "finishedAt">> {
  const prompt = input.prompt?.trim();
  if (!prompt) {
    return { ok: false, output: "Enter a message before texting OpenClaw.", code: null };
  }

  const sessionsResult = await runProcess({
    id: "openclaw.sessions.internal",
    title: "OpenClaw Sessions",
    description: "Internal OpenClaw session resolver.",
    group: "openclaw",
    kind: "process",
    command: "pnpm",
    args: ["openclaw", "sessions", "--json", "--all-agents"],
    cwd: OPENCLAW_CWD,
    timeoutMs: 15_000,
    risky: false,
  });
  if (!sessionsResult.ok) {
    return {
      ok: false,
      output: `Could not list OpenClaw sessions.\n${sessionsResult.output}`,
      code: sessionsResult.code,
    };
  }

  const sessionId = extractLatestOpenClawSessionId(sessionsResult.output);
  if (!sessionId) {
    return {
      ok: false,
      output: "No OpenClaw session id was found. Start or resume an OpenClaw direct session first.",
      code: null,
    };
  }

  return runProcess({
    id: "openclaw.text.internal",
    title: "Text OpenClaw",
    description: "Internal OpenClaw text runner.",
    group: "openclaw",
    kind: "process",
    command: "pnpm",
    args: [
      "openclaw",
      "agent",
      "--session-id",
      sessionId,
      "--message",
      prompt,
      "--thinking",
      "minimal",
      "--timeout",
      String(OPENCLAW_TEXT_TIMEOUT_SECONDS),
    ],
    cwd: OPENCLAW_CWD,
    timeoutMs: (OPENCLAW_TEXT_TIMEOUT_SECONDS + 10) * 1000,
    risky: false,
  });
}
