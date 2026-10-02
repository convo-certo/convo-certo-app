import { describe, expect, it } from "vitest";
import type { NoteEvent, ParsedScore } from "./types";
import { firstPlayerExcerpt } from "./practice-excerpt";

const note = (startBeat: number, overrides: Partial<NoteEvent> = {}): NoteEvent => ({ pitch: 67, velocity: 80, startBeat, durationBeats: 1, partIndex: 0, ...overrides });
const score = (notes: NoteEvent[], overrides: Partial<ParsedScore> = {}): ParsedScore => ({
  title: "Entry practice", tempo: 100, timeSignature: { beats: 4, beatType: 4 },
  parts: [{ id: "flute", name: "Flute", isSolo: true, notes }],
  measures: [], totalMeasures: 6, totalBeats: 24, playbackOrder: [0, 1, 2, 3, 4, 5],
  measureNumbers: [1, 2, 3, 4, 5, 6], measureStartBeats: [0, 4, 8, 12, 16, 20], timeSignatureChanges: [], ...overrides,
});

describe("first player practice passage", () => {
  it("chooses four bars from the first sounding note regardless of note order", () => {
    const piece = score([note(16), note(0, { velocity: 0 }), note(1, { durationBeats: 0 }), note(8.5), note(4, { pitch: NaN })]);
    expect(firstPlayerExcerpt(piece)).toEqual({ first: 3, last: 6 });
    expect(firstPlayerExcerpt(piece, true)).toEqual({ first: 2, last: 6 });
  });

  it("returns no passage for empty, silent or malformed player lines", () => {
    expect(firstPlayerExcerpt(score([]))).toBeNull();
    expect(firstPlayerExcerpt(score([note(0, { velocity: 0 }), note(1, { durationBeats: 0 }), note(2, { durationBeats: Infinity }), note(-1), note(24), note(NaN)]))).toBeNull();
    expect(firstPlayerExcerpt(score([note(0)], { parts: [] }))).toBeNull();
    expect(firstPlayerExcerpt(score([note(0)], { measureStartBeats: [] }))).toBeNull();
  });

  it("keeps a first-bar entry at the beginning and clips a late entry at the score end", () => {
    expect(firstPlayerExcerpt(score([note(0)]), true)).toEqual({ first: 1, last: 4 });
    expect(firstPlayerExcerpt(score([note(20.5)]))).toEqual({ first: 6, last: 6 });
    expect(firstPlayerExcerpt(score([note(20.5)]), true)).toEqual({ first: 5, last: 6 });
  });

  it("uses cumulative bar starts with changing meters", () => {
    const piece = score([note(8.25)], { measureStartBeats: [0, 3, 8, 10, 15, 16], totalBeats: 20 });
    expect(firstPlayerExcerpt(piece)).toEqual({ first: 3, last: 6 });
    expect(firstPlayerExcerpt(piece, true)).toEqual({ first: 2, last: 6 });
  });

  it("keeps expanded playback positions when an entry follows repeated bars", () => {
    const piece = score([note(16)], { playbackOrder: [0, 1, 0, 1, 2, 3], measureNumbers: [1, 2, 3, 4], totalMeasures: 4 });
    expect(firstPlayerExcerpt(piece)).toEqual({ first: 5, last: 6 });
    expect(firstPlayerExcerpt(piece, true)).toEqual({ first: 4, last: 6 });
  });

  it("uses the selected player part instead of another instrument's earlier entry", () => {
    const piece = score([note(0)], { playerPartId: "viola", parts: [
      { id: "flute", name: "Flute", isSolo: true, notes: [note(0)] },
      { id: "viola", name: "Viola", isSolo: false, notes: [note(12, { partIndex: 1 })] },
    ] });
    expect(firstPlayerExcerpt(piece)).toEqual({ first: 4, last: 6 });
  });
});
