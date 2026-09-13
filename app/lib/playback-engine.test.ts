import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseMusicXML } from "./musicxml-parser";
import { PlaybackEngine } from "./playback-engine";
import type { PlaybackState } from "./playback-engine";
import type { NoteEvent } from "./types";

function loadFixture(filename: string): string {
  return readFileSync(
    resolve(__dirname, "../../public/scores", filename),
    "utf-8"
  );
}

describe("PlaybackEngine", () => {
  let engine: PlaybackEngine;
  let states: PlaybackState[];
  let outputNotes: Array<{ note: NoteEvent; time: number }>;
  let mockTime: number;

  beforeEach(() => {
    vi.useFakeTimers();
    mockTime = 0;
    engine = new PlaybackEngine({
      getAudioTime: () => mockTime / 1000,
    });
    states = [];
    outputNotes = [];

    engine.setStateChangeCallback((state) => {
      states.push({ ...state });
    });

    engine.setNoteOutputCallback((note, time) => {
      outputNotes.push({ note, time });
    });
  });

  afterEach(() => {
    engine.stop();
    vi.useRealTimers();
  });

  function advanceTime(ms: number): void {
    mockTime += ms;
    vi.advanceTimersByTime(ms);
  }

  describe("with Mozart K.622", () => {
    beforeEach(() => {
      const xml = loadFixture("mozart-k622-adagio.musicxml");
      const score = parseMusicXML(xml);
      engine.loadScore(score);
    });

    it("loads the score and sets initial state", () => {
      const state = engine.getState();
      expect(state.engineState).toBe("idle");
      expect(state.tempo).toBe(50);
      expect(state.currentMeasure).toBe(1);
      expect(state.currentBeat).toBe(0);
    });

    it("starts playing immediately (no wait directive)", () => {
      engine.start();
      expect(engine.getState().engineState).toBe("playing");
    });

    it("advances beats over time", () => {
      engine.start();
      advanceTime(1000);
      const state = engine.getState();
      expect(state.currentBeat).toBeGreaterThan(0);
    });

    it("stops cleanly", () => {
      engine.start();
      advanceTime(500);
      engine.stop();
      const state = engine.getState();
      expect(state.engineState).toBe("idle");
      expect(state.currentMeasure).toBe(1);
      expect(state.currentBeat).toBe(0);
    });

    it("emits state changes", () => {
      engine.start();
      advanceTime(200);
      engine.stop();
      expect(states.length).toBeGreaterThanOrEqual(2);
    });

    it("schedules accompaniment notes", () => {
      engine.start();
      advanceTime(5000);
      expect(outputNotes.length).toBeGreaterThan(0);
    });

    it("adjusts tempo via setTempo", () => {
      engine.loadScore(parseMusicXML(loadFixture("mozart-k622-adagio.musicxml")));
      engine.setTempo(80);
      expect(engine.getTempo()).toBe(80);
    });

    it("clamps tempo within range", () => {
      engine.setTempo(1);
      expect(engine.getTempo()).toBeGreaterThanOrEqual(12.5);
      engine.setTempo(10000);
      expect(engine.getTempo()).toBeLessThanOrEqual(200);
    });

    it("stops automatically at end of score", () => {
      engine.setTempo(200);
      engine.start();
      advanceTime(60000);
      expect(engine.getState().engineState).toBe("idle");
    });
  });

  describe("with sample duet", () => {
    beforeEach(() => {
      const xml = loadFixture("sample-duet.musicxml");
      const score = parseMusicXML(xml);
      engine.loadScore(score);
    });

    it("loads with sample duet tempo", () => {
      expect(engine.getState().tempo).toBe(100);
    });

    it("plays through the short score", () => {
      engine.start();
      advanceTime(20000);
      expect(engine.getState().engineState).toBe("idle");
    });
  });

  describe("with Mozart K.581 (repeats)", () => {
    beforeEach(() => {
      const xml = loadFixture("mozart-k581-trio.musicxml");
      const score = parseMusicXML(xml);
      engine.loadScore(score);
    });

    it("loads with initial measure 0 (pickup)", () => {
      expect(engine.getState().currentMeasure).toBe(0);
    });

    it("stops automatically after playing through repeats", () => {
      engine.setTempo(200);
      engine.start();
      advanceTime(120000);
      expect(engine.getState().engineState).toBe("idle");
    });
  });

  describe("excludePartIndex", () => {
    it("excludes the specified part index from playback", () => {
      const xml = loadFixture("sample-duet.musicxml");
      const score = parseMusicXML(xml);
      engine.loadScore(score, { excludePartIndex: 0 });

      engine.start();
      advanceTime(5000);

      const part0Notes = outputNotes.filter((n) => n.note.partIndex === 0);
      const part1Notes = outputNotes.filter((n) => n.note.partIndex === 1);
      expect(part0Notes).toHaveLength(0);
      expect(part1Notes.length).toBeGreaterThan(0);
    });

    it("clears mutedParts on reload", () => {
      const xml = loadFixture("sample-duet.musicxml");
      const score = parseMusicXML(xml);
      engine.loadScore(score);
      engine.mutePart(1);
      expect(engine.isMuted(1)).toBe(true);

      engine.loadScore(score);
      expect(engine.isMuted(1)).toBe(false);
    });
  });

  describe("mute functionality", () => {
    beforeEach(() => {
      const xml = loadFixture("sample-duet.musicxml");
      const score = parseMusicXML(xml);
      engine.loadScore(score);
    });

    it("mutes and unmutes parts", () => {
      engine.mutePart(1);
      expect(engine.isMuted(1)).toBe(true);
      expect(engine.isMuted(0)).toBe(false);

      engine.unmutePart(1);
      expect(engine.isMuted(1)).toBe(false);
    });

    it("returns a copy from getMutedParts", () => {
      engine.mutePart(1);
      const muted = engine.getMutedParts();
      expect(muted.has(1)).toBe(true);
      muted.delete(1);
      expect(engine.isMuted(1)).toBe(true);
    });

    it("skips muted part notes during playback", () => {
      engine.mutePart(1);
      engine.start();
      advanceTime(5000);

      const mutedNotes = outputNotes.filter((n) => n.note.partIndex === 1);
      expect(mutedNotes).toHaveLength(0);
    });
  });

  describe("tempo map integration", () => {
    it("uses tempo map for beat calculation", () => {
      const xml = loadFixture("sample-duet.musicxml");
      const score = parseMusicXML(xml);
      engine.loadScore(score);

      engine.setTempoMap([
        { beatPosition: 4, bpm: 60, type: "instant" },
      ]);

      engine.start();
      advanceTime(3000);

      const state = engine.getState();
      expect(state.currentBeat).toBeGreaterThan(0);
    });
  });
});

describe("practice transport", () => {
  let engine: PlaybackEngine;
  let now: number;
  let notes: Array<{ note: NoteEvent; audioTime?: number }>;

  beforeEach(() => {
    vi.useFakeTimers();
    now = 0;
    notes = [];
    engine = new PlaybackEngine({ getAudioTime: () => now });
    const score = parseMusicXML(loadFixture("sample-duet.musicxml"));
    score.tempo = 120;
    score.parts[0].notes = Array.from({ length: 16 }, (_, startBeat) => ({
      pitch: 60, startBeat, durationBeats: 0.5, velocity: 80, partIndex: 0,
    }));
    score.parts = [score.parts[0]];
    engine.loadScore(score);
    engine.setNoteOutputCallback((note, _delay, audioTime) => notes.push({ note, audioTime }));
  });

  afterEach(() => {
    engine.stop();
    vi.useRealTimers();
  });

  function advance(seconds: number) {
    for (let i = 0; i < Math.round(seconds / 0.025); i++) {
      now += 0.025;
      vi.advanceTimersByTime(25);
    }
  }

  it("plays the first note once, including after restart", () => {
    engine.start();
    advance(0.2);
    expect(notes.filter(({ note }) => note.startBeat === 0)).toHaveLength(1);
    engine.stop();
    engine.start();
    expect(notes.filter(({ note }) => note.startBeat === 0)).toHaveLength(2);
  });

  it("starts at the position selected while stopped", () => {
    engine.seekToBeat(4);
    engine.start();
    expect(notes[0].note.startBeat).toBe(4);
    advance(0.5);
    expect(engine.getState().currentBeat).toBeCloseTo(5);
    expect(notes.every(({ note }) => note.startBeat >= 4)).toBe(true);
  });

  it("keeps the selected position through count-in and ignores duplicate starts", () => {
    engine.seekToBeat(4);
    engine.setCountInMeasures(1);
    engine.start();
    advance(1);
    engine.start();
    expect(notes).toHaveLength(0);
    advance(1.05);
    expect(engine.getState().countingIn).toBe(false);
    expect(notes[0].note.startBeat).toBe(4);
    expect(notes[0].audioTime).toBeCloseTo(2, 1);
  });

  it("repeats the loop start without scheduling notes beyond its end", () => {
    engine.setLoop(0, 2);
    engine.start();
    advance(2.2);
    expect(notes.filter(({ note }) => note.startBeat === 0).length).toBeGreaterThanOrEqual(3);
    expect(notes.every(({ note }) => note.startBeat < 2)).toBe(true);
  });

  it("does not replay old clicks when the metronome is enabled mid-song", () => {
    const clicks = vi.fn();
    engine.setClickOutputCallback(clicks);
    engine.start();
    advance(2.2);
    engine.setMetronomeEnabled(true);
    advance(0.4);
    expect(clicks).toHaveBeenCalledTimes(1);
    expect(clicks.mock.calls[0][1]).toBeGreaterThanOrEqual(2.2);
  });

  it("resets position, count-in and loop when loading another score", () => {
    engine.setLoop(4, 8);
    engine.seekToBeat(4);
    engine.setCountInMeasures(1);
    engine.start();
    engine.loadScore(parseMusicXML(loadFixture("sample-duet.musicxml")));
    expect(engine.getState()).toMatchObject({ currentBeat: 0, engineState: "idle", countingIn: false });
    expect(engine.getLoop()).toEqual({ startBeat: null, endBeat: null });
    advance(3);
    expect(notes).toHaveLength(0);
  });

  it("keeps playing when only the loop end is set", () => {
    engine.setLoop(null, 2);
    engine.start();
    advance(2);
    expect(notes.some(({ note }) => note.startBeat > 2)).toBe(true);
  });

  it("counts eighth-note beats using the time signature denominator", () => {
    const score = parseMusicXML(loadFixture("sample-duet.musicxml"));
    score.tempo = 120;
    score.timeSignature = { beats: 6, beatType: 8 };
    score.timeSignatureChanges = [];
    engine.loadScore(score);
    const clicks = vi.fn();
    engine.setClickOutputCallback(clicks);
    engine.setCountInMeasures(1);
    engine.start();
    advance(1.475);
    expect(engine.getState().countingIn).toBe(true);
    expect(clicks).toHaveBeenCalledTimes(6);
    expect(clicks.mock.calls.map((call) => call[1])).toEqual([0, 0.25, 0.5, 0.75, 1, 1.25]);
    advance(0.05);
    expect(engine.getState().countingIn).toBe(false);
  });

  it("rejects reversed loops and non-finite seek positions", () => {
    engine.setLoop(8, 4);
    expect(engine.getLoop().endBeat).toBeNull();
    engine.seekToBeat(NaN);
    expect(engine.getState().currentBeat).toBe(0);
  });
});
