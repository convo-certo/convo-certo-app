import { describe, expect, it } from "vitest";
import { SequenceFollower } from "./sequence-follower";
import { PerformanceFollower } from "./performance-follower";
import { readEnsembleTuning, defaultEnsembleTuning } from "./ensemble-tuning";
import type { NoteEvent } from "./types";

const notes = (pitches: number[], spacing = 1): NoteEvent[] => pitches.map((pitch, i) => ({ pitch, startBeat: i * spacing, durationBeats: spacing * 0.8, velocity: 80, partIndex: 0 }));
const input = (note: number, timestamp: number) => ({ type: "noteon" as const, note, timestamp, velocity: 80, channel: 0 });

describe("experimental sequence following", () => {
  it("follows a 50ms passage that the standard debounce misses", () => {
    const score = notes([60, 62, 64, 65, 67, 69, 71, 72], 0.1);
    const counts = [new PerformanceFollower(), new SequenceFollower()].map((follower) => {
      follower.load(score, 120);
      return score.filter((note, index) => follower.match(input(note.pitch, index * 50), note.startBeat, 120)?.beat === note.startBeat).length;
    });
    expect(counts).toEqual([4, 8]);
  });

  it("ignores an extra wrong note and bridges a missing onset", () => {
    const follower = new SequenceFollower();
    follower.load(notes([60, 62, 64, 65, 67]), 120);
    expect(follower.match(input(60, 0), 0, 120)?.beat).toBe(0);
    expect(follower.match(input(99, 200), 0.4, 120)).toBeNull();
    expect(follower.match(input(64, 1000), 2, 120)?.beat).toBe(2);
    expect(follower.match(input(65, 1500), 3, 120)?.beat).toBe(3);
  });

  it("continues a repeated pitch phrase when the accompaniment prediction drifts", () => {
    const follower = new SequenceFollower();
    follower.load(notes([60, 60, 60, 62, 64, 60, 60, 62]), 120);
    for (let i = 0; i < 5; i++) expect(follower.match(input([60, 60, 60, 62, 64][i], i * 500), i === 0 ? 0 : i + 1.4, 120)?.beat).toBe(i);
  });

  it("reports ambiguity instead of full confidence at an uncertain entrance", () => {
    const follower = new SequenceFollower();
    follower.load(notes([60, 60, 60]), 120);
    expect(follower.match(input(60, 0), 0.5, 120)?.confidence).toBeLessThan(0.5);
  });

  it("resets at a user seek and rejects non-onsets or stale timestamps", () => {
    const follower = new SequenceFollower();
    follower.load(notes([60, 62, 64]), 120);
    follower.match(input(60, 100), 0, 120);
    expect(follower.match(input(62, 90), 1, 120)).toBeNull();
    expect(follower.match({ ...input(62, 600), velocity: 0 }, 1, 120)).toBeNull();
    follower.reset(90);
    expect(follower.match(input(60, 1000), 0, 90)?.tempo).toBe(90);
  });

  it("keeps correct position through 3600 simulated seconds", () => {
    const score = notes(Array.from({ length: 7200 }, (_, i) => 60 + i % 12));
    const follower = new SequenceFollower();
    follower.load(score, 120);
    let matches = 0;
    score.forEach((note, i) => { if (follower.match(input(note.pitch, i * 500), i, 120)?.beat === i) matches++; });
    expect(matches).toBe(7200);
  });

  it("reads older settings and rejects unknown experimental methods", () => {
    const { follower, ...legacy } = defaultEnsembleTuning;
    expect(readEnsembleTuning(legacy).follower).toBe("nearest");
    expect(() => readEnsembleTuning({ ...legacy, follower: "unknown" })).toThrow();
  });

  it.each([60, 120, 180])("resumes after long gaps without learning a false slowdown at %i BPM", (tempo) => {
    for (const gap of [2200, 5000, 15000]) {
      const follower = new SequenceFollower();
      const score = notes([60, 62, 64, 65, 67, 69, 71, 72]);
      follower.load(score, tempo);
      for (const [index, note] of score.entries()) {
        const timestamp = index * 60000 / tempo + (index >= 4 ? gap : 0);
        const result = follower.match(input(note.pitch, timestamp), timestamp * tempo / 60000, tempo);
        expect(result?.beat).toBe(index);
        expect(result?.tempo).toBeCloseTo(tempo);
      }
    }
  });

  it("rejects a distant early note and a wrong note after a long gap", () => {
    const follower = new SequenceFollower();
    follower.load(notes([60, 62, 64, 65, 67, 69, 71, 72]), 120);
    expect(follower.match(input(60, 0), 0, 120)?.beat).toBe(0);
    expect(follower.match(input(72, 100), 0.2, 120)).toBeNull();
    expect(follower.match(input(99, 5000), 10, 120)).toBeNull();
    expect(follower.match(input(62, 5500), 11, 120)?.beat).toBe(1);
    expect(follower.match(input(64, 6000), 12, 120)?.tempo).toBe(120);
  });

  it.each([60, 120, 180])("learns sustained slower playing after two consistent intervals at %i BPM", (tempo) => {
    const follower = new SequenceFollower();
    const score = notes([60, 62, 64, 65, 67, 69, 71, 72, 74, 76], 2);
    follower.load(score, tempo);
    const results = score.map((note, index) => follower.match(input(note.pitch, index * 120000 / (tempo * 0.45)), index * 2 / 0.45, tempo));
    expect(results.map(result => result?.beat)).toEqual(score.map(note => note.startBeat));
    expect(results[1]?.tempo).toBe(tempo);
    expect(results[2]!.tempo).toBeLessThan(tempo);
    expect(results.at(-1)!.tempo).toBeGreaterThanOrEqual(tempo * 0.45);
    expect(results.at(-1)!.tempo).toBeLessThan(tempo * 0.52);
  });

  it("keeps isolated pauses, inconsistent long intervals and skipped notes out of slow-tempo confirmation", () => {
    for (const intervals of [[2200, 1000, 2200, 1000], [2200, 3000, 2200, 3000]]) {
      const follower = new SequenceFollower();
      const score = notes([60, 62, 64, 65, 67], 2);
      follower.load(score, 120);
      let time = 0;
      score.forEach((note, index) => {
        if (index) time += intervals[index - 1];
        expect(follower.match(input(note.pitch, time), time / 500, 120)?.tempo).toBe(120);
      });
    }
    const follower = new SequenceFollower();
    follower.load(notes([60, 62, 64, 65, 67], 2), 120);
    follower.match(input(60, 0), 0, 120);
    follower.match(input(62, 2200), 4.4, 120);
    expect(follower.match(input(65, 6600), 13.2, 120)).toBeNull();
  });

  it("requires fresh confirmation after an extra note or a reset", () => {
    const follower = new SequenceFollower();
    follower.load(notes([60, 62, 64, 65], 2), 120);
    follower.match(input(60, 0), 0, 120);
    follower.match(input(62, 2200), 4.4, 120);
    expect(follower.match(input(99, 2300), 4.6, 120)).toBeNull();
    expect(follower.match(input(64, 4400), 8.8, 120)?.tempo).toBe(120);
    follower.reset(120);
    follower.match(input(60, 6000), 0, 120);
    expect(follower.match(input(62, 8200), 4.4, 120)?.tempo).toBe(120);
  });
});
