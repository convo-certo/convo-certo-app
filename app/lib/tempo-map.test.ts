import { describe, it, expect } from "vitest";
import { TempoMap, createTempoMap } from "./tempo-map";
import type { TempoEvent } from "./types";

describe("TempoMap", () => {
  describe("constant tempo (no events)", () => {
    const map = createTempoMap([], 120);

    it("returns default BPM everywhere", () => {
      expect(map.getBpmAtBeat(0)).toBe(120);
      expect(map.getBpmAtBeat(10)).toBe(120);
      expect(map.getBpmAtBeat(100)).toBe(120);
    });

    it("converts beats to seconds at constant tempo", () => {
      expect(map.beatToSeconds(0)).toBe(0);
      expect(map.beatToSeconds(2)).toBeCloseTo(1.0, 5);
      expect(map.beatToSeconds(4)).toBeCloseTo(2.0, 5);
    });

    it("converts seconds to beats at constant tempo", () => {
      expect(map.secondsToBeat(0)).toBe(0);
      expect(map.secondsToBeat(1.0)).toBeCloseTo(2.0, 5);
      expect(map.secondsToBeat(2.0)).toBeCloseTo(4.0, 5);
    });

    it("round-trips beatToSeconds → secondsToBeat", () => {
      for (const beat of [0, 1, 3.5, 8, 16]) {
        const seconds = map.beatToSeconds(beat);
        expect(map.secondsToBeat(seconds)).toBeCloseTo(beat, 4);
      }
    });
  });

  describe("single instant tempo change", () => {
    const events: TempoEvent[] = [
      { beatPosition: 4, bpm: 60, type: "instant" },
    ];
    const map = createTempoMap(events, 120);

    it("returns default BPM before the change", () => {
      expect(map.getBpmAtBeat(0)).toBe(120);
      expect(map.getBpmAtBeat(3.9)).toBe(120);
    });

    it("returns new BPM at and after the change", () => {
      expect(map.getBpmAtBeat(4)).toBe(60);
      expect(map.getBpmAtBeat(10)).toBe(60);
    });

    it("converts beats to seconds across the change", () => {
      // 0→4 beats at 120bpm = 2s
      expect(map.beatToSeconds(4)).toBeCloseTo(2.0, 5);
      // 4→8 beats at 60bpm = 4s, total = 6s
      expect(map.beatToSeconds(8)).toBeCloseTo(6.0, 5);
    });

    it("converts seconds to beats across the change", () => {
      expect(map.secondsToBeat(2.0)).toBeCloseTo(4.0, 4);
      expect(map.secondsToBeat(6.0)).toBeCloseTo(8.0, 4);
    });

    it("round-trips correctly", () => {
      for (const beat of [0, 2, 4, 6, 10]) {
        const seconds = map.beatToSeconds(beat);
        expect(map.secondsToBeat(seconds)).toBeCloseTo(beat, 3);
      }
    });
  });

  describe("multiple instant tempo changes", () => {
    const events: TempoEvent[] = [
      { beatPosition: 4, bpm: 60, type: "instant" },
      { beatPosition: 8, bpm: 180, type: "instant" },
    ];
    const map = createTempoMap(events, 120);

    it("returns correct BPM in each section", () => {
      expect(map.getBpmAtBeat(2)).toBe(120);
      expect(map.getBpmAtBeat(6)).toBe(60);
      expect(map.getBpmAtBeat(10)).toBe(180);
    });

    it("converts beats to seconds across multiple changes", () => {
      // 0→4 at 120bpm = 2s
      expect(map.beatToSeconds(4)).toBeCloseTo(2.0, 5);
      // 4→8 at 60bpm = 4s, total = 6s
      expect(map.beatToSeconds(8)).toBeCloseTo(6.0, 5);
      // 8→12 at 180bpm = 4/3 s, total = 7.333s
      expect(map.beatToSeconds(12)).toBeCloseTo(6.0 + (4 / 180) * 60, 4);
    });

    it("round-trips correctly", () => {
      for (const beat of [0, 3, 4, 7, 8, 11, 20]) {
        const seconds = map.beatToSeconds(beat);
        expect(map.secondsToBeat(seconds)).toBeCloseTo(beat, 3);
      }
    });
  });

  describe("continuous tempo change (ritardando)", () => {
    const events: TempoEvent[] = [
      {
        beatPosition: 4,
        bpm: 120,
        type: "continuous",
        endBeatPosition: 8,
        endBpm: 60,
      },
    ];
    const map = createTempoMap(events, 120);

    it("returns default BPM before the change", () => {
      expect(map.getBpmAtBeat(0)).toBe(120);
      expect(map.getBpmAtBeat(3)).toBe(120);
    });

    it("interpolates BPM during the change", () => {
      expect(map.getBpmAtBeat(4)).toBe(120);
      expect(map.getBpmAtBeat(6)).toBe(90);
      expect(map.getBpmAtBeat(8)).toBe(60);
    });

    it("returns end BPM after the change", () => {
      expect(map.getBpmAtBeat(10)).toBe(60);
    });

    it("beatToSeconds handles the continuous region", () => {
      // 0→4 at 120bpm = 2s
      expect(map.beatToSeconds(4)).toBeCloseTo(2.0, 5);
      // beat 4→8 is a rit from 120→60, average = 90 bpm, 4 beats / 90 bpm * 60 = 2.667s
      expect(map.beatToSeconds(8)).toBeCloseTo(2.0 + (4 / 90) * 60, 3);
    });

    it("round-trips correctly across the continuous region", () => {
      for (const beat of [0, 2, 4, 5, 6, 7, 8, 10, 16]) {
        const seconds = map.beatToSeconds(beat);
        expect(map.secondsToBeat(seconds)).toBeCloseTo(beat, 2);
      }
    });
  });

  describe("continuous tempo change (accelerando)", () => {
    const events: TempoEvent[] = [
      {
        beatPosition: 0,
        bpm: 60,
        type: "continuous",
        endBeatPosition: 4,
        endBpm: 120,
      },
    ];
    const map = createTempoMap(events, 60);

    it("interpolates BPM during accelerando", () => {
      expect(map.getBpmAtBeat(0)).toBe(60);
      expect(map.getBpmAtBeat(2)).toBe(90);
      expect(map.getBpmAtBeat(4)).toBe(120);
    });

    it("maintains end BPM after accelerando", () => {
      expect(map.getBpmAtBeat(6)).toBe(120);
    });
  });

  describe("mixed instant + continuous events", () => {
    const events: TempoEvent[] = [
      { beatPosition: 4, bpm: 100, type: "instant" },
      {
        beatPosition: 8,
        bpm: 100,
        type: "continuous",
        endBeatPosition: 12,
        endBpm: 60,
      },
      { beatPosition: 16, bpm: 120, type: "instant" },
    ];
    const map = createTempoMap(events, 120);

    it("returns correct BPM in each section", () => {
      expect(map.getBpmAtBeat(2)).toBe(120);
      expect(map.getBpmAtBeat(6)).toBe(100);
      expect(map.getBpmAtBeat(10)).toBe(80);
      expect(map.getBpmAtBeat(14)).toBe(60);
      expect(map.getBpmAtBeat(18)).toBe(120);
    });

    it("round-trips correctly through all sections", () => {
      for (const beat of [0, 2, 4, 6, 8, 10, 12, 14, 16, 20]) {
        const seconds = map.beatToSeconds(beat);
        expect(map.secondsToBeat(seconds)).toBeCloseTo(beat, 2);
      }
    });
  });

  describe("edge cases", () => {
    it("handles events sorted out of order", () => {
      const events: TempoEvent[] = [
        { beatPosition: 8, bpm: 60, type: "instant" },
        { beatPosition: 4, bpm: 100, type: "instant" },
      ];
      const map = createTempoMap(events, 120);
      expect(map.getBpmAtBeat(6)).toBe(100);
      expect(map.getBpmAtBeat(10)).toBe(60);
    });

    it("handles zero-length continuous event", () => {
      const events: TempoEvent[] = [
        {
          beatPosition: 4,
          bpm: 120,
          type: "continuous",
          endBeatPosition: 4,
          endBpm: 60,
        },
      ];
      const map = createTempoMap(events, 120);
      expect(map.getBpmAtBeat(4)).toBe(120);
      expect(map.getBpmAtBeat(5)).toBe(60);
    });

    it("handles beat 0 correctly", () => {
      const map = createTempoMap([], 80);
      expect(map.beatToSeconds(0)).toBe(0);
      expect(map.secondsToBeat(0)).toBe(0);
    });
  });
});
