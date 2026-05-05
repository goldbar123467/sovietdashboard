export type PetMode = "idle" | "review" | "salute" | "failed" | "play";
export type PetShortcut = "diff" | "tests" | "tokens";

export interface PetCodexSignal {
  status: "idle" | "running";
  failures: number;
  lastRunOk?: boolean;
  playing?: boolean;
}

export interface PetStatsSignal {
  totalTokens: number;
  cachedInputTokens: number;
}

export function petModeForCodex(signal: PetCodexSignal): PetMode {
  if (signal.playing) return "play";
  if (signal.status === "running") return "review";
  if (signal.lastRunOk === false || signal.failures > 0) return "failed";
  if (signal.lastRunOk === true) return "salute";
  return "idle";
}

export function petReplyForMessage(message: string, stats: PetStatsSignal): string {
  const normalized = message.toLowerCase();
  if (normalized.includes("token")) {
    const cachedRatio = stats.totalTokens > 0
      ? Math.round((stats.cachedInputTokens / stats.totalTokens) * 100)
      : 0;
    return `Cached context is carrying ${cachedRatio}% of the load. Tovarish Byte approves reuse.`;
  }
  if (normalized.includes("test")) {
    return "Run the narrow test first, then broaden the front. Small victories compound.";
  }
  if (normalized.includes("status") || normalized.includes("diff")) {
    return "Ask Codex for git diff, risk, and the next single command.";
  }
  return "Signal received. Keep the command tight and the output useful.";
}

export function petPromptShortcut(shortcut: PetShortcut): string {
  switch (shortcut) {
    case "diff":
      return "Inspect the current git diff and summarize the highest-risk changed files.";
    case "tests":
      return "Run the narrowest useful tests for the current dashboard changes and summarize failures only.";
    case "tokens":
      return "Explain the latest token spike using the dashboard stats and suggest how to reduce context load.";
  }
}

export function petMoodLine(mode: PetMode): string {
  switch (mode) {
    case "review":
      return "Reviewing the front.";
    case "salute":
      return "Run complete. Salute logged.";
    case "failed":
      return "Regroup, repair, retest.";
    case "play":
      return "Morale routine active.";
    case "idle":
      return "Awaiting command signal.";
  }
}
