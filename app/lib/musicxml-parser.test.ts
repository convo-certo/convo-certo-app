import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseMusicXML, getRoleForMeasure } from "./musicxml-parser";

function loadFixture(filename: string): string {
  return readFileSync(
    resolve(__dirname, "../../public/scores", filename),
    "utf-8"
  );
}

describe("parseMusicXML", () => {
  describe("Mozart K.622 Adagio", () => {
    const xml = loadFixture("mozart-k622-adagio.musicxml");
    const score = parseMusicXML(xml);

    it("parses the title", () => {
      expect(score.title).toContain("K.622");
    });

    it("parses the tempo as Adagio (50 BPM)", () => {
      expect(score.tempo).toBe(50);
    });

    it("parses 3/4 time signature", () => {
      expect(score.timeSignature.beats).toBe(3);
      expect(score.timeSignature.beatType).toBe(4);
    });

    it("has two parts (Clarinet solo + Piano accompaniment)", () => {
      expect(score.parts).toHaveLength(2);
      expect(score.parts[0].name).toContain("Clarinet");
      expect(score.parts[1].name).toContain("Piano");
    });

    it("marks the first part as solo", () => {
      expect(score.parts[0].isSolo).toBe(true);
      expect(score.parts[1].isSolo).toBe(false);
    });

    it("has 32 measures", () => {
      expect(score.totalMeasures).toBe(32);
    });

    it("has notes in the clarinet part", () => {
      expect(score.parts[0].notes.length).toBeGreaterThan(0);
    });

    it("has notes in the piano part", () => {
      expect(score.parts[1].notes.length).toBeGreaterThan(0);
    });

    it("parses ConvoCerto annotations", () => {
      expect(score.measures.length).toBeGreaterThanOrEqual(2);
    });

    it("has a Follow:moderate annotation on measure 1", () => {
      const m1 = score.measures.find((m) => m.measureNumber === 1);
      expect(m1).toBeDefined();
      expect(m1?.role?.mode).toBe("follow");
      expect(m1?.role?.strength).toBe("moderate");
    });

    it("has a wait:2sec directive on measure 1", () => {
      const m1 = score.measures.find((m) => m.measureNumber === 1);
      expect(m1?.wait?.type).toBe("wait");
      expect(m1?.wait?.duration).toBe(2);
    });

    it("has a Follow:strong annotation on measure 9 (solo entry)", () => {
      const m9 = score.measures.find((m) => m.measureNumber === 9);
      expect(m9).toBeDefined();
      expect(m9?.role?.mode).toBe("follow");
      expect(m9?.role?.strength).toBe("strong");
    });

    it("has a Lead:moderate annotation on measure 25", () => {
      const m25 = score.measures.find((m) => m.measureNumber === 25);
      expect(m25).toBeDefined();
      expect(m25?.role?.mode).toBe("lead");
      expect(m25?.role?.strength).toBe("moderate");
    });

    it("clarinet rests for the first 8 bars (orchestra intro)", () => {
      const clarinetNotes = score.parts[0].notes;
      const firstNoteStartBeat = Math.min(
        ...clarinetNotes.map((n) => n.startBeat)
      );
      expect(firstNoteStartBeat).toBeGreaterThanOrEqual(24);
    });

    it("has linear playbackOrder (no repeats)", () => {
      const expected = Array.from(
        { length: score.measureNumbers.length },
        (_, i) => i
      );
      expect(score.playbackOrder).toEqual(expected);
    });

    it("totalBeats matches playbackOrder length * beats", () => {
      expect(score.totalBeats).toBe(
        score.playbackOrder.length * score.timeSignature.beats
      );
    });
  });

  describe("Mozart K.581 Trio", () => {
    const xml = loadFixture("mozart-k581-trio.musicxml");
    const score = parseMusicXML(xml);

    it("parses the title", () => {
      expect(score.title).toContain("K. 581");
    });

    it("parses tempo as 120 BPM", () => {
      expect(score.tempo).toBe(120);
    });

    it("parses 3/4 time signature", () => {
      expect(score.timeSignature.beats).toBe(3);
      expect(score.timeSignature.beatType).toBe(4);
    });

    it("has 5 parts (Clarinet + String Quartet)", () => {
      expect(score.parts).toHaveLength(5);
      expect(score.parts[0].name).toContain("clarinet");
    });

    it("marks clarinet as solo", () => {
      expect(score.parts[0].isSolo).toBe(true);
      expect(score.parts[1].isSolo).toBe(false);
    });

    it("has 16 measures", () => {
      expect(score.totalMeasures).toBe(16);
    });

    it("has clarinet notes", () => {
      expect(score.parts[0].notes.length).toBeGreaterThan(0);
    });

    it("parses ConvoCerto annotations", () => {
      expect(score.measures.length).toBe(5);
    });

    it("has Follow:moderate on measure 1", () => {
      const m1 = score.measures.find((m) => m.measureNumber === 1);
      expect(m1?.role?.mode).toBe("follow");
      expect(m1?.role?.strength).toBe("moderate");
    });

    it("has Follow:strong on measure 5", () => {
      const m5 = score.measures.find((m) => m.measureNumber === 5);
      expect(m5?.role?.mode).toBe("follow");
      expect(m5?.role?.strength).toBe("strong");
    });

    it("has Lead:moderate on measure 9", () => {
      const m9 = score.measures.find((m) => m.measureNumber === 9);
      expect(m9?.role?.mode).toBe("lead");
      expect(m9?.role?.strength).toBe("moderate");
    });

    it("has Lead:strong on measure 13", () => {
      const m13 = score.measures.find((m) => m.measureNumber === 13);
      expect(m13?.role?.mode).toBe("lead");
      expect(m13?.role?.strength).toBe("strong");
    });

    it("has Follow:light on measure 16", () => {
      const m16 = score.measures.find((m) => m.measureNumber === 16);
      expect(m16?.role?.mode).toBe("follow");
      expect(m16?.role?.strength).toBe("light");
    });

    it("has 18 physical measure slots (m0 through m16 plus X1)", () => {
      expect(score.measureNumbers).toHaveLength(18);
    });

    it("maps slot 0 to measure 0 (pickup)", () => {
      expect(score.measureNumbers[0]).toBe(0);
    });

    it("maps slot 13 to measure -1 (X1 implicit measure)", () => {
      expect(score.measureNumbers[13]).toBe(-1);
    });

    it("expands repeats in playbackOrder (36 steps)", () => {
      expect(score.playbackOrder).toHaveLength(36);
    });

    it("plays first section twice then second section twice", () => {
      const first13 = score.playbackOrder.slice(0, 13);
      const second13 = score.playbackOrder.slice(13, 26);
      expect(first13).toEqual(second13);

      const firstLast5 = score.playbackOrder.slice(26, 31);
      const secondLast5 = score.playbackOrder.slice(31, 36);
      expect(firstLast5).toEqual(secondLast5);
    });

    it("expands notes for repeated playback", () => {
      const totalBeats = score.playbackOrder.length * score.timeSignature.beats;
      expect(score.totalBeats).toBe(totalBeats);
      for (const part of score.parts) {
        const maxBeat = Math.max(...part.notes.map((n) => n.startBeat));
        expect(maxBeat).toBeLessThan(totalBeats);
      }
    });
  });

  describe("sample-duet.musicxml", () => {
    const xml = loadFixture("sample-duet.musicxml");
    const score = parseMusicXML(xml);

    it("parses as a duet", () => {
      expect(score.parts).toHaveLength(2);
    });

    it("has correct tempo", () => {
      expect(score.tempo).toBe(100);
    });
  });
});

describe("getRoleForMeasure", () => {
  const xml = loadFixture("mozart-k622-adagio.musicxml");
  const score = parseMusicXML(xml);

  it("returns Follow:moderate for measure 1", () => {
    const role = getRoleForMeasure(score.measures, 1);
    expect(role.mode).toBe("follow");
    expect(role.strength).toBe("moderate");
  });

  it("returns Follow:strong for measure 9 (solo entry)", () => {
    const role = getRoleForMeasure(score.measures, 9);
    expect(role.mode).toBe("follow");
    expect(role.strength).toBe("strong");
  });

  it("carries forward Follow:strong to measure 15", () => {
    const role = getRoleForMeasure(score.measures, 15);
    expect(role.mode).toBe("follow");
    expect(role.strength).toBe("strong");
  });

  it("returns Lead:moderate for measure 25", () => {
    const role = getRoleForMeasure(score.measures, 25);
    expect(role.mode).toBe("lead");
    expect(role.strength).toBe("moderate");
  });
});
