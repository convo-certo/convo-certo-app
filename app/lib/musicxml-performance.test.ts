import { describe, it, expect, vi } from "vitest";
import { parseMusicXML, updateMusicXMLAnnotation } from "./musicxml-parser";
import { ConcertEngine } from "./concert-engine";

const note = (step: string, duration: number, extra = "") => `<note>${extra}<pitch><step>${step}</step><octave>4</octave></pitch><duration>${duration}</duration></note>`;
const xml = `<score-partwise version="4.0"><work><work-title>XML ensemble</work-title></work><part-list>
<score-part id="p"><part-name>Piano</part-name></score-part><score-part id="c"><part-name>Clarinet</part-name><midi-instrument id="ci"><midi-program>72</midi-program></midi-instrument></score-part></part-list>
<part id="p"><measure number="1"><attributes><divisions>2</divisions><time><beats>3</beats><beat-type>8</beat-type></time></attributes>
<direction><sound tempo="90"/></direction>
${note("C", 1)}${note("E", 1, "<chord/>")}${note("D", 2)}
<backup><duration>3</duration></backup>${note("G", 3)}
</measure><measure number="2"><direction><sound tempo="60"/></direction>${note("F", 3)}</measure></part>
<part id="c"><measure number="1"><attributes><divisions>2</divisions><transpose><chromatic>-2</chromatic></transpose></attributes>${note("D", 3, '<tie type="start"/>')}</measure>
<measure number="2">${note("D", 3, '<tie type="stop"/>')}</measure></part></score-partwise>`;

describe("MusicXML performance source", () => {
  it("aligns piano voices and chords in quarter-note time and locates the transposing solo", () => {
    const score = parseMusicXML(xml);
    expect(score.measureStartBeats).toEqual([0, 1.5]);
    expect(score.totalBeats).toBe(3);
    expect(score.parts[0].isSolo).toBe(false);
    expect(score.parts[0].notes.map((n) => [n.pitch, n.startBeat])).toEqual([[60, 0], [64, 0], [67, 0], [62, 0.5], [65, 1.5]]);
    expect(score.parts[1].isSolo).toBe(true);
    expect(score.parts[1].notes).toHaveLength(1);
    expect(score.parts[1].notes[0]).toMatchObject({ pitch: 60, durationBeats: 3 });
    expect(score.tempoEvents).toEqual([{ beatPosition: 0, bpm: 90, type: "instant" }, { beatPosition: 1.5, bpm: 60, type: "instant" }]);
  });

  it("replaces and removes exported directives without duplicating them", () => {
    let edited = updateMusicXMLAnnotation(xml, 1, { role: { mode: "lead", strength: "strong", factor: 0.9 }, wait: { type: "listen" } });
    edited = updateMusicXMLAnnotation(edited, 1, { role: { mode: "follow", strength: "moderate", factor: 0.3 }, wait: { type: "wait", duration: 2 } });
    expect(parseMusicXML(edited).measures).toEqual([{ measureNumber: 1, role: { mode: "follow", strength: "moderate", factor: 0.3 }, wait: { type: "wait", duration: 2 } }]);
    expect(edited.match(/Follow:moderate/g)).toHaveLength(1);
    expect(edited).not.toContain("Lead:strong");
    expect(parseMusicXML(updateMusicXMLAnnotation(edited, 1, {})).measures).toEqual([]);
  });

  it("uses imported pitches and wait directives for actual accompaniment and follower input", () => {
    vi.useFakeTimers();
    const engine = new ConcertEngine(() => 0);
    try {
      const score = parseMusicXML(updateMusicXMLAnnotation(xml, 1, { wait: { type: "listen" } }));
      engine.load(score);
      engine.setAnnotations(score.measures);
      const output = vi.fn();
      engine.onNote = output;
      engine.start();
      expect(output).not.toHaveBeenCalled();
      engine.processNote({ type: "noteon", note: 61, velocity: 90, timestamp: 100 });
      expect(engine.getState().status).toBe("waiting");
      engine.processNote({ type: "noteon", note: 60, velocity: 90, timestamp: 200 });
      expect(engine.getState().status).toBe("playing");
      vi.advanceTimersByTime(25);
      expect(output.mock.calls.map(([n]) => n.pitch)).toEqual([60, 64, 67]);
      expect(output.mock.calls.every(([n]) => n.partIndex === 0)).toBe(true);
    } finally { engine.dispose(); vi.useRealTimers(); }
  });

  it("rejects malformed or empty XML", () => {
    expect(() => parseMusicXML("<score-partwise>")).toThrow();
    expect(() => parseMusicXML("<score-partwise/>")).toThrow();
  });
});
