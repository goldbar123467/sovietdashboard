import test from "node:test";
import assert from "node:assert/strict";
import { getCommandDefinition, listCommandDefinitions } from "./commandRegistry.js";

test("command registry exposes only named safe commands", () => {
  const commands = listCommandDefinitions();
  const ids = commands.map((command) => command.id);

  assert.ok(ids.includes("openclaw.status"));
  assert.ok(ids.includes("codex.version"));
  assert.ok(ids.includes("music.playPause"));
  assert.equal(getCommandDefinition("rm -rf /"), undefined);
  assert.equal(getCommandDefinition("openclaw.status")?.risky, false);
});

test("command registry keeps executable argv separate from labels", () => {
  const command = getCommandDefinition("openclaw.status");

  assert.equal(command?.kind, "process");
  assert.equal(command?.command, "pnpm");
  assert.deepEqual(command?.args.slice(0, 3), ["openclaw", "gateway", "status"]);
});
