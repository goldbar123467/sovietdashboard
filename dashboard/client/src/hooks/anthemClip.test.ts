import assert from "node:assert/strict";
import test from "node:test";
import { startAnthemClip, type AnthemAudio } from "./anthemClip";

test("startAnthemClip restarts audio and stops after five seconds", async () => {
  const calls: string[] = [];
  let scheduledMs = 0;
  let scheduledStop: (() => void) | undefined;
  const audio: AnthemAudio = {
    currentTime: 17,
    volume: 1,
    pause: () => calls.push("pause"),
    play: () => {
      calls.push("play");
      return Promise.resolve();
    },
  };

  const timer = startAnthemClip(audio, {
    clipMs: 5000,
    scheduleStop: (fn, ms) => {
      scheduledStop = fn;
      scheduledMs = ms;
      return 101;
    },
    clearStop: () => calls.push("clear"),
    previousTimer: 55,
  });

  await Promise.resolve();
  assert.equal(timer, 101);
  assert.equal(audio.currentTime, 0);
  assert.deepEqual(calls, ["clear", "play"]);
  assert.equal(scheduledMs, 5000);

  scheduledStop?.();
  assert.equal(audio.currentTime, 0);
  assert.deepEqual(calls, ["clear", "play", "pause"]);
});
