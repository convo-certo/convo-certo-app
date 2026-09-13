import { describe, expect, it } from "vitest";
import { parseMusicXML } from "./musicxml-parser";
import { assignPerformanceSeat, listPerformanceSeats, playerPart } from "./performance-seats";
import { ConcertEngine } from "./concert-engine";

export const seatXML = `<score-partwise version="4.0"><work><work-title>Two clarinets and piano</work-title></work><part-list><score-part id="C"><part-name>Clarinets I &amp; II</part-name></score-part><score-part id="P"><part-name>Piano solo</part-name></score-part></part-list><part id="C"><measure number="1"><attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time><transpose><chromatic>-2</chromatic></transpose></attributes><note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice></note><backup><duration>4</duration></backup><note><pitch><step>G</step><octave>4</octave></pitch><duration>4</duration><voice>2</voice></note></measure></part><part id="P"><measure number="1"><attributes><divisions>1</divisions></attributes><note><pitch><step>E</step><octave>4</octave></pitch><duration>4</duration></note></measure></part></score-partwise>`;

describe("ensemble seats", () => {
  it("preserves MusicXML voice identity even when the second voice crosses above the first", () => {
    const raw = parseMusicXML(seatXML);
    const seats = listPerformanceSeats(raw);
    const second = seats.find((seat) => seat.partId === "C" && seat.voice === "2")!;
    const selected = assignPerformanceSeat(raw, second.id);
    expect(playerPart(selected)?.notes.map((note) => note.pitch)).toEqual([65]);
    expect(selected.parts.find((part) => part.id === "C")?.notes.map((note) => note.pitch)).toEqual([58]);
    expect(selected.parts.find((part) => part.id === "P")?.isSolo).toBe(false);
    expect(raw.parts[0].notes).toHaveLength(2);
    expect(selected.parts.every((part, index) => part.notes.every((note) => note.partIndex === index))).toBe(true);
  });

  it("sounds the first clarinet and solo piano while the user occupies the second chair", () => {
    const raw = parseMusicXML(seatXML);
    const selected = assignPerformanceSeat(raw, listPerformanceSeats(raw).find((seat) => seat.voice === "2")!.id);
    const engine = new ConcertEngine(() => 0, false);
    const pitches: number[] = [];
    engine.load(selected);
    engine.setLeader("P");
    engine.onNote = (note) => pitches.push(note.pitch);
    engine.start();
    expect(pitches).toEqual([58, 64]);
    expect(engine.getState().leader).toBe("P");
    engine.dispose();
  });

  it("does not infer chairs from pitch alone or accept unknown seats", () => {
    const raw = parseMusicXML(seatXML.replace("<voice>2</voice>", "<voice>1</voice>"));
    expect(listPerformanceSeats(raw).filter((seat) => seat.partId === "C")).toHaveLength(1);
    expect(() => assignPerformanceSeat(raw, "unknown")).toThrow();
  });
});
