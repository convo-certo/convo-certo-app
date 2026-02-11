import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseMusicXML } from "./musicxml-parser";
import { PlaybackEngine } from "./playback-engine";
import type { PlaybackState, } from "./playback-engine";
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

  beforeEach(() => {
    vi.useFakeTimers();
    engine = new PlaybackEngine();
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
      vi.advanceTimersByTime(1000);
      const state = engine.getState();
      expect(state.currentBeat).toBeGreaterThan(0);
    });

    it("stops cleanly", () => {
      engine.start();
      vi.advanceTimersByTime(500);
      engine.stop();
      const state = engine.getState();
      expect(state.engineState).toBe("idle");
      expect(state.currentMeasure).toBe(1);
      expect(state.currentBeat).toBe(0);
    });

    it("emits state changes", () => {
      engine.start();
      vi.advanceTimersByTime(200);
      engine.stop();
      expect(states.length).toBeGreaterThanOrEqual(2);
    });

    it("schedules accompaniment notes", () => {
      engine.start();
      vi.advanceTimersByTime(5000);
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
      vi.advanceTimersByTime(60000);
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
      vi.advanceTimersByTime(20000);
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
      vi.advanceTimersByTime(120000);
      expect(engine.getState().engineState).toBe("idle");
    });
  });

  describe("excludePartIndex", () => {
    it("excludes the specified part index from playback", () => {
      const xml = loadFixture("sample-duet.musicxml");
      const score = parseMusicXML(xml);
      engine.loadScore(score, { excludePartIndex: 0 });

      engine.start();
      vi.advanceTimersByTime(5000);

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
      vi.advanceTimersByTime(5000);

      const mutedNotes = outputNotes.filter((n) => n.note.partIndex === 1);
      expect(mutedNotes).toHaveLength(0);
    });
  });
});
