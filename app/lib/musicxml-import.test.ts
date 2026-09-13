import { expect, it } from "vitest";
import { decodeXML, normalizeMusicXML } from "./musicxml-import";
import { parseMusicXML } from "./musicxml-parser";
const header = '<part-list><score-part id="P1"><part-name>Clarinet</part-name></score-part></part-list>';
const notes = '<attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes><note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration></note>';
it("normalizes timewise scores without losing musical duration or title", () => {
  const xml = normalizeMusicXML(`<score-timewise version="4.0"><work><work-title>My score</work-title></work>${header}<measure number="1"><part id="P1">${notes}</part></measure></score-timewise>`);
  const score = parseMusicXML(xml);
  expect(score.title).toBe("My score");
  expect(score.parts[0].notes[0]).toMatchObject({ pitch: 60, durationBeats: 4 });
});
it("accepts namespaced scores and UTF-16 exports", () => {
  const xml = `<score-partwise xmlns="urn:musicxml">${header}<part id="P1"><measure number="1">${notes}</measure></part></score-partwise>`;
  const bytes = new Uint8Array(2 + xml.length * 2); bytes.set([255, 254]);
  const view = new DataView(bytes.buffer); for (let i = 0; i < xml.length; i++) view.setUint16(2 + i * 2, xml.charCodeAt(i), true);
  expect(parseMusicXML(normalizeMusicXML(decodeXML(bytes))).parts[0].notes[0].pitch).toBe(60);
});
it("rejects other XML, invalid durations, incomplete timewise parts and entity declarations", () => {
  expect(() => normalizeMusicXML("<document/>")).toThrow("MusicXMLではありません");
  expect(() => normalizeMusicXML(`<score-partwise>${header}<part id="P1"><measure><attributes><divisions>0</divisions></attributes></measure></part></score-partwise>`)).toThrow("divisions");
  expect(() => normalizeMusicXML(`<score-timewise>${header}<measure number="1"/></score-timewise>`)).toThrow("P1");
  expect(() => normalizeMusicXML('<!DOCTYPE a [<!ENTITY b "abc">]><a/>')).toThrow("エンティティ");
});
