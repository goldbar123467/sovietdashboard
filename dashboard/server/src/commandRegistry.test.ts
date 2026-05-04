import test from "node:test";
import assert from "node:assert/strict";
import {
  extractLatestOpenClawSessionId,
  getCommandDefinition,
  listCommandDefinitions,
  runProcess,
} from "./commandRegistry.js";

test("command registry exposes only named safe commands", () => {
  const commands = listCommandDefinitions();
  const ids = commands.map((command) => command.id);

  assert.ok(ids.includes("openclaw.status"));
  assert.ok(ids.includes("openclaw.text"));
  assert.ok(ids.includes("codex.version"));
  assert.ok(ids.includes("codex.loginStatus"));
  assert.ok(ids.includes("codex.mcpList"));
  assert.ok(ids.includes("codex.features"));
  assert.equal(ids.includes("codex.prompt"), false);
  assert.equal(ids.some((id) => id.startsWith("music.")), false);
  assert.equal(getCommandDefinition("rm -rf /"), undefined);
  assert.equal(getCommandDefinition("openclaw.status")?.risky, false);
});

test("command registry keeps executable argv separate from labels", () => {
  const command = getCommandDefinition("openclaw.status");

  assert.equal(command?.kind, "process");
  assert.equal(command?.command, "pnpm");
  assert.deepEqual(command?.args.slice(0, 3), ["openclaw", "gateway", "status"]);
});

test("text OpenClaw targets the configured main agent", () => {
  const command = getCommandDefinition("openclaw.text");
  assert.equal(command?.kind, "handler");
  assert.equal(command?.anthemOnComplete, true);
});

test("text OpenClaw can extract a session id from npm-prefixed session JSON", () => {
  const sessionId = extractLatestOpenClawSessionId(`
> openclaw@2026.5.3 openclaw /home/clark/code/openclaw
> node scripts/run-node.mjs sessions --json --all-agents

{
  "sessions": [
    {
      "agentId": "main",
      "key": "agent:main:main",
      "sessionId": "5f2dd6b1-4538-4f21-bdac-478504c249db",
      "kind": "direct",
      "updatedAt": "2026-05-04T18:58:04.000Z"
    }
  ]
}
`);

  assert.equal(sessionId, "5f2dd6b1-4538-4f21-bdac-478504c249db");
});

test("text OpenClaw ignores non-direct sessions when picking a target", () => {
  const sessionId = extractLatestOpenClawSessionId(JSON.stringify({
    sessions: [
      { sessionId: "channel-session", kind: "channel", updatedAt: "2026-05-04T19:00:00.000Z" },
      { sessionId: "direct-session", kind: "direct", updatedAt: "2026-05-04T18:00:00.000Z" },
    ],
  }));

  assert.equal(sessionId, "direct-session");
});

test("text OpenClaw prefers the newest direct session with numeric timestamps", () => {
  const sessionId = extractLatestOpenClawSessionId(JSON.stringify({
    sessions: [
      { sessionId: "older-direct", kind: "direct", updatedAt: 1777935000000 },
      { sessionId: "newer-direct", kind: "direct", updatedAt: 1777936000000 },
    ],
  }));

  assert.equal(sessionId, "newer-direct");
});

test("prompt-like commands are marked for anthem playback", () => {
  assert.equal(getCommandDefinition("openclaw.text")?.anthemOnComplete, true);
  assert.equal(getCommandDefinition("codex.version")?.anthemOnComplete, false);
});

test("process commands return a timeout result instead of hanging", async () => {
  const startedAt = Date.now();
  const result = await runProcess({
    id: "test.timeout",
    title: "Timeout Test",
    description: "Internal timeout test.",
    group: "codex",
    kind: "process",
    command: process.execPath,
    args: ["-e", "setTimeout(() => {}, 30_000)"],
    timeoutMs: 50,
    risky: false,
  });

  assert.equal(result.ok, false);
  assert.match(result.output, /Command timed out after 50ms/);
  assert.ok(Date.now() - startedAt < 5_000);
});
