import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseMusicXML } from "./musicxml-parser";
import { arrangeStarterDuet, starterInstruments } from "./starter-duet";

const original = readFileSync("public/scores/sample-duet.musicxml", "utf8");
const before = parseMusicXML(original);
const documentOf = (xml: string) => new DOMParser().parseFromString(xml, "application/xml");

describe("starter duet instrument editions", () => {
  for (const instrument of starterInstruments) it(`opens ${instrument.labelEn} at its written pitch with unchanged piano accompaniment`, () => {
    const xml = arrangeStarterDuet(original, instrument.id);
    const after = parseMusicXML(xml);
    const doc = documentOf(xml);
    const transposeOctave = "transposeOctave" in instrument ? instrument.transposeOctave : 0;
    expect(after.playerPartId).toBe("P1");
    expect(after.parts[0].name).toBe(instrument.name);
    expect(after.parts[0].midiProgram).toBe(instrument.program - 1);
    expect(after.parts[0].transposeSemitones).toBe(instrument.chromatic + transposeOctave * 12);
    expect(after.parts[0].notes).toEqual(before.parts[0].notes.map(note => ({ ...note, pitch: note.pitch + instrument.octave * 12 })));
    expect(after.parts[1]).toEqual(before.parts[1]);
    expect(after.measures).toEqual(before.measures);
    expect(after.totalBeats).toBe(32);
    expect(doc.querySelector('part[id="P1"] fifths')?.textContent).toBe(String(instrument.fifths));
    expect(doc.querySelector('part[id="P1"] clef > sign')?.textContent).toBe(instrument.clef);
    expect(doc.querySelector('part[id="P1"] clef > line')?.textContent).toBe(String(instrument.line));
    expect(doc.querySelector("rights")?.textContent).toBe("CC0 1.0 Universal — Public Domain Dedication");
    expect(after.title).toContain(instrument.labelEn);
  });

  it("spells the B♭, E♭ and F written notes and octave-transposing saxophone correctly", () => {
    const cases = [
      ["clarinet", "D4", "B4"],
      ["alto-sax", "A4", "F15"],
      ["tenor-sax", "D4", "B4"],
      ["horn", "G4", "E5"],
      ["cello", "C3", "A3"],
    ] as const;
    for (const [instrument, first, highest] of cases) {
      const pitches = [...documentOf(arrangeStarterDuet(original, instrument)).querySelectorAll('part[id="P1"] pitch')].map(pitch => pitch.textContent);
      expect(pitches[0]).toBe(first);
      expect(pitches).toContain(highest);
    }
    expect(documentOf(arrangeStarterDuet(original, "tenor-sax")).querySelector("transpose > octave-change")?.textContent).toBe("-1");
  });
});
