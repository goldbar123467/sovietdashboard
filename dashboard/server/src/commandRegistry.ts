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
  group: "openclaw" | "codex" | "music" | "browser";
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
  group: "openclaw" | "codex" | "music" | "browser";
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
  {
    id: "music.open",
    title: "Open Music",
    description: "Open Apple Music/Music where the host supports it.",
    group: "music",
    kind: "handler",
    handler: () => runMusicAction("open"),
    risky: false,
  },
  {
    id: "music.playPause",
    title: "Play/Pause",
    description: "Toggle media playback.",
    group: "music",
    kind: "handler",
    handler: () => runMusicAction("playPause"),
    risky: false,
  },
  {
    id: "music.next",
    title: "Next Track",
    description: "Skip to the next track.",
    group: "music",
    kind: "handler",
    handler: () => runMusicAction("next"),
    risky: false,
  },
  {
    id: "music.previous",
    title: "Previous Track",
    description: "Return to the previous track.",
    group: "music",
    kind: "handler",
    handler: () => runMusicAction("previous"),
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

async function runMusicAction(action: "open" | "playPause" | "next" | "previous"): Promise<Omit<CommandResult, "id" | "title" | "startedAt" | "finishedAt">> {
  if (process.platform === "darwin") {
    const scriptByAction: Record<typeof action, string> = {
      open: `tell application "Music" to activate`,
      playPause: `tell application "Music" to playpause`,
      next: `tell application "Music" to next track`,
      previous: `tell application "Music" to previous track`,
    };
    return runProcess({
      id: `music.${action}.darwin`,
      title: "Music",
      description: "macOS Music control",
      group: "music",
      kind: "process",
      command: "osascript",
      args: ["-e", scriptByAction[action]],
      timeoutMs: 10_000,
      risky: false,
    });
  }

  if (process.platform === "linux" && process.env.WSL_DISTRO_NAME) {
    const keyByAction: Record<typeof action, string> = {
      open: "Start-Process 'music:'",
      playPause: "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait([char]179)",
      next: "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait([char]176)",
      previous: "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait([char]177)",
    };
    return runProcess({
      id: `music.${action}.wsl`,
      title: "Windows Media",
      description: "Windows media control from WSL",
      group: "music",
      kind: "process",
      command: "powershell.exe",
      args: ["-NoProfile", "-Command", keyByAction[action]],
      timeoutMs: 10_000,
      risky: false,
    });
  }

  if (action === "open") {
    return { ok: false, output: "Opening Apple Music is only supported on macOS or WSL/Windows from this command board.", code: null };
  }

  return runProcess({
    id: `music.${action}.playerctl`,
    title: "MPRIS Media",
    description: "Linux media control",
    group: "music",
    kind: "process",
    command: "playerctl",
    args: [action === "playPause" ? "play-pause" : action],
    timeoutMs: 10_000,
    risky: false,
  });
}
