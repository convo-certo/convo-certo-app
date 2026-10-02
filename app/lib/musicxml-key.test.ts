import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { parseMusicXML, updateMusicXMLAnnotation } from "./musicxml-parser";
import { keyChoices, keyLabel, transposeMusicXMLKey, writtenScoreKey } from "./musicxml-key";

const duet = readFileSync("public/scores/sample-duet.musicxml", "utf8");
const key = (fifths: number) => ({ fifths, mode: "major" as const });
const doc = (xml: string) => new DOMParser().parseFromString(xml, "application/xml");

describe("MusicXML key editing", () => {
  it("rewrites the full score and keeps timing, annotations and repeat order", () => {
    const annotated = updateMusicXMLAnnotation(duet, 2, { memo: "ここで息を合わせる", expression: { preset: "tender", amount: 0.7 } });
    const result = transposeMusicXMLKey(annotated, key(2), "P1");
    const before = parseMusicXML(annotated), after = parseMusicXML(result);
    expect(writtenScoreKey(result)).toEqual(key(2));
    expect([...doc(result).querySelectorAll("fifths")].map(e => e.textContent)).toEqual(["2", "2"]);
    expect(doc(result).querySelector("pitch")?.textContent).toBe("D5");
    for (let p = 0; p < before.parts.length; p++) {
      expect(after.parts[p].notes).toEqual(before.parts[p].notes.map(n => ({ ...n, pitch: n.pitch + 2 })));
    }
    expect(after.measures).toEqual(before.measures);
    expect(after.playbackOrder).toEqual(before.playbackOrder);
    expect(after.totalBeats).toBe(before.totalBeats);
  });

  it("spells chromatic pitches, octaves, chord roots and basses, preserving instrument transposition", () => {
    const xml = duet.replace("<clef>", "<transpose><diatonic>-1</diatonic><chromatic>-2</chromatic></transpose><clef>")
      .replace("<sound tempo=\"100\"/>", "<harmony><root><root-step>C</root-step></root><kind>major</kind><bass><bass-step>G</bass-step></bass></harmony><sound tempo=\"100\"/>")
      .replace("<step>C</step><octave>5</octave>", "<step>C</step><alter>1</alter><octave>5</octave>");
    const result = doc(transposeMusicXMLKey(xml, key(5)));
    expect(result.querySelector("pitch")?.textContent).toBe("B14");
    expect(result.querySelector("root")?.textContent).toBe("B");
    expect(result.querySelector("bass")?.textContent).toBe("F1");
    expect(result.querySelector("transpose")?.textContent).toBe("-1-2");
  });

  it("keeps minor mode and transposes subsequent modulations by the same interval", () => {
    const xml = duet.replaceAll("<fifths>0</fifths>", "<fifths>0</fifths><mode>minor</mode>").replace('<measure number="2">', '<measure number="2"><attributes><key><fifths>1</fifths><mode>minor</mode></key></attributes>');
    const result = transposeMusicXMLKey(xml, { fifths: 2, mode: "minor" });
    expect([...doc(result).querySelectorAll("fifths")].map(e => e.textContent)).toEqual(["2", "3", "2"]);
    expect(keyLabel(writtenScoreKey(result))).toBe("h moll");
  });

  it("inserts an initial key when C is implicit and supports normalized timewise files", () => {
    const noKey = duet.replaceAll("<key><fifths>0</fifths></key>", "");
    expect([...doc(transposeMusicXMLKey(noKey, key(-2))).querySelectorAll("fifths")].map(e => e.textContent)).toEqual(["-2", "-2"]);
    const timewise = '<score-timewise><part-list><score-part id="A"><part-name>Piano</part-name></score-part></part-list><measure number="1"><part id="A"><attributes><divisions>1</divisions></attributes><note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration></note></part></measure></score-timewise>';
    expect(doc(transposeMusicXMLKey(timewise, key(-5))).querySelector("pitch")?.textContent).toBe("D-14");
  });

  it("can round-trip all conventional keys including enharmonic spellings", () => {
    for (const target of keyChoices("major")) {
      const result = transposeMusicXMLKey(duet, target);
      const restored = parseMusicXML(transposeMusicXMLKey(result, key(0)));
      expect(restored.parts.map(p => p.notes.map(n => n.pitch))).toEqual(parseMusicXML(duet).parts.map(p => p.notes.map(n => n.pitch)));
    }
  });

  it("updates key signatures of resting parts while keeping percussion unchanged", () => {
    const resting = duet.replace(/<part id="P2">[\s\S]*?<\/part>/, '<part id="P2"><measure number="1"><attributes><divisions>1</divisions><key><fifths>0</fifths></key><clef><sign>G</sign><line>2</line></clef></attributes><note><rest/><duration>4</duration></note></measure></part>');
    const transposed = doc(transposeMusicXMLKey(resting, key(2)));
    expect(transposed.querySelector('part[id="P2"] fifths')?.textContent).toBe("2");
    const percussion = resting.replace('<part id="P2"><measure number="1"><attributes><divisions>1</divisions><key><fifths>0</fifths></key><clef><sign>G</sign>', '<part id="P2"><measure number="1"><attributes><divisions>1</divisions><key><fifths>0</fifths></key><clef><sign>percussion</sign>');
    expect(doc(transposeMusicXMLKey(percussion, key(2))).querySelector('part[id="P2"] fifths')?.textContent).toBe("0");
  });

  it("rejects unsupported notation without returning a partially converted score", () => {
    expect(() => transposeMusicXMLKey(duet.replace("<octave>5</octave>", "<alter>0.5</alter><octave>5</octave>"), key(2))).toThrow("微分音");
    expect(() => transposeMusicXMLKey(duet.replace("<fifths>0</fifths>", "<key-step>C</key-step><key-alter>1</key-alter>"), key(2))).toThrow("特殊な調号");
    expect(() => transposeMusicXMLKey(duet.replace('<measure number="2">', '<measure number="2"><attributes><key><fifths>6</fifths></key></attributes>'), key(2))).toThrow("7個");
    expect(() => transposeMusicXMLKey(duet, { fifths: 0, mode: "minor" })).toThrow("同じ長調");
  });
});
