import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  JsonCodexRunLedger,
  aggregateCodexRunWindows,
  toLedgerRun,
  type LedgerCodexRun,
} from "./codexRunLedger.js";
import type { CodexRunRecord } from "./codexSession.js";

function run(id: string, finishedAt: string, totalTokens: number): LedgerCodexRun {
  return {
    id,
    ok: true,
    finishedAt,
    startedAt: finishedAt,
    durationMs: 1_000,
    usage: {
      inputTokens: totalTokens - 1,
      cachedInputTokens: 2,
      outputTokens: 1,
      reasoningOutputTokens: 0,
      totalTokens,
    },
    toolCalls: 1,
  };
}

test("aggregateCodexRunWindows totals runs by 1h, 1d, 7d, and lifetime", () => {
  const now = new Date("2026-05-05T12:00:00.000Z");
  const windows = aggregateCodexRunWindows([
    run("recent", "2026-05-05T11:30:00.000Z", 10),
    run("day", "2026-05-05T02:00:00.000Z", 20),
    run("week", "2026-05-01T12:00:00.000Z", 30),
    run("old", "2026-04-01T12:00:00.000Z", 40),
  ], now);

  assert.equal(windows["1h"].turns, 1);
  assert.equal(windows["1h"].totalTokens, 10);
  assert.equal(windows["1d"].turns, 2);
  assert.equal(windows["1d"].totalTokens, 30);
  assert.equal(windows["7d"].turns, 3);
  assert.equal(windows["7d"].totalTokens, 60);
  assert.equal(windows.lifetime.turns, 4);
  assert.equal(windows.lifetime.totalTokens, 100);
});

test("JsonCodexRunLedger persists sanitized run previews", () => {
  const root = mkdtempSync(join(tmpdir(), "codex-ledger-test-"));
  try {
    const path = join(root, "runs.json");
    const ledger = new JsonCodexRunLedger(path);
    const source: CodexRunRecord = {
      id: "run-1",
      ok: false,
      prompt: "p".repeat(300),
      reply: "r".repeat(400),
      startedAt: "2026-05-05T00:00:00.000Z",
      finishedAt: "2026-05-05T00:00:01.000Z",
      durationMs: 1_000,
      usage: {
        inputTokens: 10,
        cachedInputTokens: 3,
        outputTokens: 4,
        reasoningOutputTokens: 1,
        totalTokens: 14,
      },
      toolCalls: 2,
      error: "failed",
    };

    ledger.append(toLedgerRun(source));
    const reloaded = new JsonCodexRunLedger(path);
    const stored = reloaded.list();

    assert.equal(stored.length, 1);
    assert.equal(stored[0].id, "run-1");
    assert.equal(stored[0].ok, false);
    assert.equal(stored[0].promptPreview?.length, 200);
    assert.equal(stored[0].replyPreview?.length, 240);
    assert.equal(JSON.stringify(stored).includes("p".repeat(220)), false);
    assert.equal(reloaded.windows(new Date("2026-05-05T00:00:02.000Z")).lifetime.totalTokens, 14);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
