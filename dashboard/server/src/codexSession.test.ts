import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  extractCodexExecSummary,
  listCodexSessionSummaries,
  createEmptyCodexDashboardState,
  applyCodexRunToState,
} from "./codexSession.js";

test("extractCodexExecSummary reads thread id and token usage from JSONL", () => {
  const summary = extractCodexExecSummary([
    JSON.stringify({ type: "thread.started", thread_id: "thread-123" }),
    JSON.stringify({ type: "turn.started" }),
    JSON.stringify({ type: "item.completed", item: { type: "tool_call" } }),
    JSON.stringify({
      type: "turn.completed",
      usage: {
        input_tokens: 20,
        cached_input_tokens: 5,
        output_tokens: 7,
        reasoning_output_tokens: 3,
      },
    }),
  ].join("\n"));

  assert.equal(summary.threadId, "thread-123");
  assert.equal(summary.usage.inputTokens, 20);
  assert.equal(summary.usage.cachedInputTokens, 5);
  assert.equal(summary.usage.outputTokens, 7);
  assert.equal(summary.usage.reasoningOutputTokens, 3);
  assert.equal(summary.toolCalls, 1);
});

test("applyCodexRunToState aggregates totals and keeps active session id", () => {
  const state = createEmptyCodexDashboardState();

  applyCodexRunToState(state, {
    id: "run-1",
    ok: true,
    prompt: "hello",
    reply: "world",
    threadId: "thread-123",
    startedAt: "2026-05-04T00:00:00.000Z",
    finishedAt: "2026-05-04T00:00:02.000Z",
    durationMs: 2_000,
    usage: {
      inputTokens: 10,
      cachedInputTokens: 4,
      outputTokens: 3,
      reasoningOutputTokens: 1,
      totalTokens: 13,
    },
    toolCalls: 2,
  });

  assert.equal(state.activeThreadId, "thread-123");
  assert.equal(state.totals.turns, 1);
  assert.equal(state.totals.inputTokens, 10);
  assert.equal(state.totals.outputTokens, 3);
  assert.equal(state.totals.totalTokens, 13);
  assert.equal(state.totals.toolCalls, 2);
});

test("listCodexSessionSummaries returns metadata without prompt text", () => {
  const root = mkdtempSync(join(tmpdir(), "codex-session-test-"));
  try {
    const dir = join(root, "2026", "05", "04");
    mkdirSync(dir, { recursive: true });
    const file = join(dir, "rollout-2026-05-04T01-02-03-thread-abc.jsonl");
    writeFileSync(file, [
      JSON.stringify({
        timestamp: "2026-05-04T01:02:03.000Z",
        type: "session_meta",
        payload: {
          id: "thread-abc",
          timestamp: "2026-05-04T01:02:03.000Z",
          cwd: "/repo",
          originator: "codex-tui",
          cli_version: "0.128.0",
          model_provider: "openai",
        },
      }),
      JSON.stringify({
        type: "response_item",
        payload: {
          role: "user",
          content: [{ type: "input_text", text: "secret prompt text" }],
        },
      }),
    ].join("\n"));

    const summaries = listCodexSessionSummaries(root, 5);

    assert.equal(summaries.length, 1);
    assert.equal(summaries[0].id, "thread-abc");
    assert.equal(summaries[0].cwd, "/repo");
    assert.equal(summaries[0].originator, "codex-tui");
    assert.equal(JSON.stringify(summaries).includes("secret prompt text"), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
