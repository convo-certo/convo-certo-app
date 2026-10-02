import { describe, expect, it } from "vitest";
import { MusicXMLError, type MusicXMLErrorCode } from "./musicxml-error";
import { normalizeMusicXML, decodeXML } from "./musicxml-import";
import { parseMusicXML } from "./musicxml-parser";

const header = '<part-list><score-part id="P1"><part-name>Flute</part-name></score-part></part-list>';
const sounding = '<note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration></note>';
const score = (body: string) => `<score-partwise>${header}<part id="P1"><measure number="1">${body}</measure></part></score-partwise>`;

function expectCode(action: () => unknown, code: MusicXMLErrorCode) {
  let failure: unknown;
  try { action(); } catch (error) { failure = error; }
  expect(failure).toBeInstanceOf(MusicXMLError);
  expect(failure).toMatchObject({ code });
}

describe("MusicXML error classification", () => {
  it.each([
    ["", "file-empty"],
    ["  \n ", "file-empty"],
    ["<score-partwise>", "xml-invalid"],
    ["<document/>", "format-unsupported"],
    ["<opus/>", "format-unsupported"],
    ['<!DOCTYPE a [<!ENTITY b "abc">]><a/>', "format-unsupported"],
    ["<score-partwise/>", "parts-missing"],
    [`<score-partwise>${header}${header}</score-partwise>`, "score-invalid"],
    [`<score-partwise>${header}</score-partwise>`, "score-invalid"],
    [`<score-timewise>${header}<measure number="1"/></score-timewise>`, "score-invalid"],
    [score("<attributes><divisions>0</divisions></attributes>"), "score-invalid"],
  ] as const)("classifies an unreadable or unsupported score as %s / %s", (xml, code) => {
    expectCode(() => normalizeMusicXML(xml), code);
  });

  it("distinguishes an absent part list from a complete part containing only rests", () => {
    expectCode(() => parseMusicXML("<score-partwise/>"), "parts-missing");
    expectCode(() => parseMusicXML(score('<note><rest measure="yes"/><duration>4</duration></note>')), "notes-missing");
    expectCode(() => parseMusicXML("<score-partwise>"), "xml-invalid");
    expectCode(() => parseMusicXML("<score-timewise/>"), "format-unsupported");
    expect(parseMusicXML(score(sounding)).parts[0].notes[0].pitch).toBe(60);
  });

  it("classifies invalid expression JSON and out-of-score instructions without changing valid notes", () => {
    const mark = (json: string) => `<direction><direction-type><rehearsal>ConvoCerto:expression:${json}</rehearsal></direction-type></direction>`;
    expectCode(() => parseMusicXML(score(mark("broken") + sounding)), "expression-invalid");
    expectCode(() => parseMusicXML(score(mark('{"preset":"unknown","amount":0.6}') + sounding)), "expression-invalid");
    expectCode(() => parseMusicXML(score(mark('{"preset":"light","amount":0.6,"endMeasure":3}') + sounding)), "expression-invalid");
    const parsed = parseMusicXML(score(mark('{"preset":"light","amount":0.6,"endMeasure":1}') + sounding));
    expect(parsed.parts[0].notes[0].pitch).toBe(60);
    expect(parsed.measures[0].expression).toEqual({ preset: "light", amount: 0.6, endMeasure: 1 });
  });

  it("keeps text encoding failures distinct from malformed XML", () => {
    expectCode(() => decodeXML(new Uint8Array([0xc3, 0x28])), "encoding-unsupported");
    expectCode(() => decodeXML(new TextEncoder().encode('<?xml version="1.0" encoding="not-a-real-encoding"?><score-partwise/>')), "encoding-unsupported");
  });

  it("preserves the Japanese message and underlying error for diagnostics", () => {
    const cause = new Error("Original failure");
    const error = new MusicXMLError("archive-invalid", "壊れたMXLです。", { cause });
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe("壊れたMXLです。");
    expect(error.cause).toBe(cause);
  });
});
