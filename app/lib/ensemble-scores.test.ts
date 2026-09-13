import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { parseMusicXML } from "./musicxml-parser";
import { assignPerformanceSeat, listPerformanceSeats, playerPart } from "./performance-seats";

it("loads the actual Emperor slow movement with piano and a complete combined clarinet part", () => {
  const score = parseMusicXML(readFileSync("public/repertoire/ensemble/beethoven-op73-2.musicxml", "utf8"));
  expect(score.parts).toHaveLength(13);
  expect(score.totalMeasures).toBe(82);
  expect(score.measureNumbers).toHaveLength(83);
  const seat = listPerformanceSeats(score).find((seat) => /clarinet/i.test(seat.name) && seat.voice == null)!;
  expect(seat).toBeDefined();
  const selected = assignPerformanceSeat(score, seat.id);
  expect(playerPart(selected)!.notes.length).toBeGreaterThan(100);
  expect(selected.parts.find((part) => /piano/i.test(part.name))!.notes.length).toBeGreaterThan(500);
  expect(selected.parts.every((part) => part.notes.every((note) => Number.isFinite(note.pitch) && note.durationBeats > 0 && note.startBeat < selected.totalBeats))).toBe(true);
});

it("loads the complete Mozart Adagio score instead of a MIDI conversion", () => {
  const score = parseMusicXML(readFileSync("public/repertoire/ensemble/mozart-k622-2.musicxml", "utf8"));
  expect(score.parts).toHaveLength(12);
  expect(score.totalMeasures).toBe(98);
  expect(playerPart(score)?.name).toMatch(/clarinet/i);
});

it("loads the four movement Mozart K.581 quintet with five playable parts", () => {
  const score = parseMusicXML(readFileSync("public/repertoire/ensemble/mozart-k581-clarinet-quintet.musicxml", "utf8"));
  expect(score.parts).toHaveLength(5);
  expect(score.totalMeasures).toBe(498);
  expect(score.measureNumbers.at(-1)).toBe(498);
  expect(playerPart(score)?.name).toMatch(/clarinet/i);
  expect(score.parts.every((part) => part.notes.length > 100)).toBe(true);
});

it("loads the Pastoral Symphony first movement with orchestral winds", () => {
  const score = parseMusicXML(readFileSync("public/repertoire/ensemble/beethoven-symphony-6-pastoral-1.musicxml", "utf8"));
  expect(score.parts).toHaveLength(10);
  expect(score.totalMeasures).toBeGreaterThan(300);
  expect(score.parts.some((part) => /clarinet/i.test(part.name))).toBe(true);
  expect(score.parts.some((part) => /violin/i.test(part.name))).toBe(true);
});

it("loads Mozart Jupiter with its complete orchestral parts", () => {
  const score = parseMusicXML(readFileSync("public/repertoire/ensemble/mozart-symphony-41-jupiter.musicxml", "utf8"));
  expect(score.parts).toHaveLength(17);
  expect(score.totalMeasures).toBeGreaterThan(200);
  expect(score.parts.some((part) => /clarino|trumpet/i.test(part.name))).toBe(true);
  expect(score.parts.some((part) => /violin/i.test(part.name))).toBe(true);
}, 30000);

it("loads the public-domain Earl of Oxford march brass arrangement", () => {
  const score = parseMusicXML(readFileSync("public/repertoire/ensemble/byrd-earl-of-oxford-march-brass.musicxml", "utf8"));
  expect(score.parts).toHaveLength(5);
  expect(score.totalMeasures).toBeGreaterThan(20);
  expect(score.parts.some((part) => /trumpet|horn|trombone|tuba/i.test(part.name))).toBe(true);
});

it("loads the public-domain Holst Jupiter brass ensemble arrangement", () => {
  const score = parseMusicXML(readFileSync("public/repertoire/ensemble/holst-jupiter-brass-ensemble.musicxml", "utf8"));
  expect(score.parts).toHaveLength(6);
  expect(score.totalMeasures).toBeGreaterThan(100);
  expect(score.parts.some((part) => /trumpet|horn|trombone|euphonium|tuba/i.test(part.name))).toBe(true);
});

it("loads the public-domain Corelli Sarabande brass ensemble arrangement", () => {
  const score = parseMusicXML(readFileSync("public/repertoire/ensemble/corelli-sarabande-brass-ensemble.musicxml", "utf8"));
  expect(score.parts).toHaveLength(5);
  expect(score.totalMeasures).toBeGreaterThan(30);
  expect(score.parts.some((part) => /trumpet|horn|trombone|tuba/i.test(part.name))).toBe(true);
});

it("loads the public-domain Holst Jupiter woodwind chorale with clarinets", () => {
  const score = parseMusicXML(readFileSync("public/repertoire/ensemble/holst-jupiter-woodwind-chorale.musicxml", "utf8"));
  expect(score.parts).toHaveLength(13);
  expect(score.totalMeasures).toBeGreaterThan(35);
  expect(score.parts.filter((part) => /clarinet/i.test(part.name))).toHaveLength(3);
});

it("loads the public-domain Holst Jupiter low brass quintet", () => {
  const score = parseMusicXML(readFileSync("public/repertoire/ensemble/holst-jupiter-low-brass-quintet.musicxml", "utf8"));
  expect(score.parts).toHaveLength(5);
  expect(score.totalMeasures).toBeGreaterThan(250);
  expect(score.parts.some((part) => /euphonium|tuba/i.test(part.name))).toBe(true);
});

it("bundles a searchable, attributed catalogue with featured orchestral and wind scores", () => {
  const catalog = JSON.parse(readFileSync("public/repertoire/ensemble/catalog.json", "utf8")) as { id: string; title: string; parts: string[]; category: string; featured: boolean }[];
  const manifest = JSON.parse(readFileSync("public/repertoire/ensemble/sources.json", "utf8")) as { id: string; licenseConflict: boolean; scoreLicense: string; sha256: string }[];
  expect(catalog.length).toBeGreaterThanOrEqual(30);
  expect(catalog.filter((item) => item.category === "wind")).toHaveLength(16);
  expect(catalog.filter((item) => item.featured)).toHaveLength(14);
  for (const item of catalog) {
    const xml = readFileSync(`public/repertoire/ensemble/${item.id}.musicxml`, "utf8");
    expect(xml).toContain("<score-partwise");
    expect((xml.match(/<score-part id=/g) ?? []).length, item.title).toBe(item.parts.length);
    expect(createHash("sha256").update(xml).digest("hex")).toBe(manifest.find((source) => source.id === item.id)?.sha256);
    expect(manifest.find((source) => source.id === item.id)).toMatchObject({ licenseConflict: false });
    expect(["CC0-1.0", "PDM-1.0"]).toContain(manifest.find((source) => source.id === item.id)?.scoreLicense);
    if (item.featured && item.category === "orchestra") {
      expect(item.parts.some((part) => /violin|violino/i.test(part)), item.title).toBe(true);
      expect(item.parts.some((part) => /clarinet/i.test(part)), item.title).toBe(true);
    }
  }
}, 30000);
