import { expect, it } from "vitest";
import { playbackBeatForSource } from "./score-position";
import type { ParsedScore } from "./types";
it("seeks in the current repetition and maps later physical measures after repeats", () => {
  const score = { sourceMeasureStartBeats: [0, 4, 8], measureStartBeats: [0, 4, 8, 12, 16], playbackOrder: [0, 1, 0, 1, 2], totalBeats: 20 } as ParsedScore;
  expect(playbackBeatForSource(score, 1, 9)).toBe(9);
  expect(playbackBeatForSource(score, 5, 9)).toBe(13);
  expect(playbackBeatForSource(score, 9, 0)).toBe(17);
  expect(playbackBeatForSource(score, 1, 19)).toBe(1);
});
