import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { parseMusicXML } from "./musicxml-parser";
import { ConcertEngine } from "./concert-engine";
import { defaultEnsembleTuning, readEnsembleTuning } from "./ensemble-tuning";
import { TakeRecorder, replayTake, summarizeTake } from "./rehearsal-takes";

describe("repeatable ensemble tuning", () => {
  const score = parseMusicXML(readFileSync("public/scores/sample-duet.musicxml", "utf8"));
  it("captures performer events and reproduces an identical baseline", () => {
    let now = 0;
    const engine = new ConcertEngine(() => now, false);
    engine.load(score);
    engine.setAnnotations([]);
    const recorder = new TakeRecorder(score, "P1", engine, []);
    const off = engine.observe((event) => recorder.record(event));
    engine.start();
    for (const [i, note] of score.parts[0].notes.slice(0, 5).entries()) {
      now = i * 0.8;
      engine.advance();
      engine.processNote({ type: "noteon", note: note.pitch, velocity: 80, timestamp: now * 1000 });
    }
    now += 0.5;
    engine.advance();
    engine.stop();
    off();
    const take = recorder.finish();
    expect(take.inputs).toHaveLength(5);
    expect(take.changedSetup).toBe(false);
    const a = replayTake(score, take, take.tuning);
    const b = replayTake(score, take, take.tuning);
    expect(summarizeTake(a)).toEqual(summarizeTake(b));
    expect(summarizeTake(a).matches).toBeGreaterThan(0);
    const c = replayTake(score, take, { ...defaultEnsembleTuning, followAmount: 0 });
    expect(summarizeTake(c).averageTempo).toBeGreaterThan(summarizeTake(a).averageTempo);
    expect(() => replayTake({ ...score, totalBeats: 999 }, take, take.tuning)).toThrow();
    const experimental = replayTake(score, take, { ...take.tuning, follower: "sequence" });
    expect(experimental.tuning.follower).toBe("sequence");
    expect(summarizeTake(experimental).matches).toBeGreaterThan(0);
    expect(summarizeTake(replayTake(score, experimental, experimental.tuning))).toEqual(summarizeTake(experimental));
    engine.dispose();
  });

  it("keeps conductor time even if a section player slows down", () => {
    let now = 0;
    const engine = new ConcertEngine(() => now, false);
    engine.load(score); engine.setAnnotations([]); engine.setLeader("conductor"); engine.start();
    for (const [i, note] of score.parts[0].notes.slice(0, 4).entries()) {
      now = i * 0.8;
      engine.advance();
      engine.processNote({ type: "noteon", note: note.pitch, velocity: 80, timestamp: now * 1000 });
    }
    expect(engine.getState().tempo).toBe(score.tempo);
    engine.setAnnotations([{ measureNumber: 1, leader: "player" }]);
    expect(engine.getState().leader).toBe("player");
    engine.dispose();
  });

  it("rejects settings that can destabilize playback", () => {
    expect(() => readEnsembleTuning({ ...defaultEnsembleTuning, responseSeconds: 0 })).toThrow();
    expect(() => readEnsembleTuning({ ...defaultEnsembleTuning, inputDelayMs: Infinity })).toThrow();
  });
});
