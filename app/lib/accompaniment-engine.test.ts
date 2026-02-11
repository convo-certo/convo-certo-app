import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseMusicXML } from "./musicxml-parser";
import { AccompanimentEngine } from "./accompaniment-engine";
import type { AccompanimentState, NoteEvent } from "./types";

vi.stubGlobal(
  "performance",
  (() => {
    let t = 0;
    return { now: () => (t += 10) };
  })()
);

function loadFixture(filename: string): string {
  return readFileSync(
    resolve(__dirname, "../../public/scores", filename),
    "utf-8"
  );
}

describe("AccompanimentEngine with Mozart K.622", () => {
  let engine: AccompanimentEngine;
  let states: AccompanimentState[];
  let outputNotes: Array<{ note: NoteEvent; time: number }>;

  beforeEach(() => {
    engine = new AccompanimentEngine();
    states = [];
    outputNotes = [];

    engine.setStateChangeCallback((state) => {
      states.push({ ...state });
    });

    engine.setNoteOutputCallback((note, time) => {
      outputNotes.push({ note, time });
    });

    const xml = loadFixture("mozart-k622-adagio.musicxml");
    const score = parseMusicXML(xml);
    engine.loadScore(score);
  });

  it("loads the score and sets initial state", () => {
    const state = engine.getState();
    expect(state.engineState).toBe("waiting");
    expect(state.tempo).toBe(50);
    expect(state.currentMeasure).toBe(1);
  });

  it("starts in waiting state due to wait:2sec directive", () => {
    engine.start();
    const state = engine.getState();
    expect(state.engineState).toBe("waiting");
  });

  it("transitions to listening when MIDI note arrives during waiting", () => {
    engine.start();
    engine.processMidiNote({
      type: "noteon",
      note: 78, // F#5
      velocity: 80,
      timestamp: Date.now(),
    });
    const state = engine.getState();
    expect(state.engineState).toBe("listening");
  });

  it("has accompaniment notes loaded from the piano part", () => {
    const score = parseMusicXML(loadFixture("mozart-k622-adagio.musicxml"));
    const accompParts = score.parts.filter((p) => !p.isSolo);
    expect(accompParts.length).toBeGreaterThan(0);
    expect(accompParts[0].notes.length).toBeGreaterThan(0);
  });

  it("stops cleanly", () => {
    engine.start();
    engine.stop();
    const state = engine.getState();
    expect(state.engineState).toBe("idle");
    expect(state.currentMeasure).toBe(1);
    expect(state.currentBeat).toBe(0);
  });

  it("emits state changes on start/stop", () => {
    engine.start();
    engine.stop();
    expect(states.length).toBeGreaterThanOrEqual(2);
  });
});

describe("AccompanimentEngine soloPartIndex option", () => {
  let engine: AccompanimentEngine;
  let outputNotes: Array<{ note: NoteEvent; time: number }>;

  beforeEach(() => {
    engine = new AccompanimentEngine();
    outputNotes = [];

    engine.setNoteOutputCallback((note, time) => {
      outputNotes.push({ note, time });
    });
  });

  it("uses the specified part as solo and excludes it from accompaniment", () => {
    const xml = loadFixture("sample-duet.musicxml");
    const score = parseMusicXML(xml);
    engine.loadScore(score, { soloPartIndex: 1 });

    engine.start();
    engine.processMidiNote({
      type: "noteon",
      note: 60,
      velocity: 80,
      timestamp: Date.now(),
    });

    vi.useFakeTimers();
    vi.advanceTimersByTime(5000);
    vi.useRealTimers();

    const part1Notes = outputNotes.filter((n) => n.note.partIndex === 1);
    expect(part1Notes).toHaveLength(0);
  });

  it("defaults to isSolo part when soloPartIndex is not specified", () => {
    const xml = loadFixture("mozart-k622-adagio.musicxml");
    const score = parseMusicXML(xml);
    engine.loadScore(score);

    const soloPart = score.parts.find((p) => p.isSolo);
    expect(soloPart).toBeDefined();
  });
});

describe("AccompanimentEngine mute API", () => {
  let engine: AccompanimentEngine;

  beforeEach(() => {
    engine = new AccompanimentEngine();
    const xml = loadFixture("sample-duet.musicxml");
    const score = parseMusicXML(xml);
    engine.loadScore(score);
  });

  it("mutes and unmutes parts", () => {
    engine.mutePart(0);
    expect(engine.isMuted(0)).toBe(true);
    expect(engine.isMuted(1)).toBe(false);

    engine.unmutePart(0);
    expect(engine.isMuted(0)).toBe(false);
  });

  it("returns a copy from getMutedParts", () => {
    engine.mutePart(0);
    const muted = engine.getMutedParts();
    expect(muted.has(0)).toBe(true);
    muted.delete(0);
    expect(engine.isMuted(0)).toBe(true);
  });

  it("clears mutedParts on loadScore", () => {
    engine.mutePart(0);
    expect(engine.isMuted(0)).toBe(true);

    const xml = loadFixture("sample-duet.musicxml");
    const score = parseMusicXML(xml);
    engine.loadScore(score);
    expect(engine.isMuted(0)).toBe(false);
  });
});

describe("AccompanimentEngine with sample-duet", () => {
  let engine: AccompanimentEngine;

  beforeEach(() => {
    engine = new AccompanimentEngine();
    const xml = loadFixture("sample-duet.musicxml");
    const score = parseMusicXML(xml);
    engine.loadScore(score);
  });

  it("loads with the sample duet tempo", () => {
    expect(engine.getState().tempo).toBe(100);
  });

  it("starts in waiting state when sample has wait directive", () => {
    engine.start();
    expect(engine.getState().engineState).toBe("waiting");
  });
});
