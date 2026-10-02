import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { parseMusicXML } from "./musicxml-parser";
import { assignPerformanceSeat, listPerformanceSeats, performanceName, playerPart, readPerformanceSeatName } from "./performance-seats";
import { ConcertEngine } from "./concert-engine";
import { transposeScore } from "./repertoire";
import { readPracticeFile } from "./practice-file";
import { workSignature } from "./score-signature";
import { takeScoreContext } from "./take-score-context";

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

  it("formats only generated voice labels without changing seat identity or score data", () => {
    const raw = parseMusicXML(seatXML);
    const seat = listPerformanceSeats(raw).find(seat => seat.voice === "2")!;
    const selected = assignPerformanceSeat(raw, seat.id);
    const before = JSON.stringify(selected);
    expect(seat.id).toBe('["C","1","2"]');
    expect(performanceName(seat, "ja")).toBe("Clarinets I & II · 譜表1 声部2");
    expect(performanceName(seat, "en")).toBe("Clarinets I & II · staff 1 voice 2");
    expect(performanceName(playerPart(selected)!, "en")).toBe("Clarinets I & II · staff 1 voice 2");
    expect(performanceName(selected.parts[0], "en")).toBe("Clarinets I & II (other voices)");
    expect(performanceName(selected.parts[0], "ja")).toBe("Clarinets I & II（他の声部）");
    expect(performanceName(playerPart(transposeScore(selected, 1))!, "en")).toBe("Clarinets I & II · staff 1 voice 2");
    expect(JSON.stringify(selected)).toBe(before);
    expect(playerPart(selected)?.name).toBe(seat.name);
  });

  it("preserves original names even when they contain text resembling a generated suffix", () => {
    const name = "私の Clarinets · 譜表1 声部2（他の声部）";
    const raw = parseMusicXML(seatXML.replace("Clarinets I &amp; II", name));
    expect(performanceName(raw.parts[0], "en")).toBe(name);
    expect(performanceName(listPerformanceSeats(raw)[0], "en")).toBe(name);
    const seat = listPerformanceSeats(raw).find(seat => seat.voice === "2")!;
    expect(performanceName(seat, "en")).toBe(`${name} · staff 1 voice 2`);
    expect(performanceName(assignPerformanceSeat(raw, seat.id).parts[0], "en")).toBe(`${name} (other voices)`);
  });

  it("recovers a saved voice label from its source XML and stable seat ID, including older history", () => {
    const saved = readPerformanceSeatName(seatXML, '["C","1","2"]', "Clarinets I & II · 譜表1 声部2");
    expect(performanceName(saved, "en")).toBe("Clarinets I & II · staff 1 voice 2");
    expect(performanceName(saved, "ja")).toBe("Clarinets I & II · 譜表1 声部2");
    const named = seatXML.replace("Clarinets I &amp; II", "譜表1 声部2（他の声部）");
    expect(performanceName(readPerformanceSeatName(named, "C", "old"), "en")).toBe("譜表1 声部2（他の声部）");
    for (const id of ["unknown", '["missing","1","2"]', '["C",1,2]']) expect(performanceName(readPerformanceSeatName(seatXML, id, "Saved custom name"), "en")).toBe("Saved custom name");
    expect(performanceName(readPerformanceSeatName("invalid XML", '["C","1","2"]', "Saved custom name"), "en")).toBe("Saved custom name");
  });
});

describe("complete-staff seats", () => {
  const xml = readFileSync("public/repertoire/ensemble/library-58525.musicxml", "utf8");

  it("offers all voices on each staff before the existing individual voice choices", () => {
    const raw = parseMusicXML(xml);
    const part = raw.parts[0];
    const before = JSON.stringify(raw);
    const seats = listPerformanceSeats(raw);
    expect(seats.slice(0, 3).map(seat => seat.id)).toEqual([part.id, JSON.stringify([part.id, "1"]), JSON.stringify([part.id, "2"])]);
    expect(seats.slice(1, 3).every(seat => seat.voice === undefined)).toBe(true);
    expect(performanceName(seats[1], "ja")).toBe("Piano · 譜表1（全声部）");
    expect(performanceName(seats[1], "en")).toBe("Piano · staff 1 (all voices)");
    const upper = assignPerformanceSeat(raw, seats[1].id);
    const selected = playerPart(upper)!;
    const remainder = upper.parts.find(item => item.id === part.id)!;
    expect(new Set(selected.notes.map(note => note.voice)).size).toBeGreaterThan(1);
    expect(selected.notes.every(note => (note.staff ?? "1") === "1")).toBe(true);
    expect(selected.notes).toHaveLength(part.notes.filter(note => (note.staff ?? "1") === "1").length);
    expect(remainder.notes.every(note => note.staff === "2")).toBe(true);
    expect(remainder.notes.length + selected.notes.length).toBe(part.notes.length);
    expect(remainder.isSolo).toBe(false);
    expect(selected.sourcePartId).toBe(part.id);
    expect(upper.parts.every((item, index) => item.notes.every(note => note.partIndex === index))).toBe(true);
    expect(workSignature(upper)).toBe(workSignature(raw));
    expect(JSON.stringify(raw)).toBe(before);
    const voice = seats.find(seat => seat.staff === "1" && seat.voice === "2")!;
    expect(voice.id).toBe(JSON.stringify([part.id, "1", "2"]));
    expect(playerPart(assignPerformanceSeat(raw, voice.id))?.notes.every(note => note.staff === "1" && note.voice === "2")).toBe(true);
  });

  it("keeps the selected staff silent while playing the other staff", () => {
    const raw = parseMusicXML(xml);
    const selected = assignPerformanceSeat(raw, JSON.stringify([raw.parts[0].id, "1"]));
    const played: { staff?: string; voice?: string }[] = [];
    const engine = new ConcertEngine(() => 0, false);
    engine.load(selected);
    engine.onNote = note => played.push({ staff: note.staff, voice: note.voice });
    engine.start();
    expect(played.length).toBeGreaterThan(0);
    expect(played.every(note => note.staff === "2")).toBe(true);
    engine.dispose();
  });

  it("round-trips staff sessions through exported practice data with stable work and take signatures", () => {
    const raw = parseMusicXML(xml);
    const seatId = JSON.stringify([raw.parts[0].id, "1"]);
    const selected = assignPerformanceSeat(raw, seatId);
    const session = { version: 1, seatId, instrumentKey: 0, shift: 0, tuning: 440, tempo: 80, beat: 0, startMeasure: 1, loopEnd: 4, loopEnabled: true, mode: "accompany", countInBars: 1, click: false, volume: 70, midiWritten: false };
    const saved = readPracticeFile(JSON.stringify({ format: "convocerto-practice", version: 1, score: { title: raw.title, xml, session } }));
    expect(saved.session?.seatId).toBe(seatId);
    const restored = assignPerformanceSeat(parseMusicXML(saved.xml), saved.session!.seatId);
    expect(workSignature(restored)).toBe(workSignature(selected));
    expect(takeScoreContext(restored)).toBe(takeScoreContext(selected));
    const name = readPerformanceSeatName(saved.xml, saved.session!.seatId, "saved piano part");
    expect(performanceName(name, "ja")).toBe("Piano · 譜表1（全声部）");
    expect(performanceName(name, "en")).toBe("Piano · staff 1 (all voices)");
    for (const part of restored.parts) { performanceName(part, "ja"); performanceName(part, "en"); }
    expect(takeScoreContext(restored)).toBe(takeScoreContext(selected));
    expect(takeScoreContext(assignPerformanceSeat(raw, JSON.stringify([raw.parts[0].id, "2"])))).not.toBe(takeScoreContext(selected));
    for (const invalid of ['["P1"]', '["P1",1]', '["missing","1"]', '["P1", "1"]']) expect(readPerformanceSeatName(xml, invalid, "fallback").name).toBe("fallback");
  });

  it("does not add duplicate whole-staff choices to a single staff", () => {
    expect(listPerformanceSeats(parseMusicXML(seatXML)).some(seat => seat.staff !== undefined && seat.voice === undefined)).toBe(false);
  });
});
