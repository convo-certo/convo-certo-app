import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { expressionAt, readExpression } from "./expressive-intent";
import { parseMusicXML, updateMusicXMLAnnotation } from "./musicxml-parser";
import { parseRehearsalCommand } from "./rehearsal-nlp";
import { readRehearsalPlan } from "./rehearsal-plan";
import type { MeasureAnnotation } from "./types";

const xml = readFileSync("public/scores/sample-duet.musicxml", "utf8");
const score = parseMusicXML(xml);

describe("expressive rehearsal intent", () => {
  it("maps a phrase instruction to a bounded range and keeps its meaning reviewable", () => {
    expect(parseRehearsalCommand("2小節から4小節は少し歌うように")).toMatchObject({ type: "set_expression", measureNumber: 2, expression: { preset: "singing", amount: 0.35, endMeasure: 4 } });
    expect(parseRehearsalCommand("ここはもっと柔らかく寄り添って")).toMatchObject({ expression: { preset: "tender", amount: 0.85 } });
    expect(parseRehearsalCommand("次の入りは待って")).toMatchObject({ type: "set_wait", wait: { type: "listen" } });
    expect(parseRehearsalCommand("32小節目はリードを強めて")).toMatchObject({ role: { factor: 0.9 } });
    expect(parseRehearsalCommand("軽くしないで")).toBeNull();
    expect(parseRehearsalCommand("歌って、軽くして")).toBeNull();
  });

  it("shapes the whole requested phrase, then returns to the score", () => {
    const annotations: MeasureAnnotation[] = [{ measureNumber: 1, expression: { preset: "settling", amount: 1, endMeasure: 2 } }];
    const begin = expressionAt(score, annotations, 0);
    const end = expressionAt(score, annotations, score.measureStartBeats[2] - 0.1);
    expect(end.tempo).toBeLessThan(begin.tempo - 0.2);
    expect(end.gain).toBeLessThan(begin.gain - 0.3);
    expect(expressionAt(score, annotations, score.measureStartBeats[2])).toMatchObject({ tempo: 1, gain: 1, articulation: 1, label: "" });
  });

  it("keeps neutral amount neutral and preserves source score notes", () => {
    const before = JSON.stringify(score);
    const value = expressionAt(score, [{ measureNumber: 1, expression: { preset: "singing", amount: 0 } }], 1);
    expect(value).toMatchObject({ tempo: 1, gain: 1, articulation: 1, follow: 0 });
    expect(JSON.stringify(score)).toBe(before);
  });

  it("round-trips private performance directions through both MusicXML and rehearsal files", () => {
    const expression = { preset: "singing" as const, amount: 0.6, endMeasure: 4 };
    const edited = updateMusicXMLAnnotation(xml, 1, { expression });
    expect(parseMusicXML(edited).measures.find((a) => a.measureNumber === 1)?.expression).toEqual(expression);
    expect(edited).toContain('print-object="no"');
    expect(parseMusicXML(updateMusicXMLAnnotation(edited, 1, {})).measures.find((a) => a.measureNumber === 1)?.expression).toBeUndefined();
    const annotations = [{ measureNumber: 1, expression }];
    expect(readRehearsalPlan(JSON.stringify({ version: 1, repertoireId: "test", annotations }), "test", 4)).toEqual(annotations);
    expect(() => readRehearsalPlan(JSON.stringify({ version: 1, repertoireId: "test", annotations }), "test", 2)).toThrow();
    expect(() => readExpression({ preset: "unknown", amount: 0.6 })).toThrow();
    expect(() => readExpression({ preset: "singing", amount: 10 })).toThrow();
  });
});
