import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { repertoire, transposeScore } from "./repertoire";
import { instrumentForPart } from "./orchestra-audio";
import type { ParsedScore } from "./types";

describe("clarinet repertoire", () => {
  it("offers all movements of K622 and Op120-2", () => {
    expect(repertoire).toHaveLength(6);
    expect(repertoire.filter((entry) => entry.ensemble === "piano").every((entry) => entry.id.startsWith("brahms-op120-2"))).toBe(true);
  });
  it.each([1, 2, 3])("contains full orchestral parts for Mozart movement %s", (movement) => {
    const score = JSON.parse(readFileSync(`public/repertoire/mozart-k622-${movement}.json`, "utf8")) as ParsedScore;
    expect(score.totalMeasures).toBe([359, 98, 353][movement - 1]);
    expect(score.parts).toHaveLength(7);
    expect(new Set(score.parts.map(instrumentForPart)).size).toBeGreaterThanOrEqual(4);
    expect(score.parts.every((part) => !part.isSolo && part.notes.length > 0)).toBe(true);
  });
  it("transposes solo and accompaniment together for B-flat clarinet", () => {
    const score = JSON.parse(readFileSync("public/repertoire/mozart-k622-2.json", "utf8")) as ParsedScore;
    const transposed = transposeScore(score, 1);
    expect(transposed.parts[0].notes[0].pitch).toBe(score.parts[0].notes[0].pitch + 1);
    expect(transposed.parts[0].notes[0].startBeat).toBe(score.parts[0].notes[0].startBeat);
  });
  it("keeps Brahms accompaniment in concert pitch and renders the clarinet in B-flat", () => {
    const entry = repertoire.find((item) => item.id === "brahms-op120-2-1");
    expect(entry?.nativeTransposition).toBe(-2);
    expect(entry?.scoreDisplayTransposition).toBe(2);
  });
});
