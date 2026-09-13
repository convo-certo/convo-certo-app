import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { parseMusicXML } from "./musicxml-parser";
import { ConcertEngine } from "./concert-engine";
import { replayTake, scoreKey, TakeRecorder } from "./rehearsal-takes";
import { readRehearsalTake } from "./rehearsal-take-file";
import { profileFromTake } from "./reference-profile";
import { takeScoreContext } from "./take-score-context";
import type { ParsedScore } from "./types";

const score = parseMusicXML(readFileSync("public/scores/sample-duet.musicxml", "utf8"));
const engine = new ConcertEngine(() => 0, false);
engine.load(score);
const take = new TakeRecorder(score, "P1", engine, []).finish();
engine.dispose();

describe("take score conditions", () => {
  it.each([
    (s: ParsedScore) => { s.tempo *= 1.5; },
    (s: ParsedScore) => { s.tempoEvents = [{ beatPosition: 4, bpm: 60, type: "instant" }]; },
    (s: ParsedScore) => { s.parts[0].notes[0].velocity = 1; },
    (s: ParsedScore) => { s.parts[0].notes[0].articulation = 0.5; },
    (s: ParsedScore) => { s.parts[0].notes[0].gainCurve = [{ position: 0, gain: 1 }, { position: 1, gain: 2 }]; },
    (s: ParsedScore) => { s.timeSignature.beats = 3; },
    (s: ParsedScore) => { s.playerPartId = "P2"; },
    (s: ParsedScore) => { s.playbackOrder.reverse(); },
  ])("rejects changed performance conditions even when the old note key matches", mutate => {
    const changed = structuredClone(score); mutate(changed);
    expect(scoreKey(changed)).toBe(take.scoreKey);
    expect(() => replayTake(changed, take, take.tuning)).toThrow("演奏条件");
    expect(() => readRehearsalTake(JSON.stringify(take), changed, "P1")).toThrow("演奏条件");
    expect(() => profileFromTake(changed, take)).toThrow("演奏条件");
  });
  it("does not depend on object property order", () => {
    const reordered = Object.fromEntries(Object.entries(score).reverse()) as unknown as ParsedScore;
    expect(takeScoreContext(reordered)).toBe(take.scoreContext);
    expect(takeScoreContext(JSON.parse(JSON.stringify(score)))).toBe(take.scoreContext);
  });
  it("retains legacy notes and feedback without treating missing conditions as verified", () => {
    const legacy = { ...take, experience: { reuse: "unsure" as const, notes: "入りを調整" } };
    delete legacy.scoreContext;
    const loaded = readRehearsalTake(JSON.stringify(legacy), score, "P1");
    expect(loaded.experience).toEqual(legacy.experience);
    expect(loaded.scoreContext).toBeUndefined();
    expect(() => replayTake(score, loaded, loaded.tuning)).toThrow("旧形式");
    expect(() => profileFromTake(score, loaded)).toThrow("旧形式");
  });
});
