import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { parseMusicXML } from "./musicxml-parser";
import { ConcertEngine } from "./concert-engine";
import { TakeRecorder } from "./rehearsal-takes";
import { profileFromTake, readReferenceProfile, referenceAt } from "./reference-profile";
import { workSignature } from "./score-signature";
import { assignPerformanceSeat, listPerformanceSeats } from "./performance-seats";

it("extracts bounded expression from matched input and rejects a different edition", () => {
  const score = parseMusicXML(readFileSync("public/scores/sample-duet.musicxml", "utf8"));
  const engine = new ConcertEngine(() => 0, false); engine.load(score);
  const take = new TakeRecorder(score, score.parts[0].id, engine, []).finish();
  for (const [i, note] of score.parts[0].notes.slice(0, 5).entries()) {
    const elapsed = note.startBeat * 0.6;
    take.inputs.push({ elapsed, message: { type: "noteon", note: note.pitch, velocity: 65 + i * 10, timestamp: elapsed * 1000 } });
    take.states.push({ elapsed, state: { status: "playing", beat: note.startBeat, matchedBeat: note.startBeat, measure: 1, tempo: 100, confidence: 1, mode: "follow" } });
  }
  const profile = profileFromTake(score, take);
  expect(readReferenceProfile(JSON.stringify(profile))).toEqual(profile);
  expect(profile.points.length).toBeGreaterThanOrEqual(4);
  expect(referenceAt(profile, -1).tempoRatio).toBe(1);
  expect(referenceAt(profile, profile.points[0].beat).gain).toBeLessThan(profile.points.at(-1)!.gain);
  engine.setReference(profile);
  const modified = structuredClone(score); modified.parts[0].notes[0].pitch++;
  engine.load(modified);
  expect(() => engine.setReference(profile)).toThrow();
  expect(() => readReferenceProfile('null')).toThrow();
  engine.dispose();
});
it("keeps a work identity when voices are assigned to separate seats", () => {
  const score = parseMusicXML(readFileSync("public/repertoire/ensemble/beethoven-op73-2.musicxml", "utf8"));
  const seat = listPerformanceSeats(score).find((seat) => seat.voice === "2")!;
  expect(workSignature(assignPerformanceSeat(score, seat.id))).toBe(workSignature(score));
});
