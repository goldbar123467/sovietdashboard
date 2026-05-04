import { existsSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

export function agentWorktreeBranch(agentId: string): string {
  return `agent/${agentId}`;
}

export function agentWorktreePath(repoRoot: string, agentId: string): string {
  return join(repoRoot, ".agent-worktrees", agentId);
}

export function ensureAgentWorktree(repoRoot: string, agentId: string): string {
  const path = agentWorktreePath(repoRoot, agentId);
  if (existsSync(path)) return path;

  const branch = agentWorktreeBranch(agentId);
  const branchExists = spawnSync("git", ["rev-parse", "--verify", branch], {
    cwd: repoRoot,
    stdio: "ignore",
  }).status === 0;

  const args = branchExists
    ? ["worktree", "add", path, branch]
    : ["worktree", "add", "-b", branch, path, "HEAD"];

  const result = spawnSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
  });

  if (result.status !== 0) {
    throw new Error([result.stdout, result.stderr].filter(Boolean).join("\n").trim() || `git ${args.join(" ")} failed`);
  }

  return path;
}
