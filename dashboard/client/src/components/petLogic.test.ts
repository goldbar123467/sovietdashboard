import assert from "node:assert/strict";
import test from "node:test";
import { petModeForCodex, petReplyForMessage, petPromptShortcut } from "./petLogic";

test("petModeForCodex maps running status to review", () => {
  assert.equal(petModeForCodex({ status: "running", failures: 0, lastRunOk: true }), "review");
});

test("petModeForCodex maps failed latest run to failed", () => {
  assert.equal(petModeForCodex({ status: "idle", failures: 1, lastRunOk: false }), "failed");
});

test("petModeForCodex maps successful latest run to salute", () => {
  assert.equal(petModeForCodex({ status: "idle", failures: 0, lastRunOk: true }), "salute");
});

test("petReplyForMessage answers token questions locally", () => {
  assert.match(
    petReplyForMessage("why are tokens high?", { totalTokens: 1200, cachedInputTokens: 900 }),
    /cached/i,
  );
});

test("petPromptShortcut returns concrete Agent Comms prompts", () => {
  assert.match(petPromptShortcut("tests"), /tests/i);
});
