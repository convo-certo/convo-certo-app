import { expect, it } from "vitest";
import { evaluateFollower } from "./follower-evaluation";
import { SequenceFollower } from "./sequence-follower";

it("separates missed notes, wrong positions, and accepted extra notes from correct matches", () => {
  const beats = [0, null, 4, 5, null];
  let index = 0, tick = 0;
  const follower = { load() {}, match() { const beat = beats[index++]; return beat === null ? null : { beat, tempo: 120, confidence: 1, duration: 1, velocity: 80 }; } };
  const result = evaluateFollower(follower, [], 120, [0, 1, 2, null, null].map((targetBeat, i) => ({ targetBeat, expectedBeat: i, message: { type: "noteon", note: 60, velocity: 80, timestamp: i * 500 } })), () => tick++);
  expect(result).toMatchObject({ correct: 1, missed: 1, wrongPosition: 1, falseMatch: 1, rejectedExtra: 1, labeledNotes: 3, extraNotes: 2, accuracy: 1 / 3, matchedPositionErrorBeats: { p50: 0, p95: 2 }, processingMs: { p50: 1, p95: 1 } });
});

it("does not report success or zero latency for an empty evaluation", () => {
  expect(evaluateFollower(new SequenceFollower(), [], 120, [])).toMatchObject({ accuracy: null, processingMs: { p50: null, p95: null }, matchedPositionErrorBeats: { p50: null, p95: null } });
});
