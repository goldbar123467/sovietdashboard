import assert from "node:assert/strict";
import test from "node:test";
import { AGENT_COMMS_STAGE_COPY } from "./agentCommsStage";

test("agent comms empty stage keeps the command output destination copy", () => {
  assert.equal(AGENT_COMMS_STAGE_COPY.primary, "Command output will stream into this board.");
  assert.equal(AGENT_COMMS_STAGE_COPY.signal, "SPY ROUTER LISTENING");
});
