import test from "node:test";
import assert from "node:assert/strict";
import { agentWorktreePath, agentWorktreeBranch } from "./agentWorktrees.js";

test("agent worktree paths are stable and per-agent", () => {
  assert.equal(agentWorktreeBranch("queen"), "agent/queen");
  assert.equal(agentWorktreeBranch("coder"), "agent/coder");
  assert.ok(agentWorktreePath("/repo", "queen").endsWith("/repo/.agent-worktrees/queen"));
  assert.ok(agentWorktreePath("/repo", "reviewer").endsWith("/repo/.agent-worktrees/reviewer"));
});
