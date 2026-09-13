import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { ConcertEngine } from "./concert-engine";
import { parseMusicXML } from "./musicxml-parser";
import { readRehearsalTake } from "./rehearsal-take-file";
import { replayTake, summarizeTake, TakeRecorder, type RehearsalTake } from "./rehearsal-takes";

const score = parseMusicXML(readFileSync("public/scores/sample-duet.musicxml", "utf8"));
function recorded(tempo = 120) {
  let now = 0;
  const engine = new ConcertEngine(() => now, false);
  engine.load(score);
  engine.setAnnotations([]);
  engine.setTempo(tempo);
  const recorder = new TakeRecorder(score, "P1", engine, []);
  const off = engine.observe(event => recorder.record(event));
  engine.start();
  for (const [i, note] of score.parts[0].notes.slice(0, 5).entries()) {
    now = i * 0.7;
    engine.advance();
    engine.processNote({ type: "noteon", note: note.pitch, velocity: 80, timestamp: now * 1000 });
  }
  now += 0.1;
  engine.stop(); off(); engine.dispose();
  return recorder.finish();
}

describe("portable rehearsal takes", () => {
  it("restores previous exports, feedback and identical simulated responses", () => {
    const take = recorded();
    take.experience = { reuse: "unsure", notes: "息継ぎ後の入りを試す" };
    const restored = readRehearsalTake(JSON.stringify(take), score, "P1");
    expect(restored).toEqual(take);
    expect(summarizeTake(replayTake(score, restored, restored.tuning))).toEqual(summarizeTake(replayTake(score, take, take.tuning)));
    delete take.experience;
    expect(readRehearsalTake(JSON.stringify(take), score, "P1").experience).toBeUndefined();
  });
  it("accepts the engine's supported 300 BPM setting", () => {
    const take = recorded(300);
    expect(readRehearsalTake(JSON.stringify(take), score, "P1").baseTempo).toBe(300);
  });
  it("rejects a different score, transposition or seat", () => {
    const text = JSON.stringify(recorded());
    expect(() => readRehearsalTake(text, score, "P2")).toThrow("同じ譜面");
    expect(() => readRehearsalTake(text, { ...score, totalBeats: score.totalBeats + 1 }, "P1")).toThrow("同じ譜面");
  });
  it.each([
    (take: RehearsalTake) => { take.inputs[1].elapsed = -1; },
    (take: RehearsalTake) => { take.inputs[1].message.note = 128; },
    (take: RehearsalTake) => { take.states[0].state.tempo = Infinity; },
    (take: RehearsalTake) => { take.duration = 900; },
    (take: RehearsalTake) => { take.cues = [1, 0]; },
    (take: RehearsalTake) => { take.practice.countInBars = 100000; },
    (take: RehearsalTake) => { take.inputs = Array(20001).fill(take.inputs[0]); },
    (take: RehearsalTake) => { take.experience = { reuse: "yes", notes: "x".repeat(2001) }; },
    (take: RehearsalTake) => { take.tuning.responseSeconds = 0; },
  ])("rejects corrupted or excessive replay data", mutate => {
    const take = recorded(); mutate(take);
    expect(() => readRehearsalTake(JSON.stringify(take), score, "P1")).toThrow();
  });
  it("rejects invalid JSON and oversized text", () => {
    for (const text of ["{", "null", "[]", " ".repeat(16000001)]) expect(() => readRehearsalTake(text, score, "P1")).toThrow();
  });
});
