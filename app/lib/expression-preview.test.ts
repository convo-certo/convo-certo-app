import { describe, expect, it } from "vitest";
import { expressionExcerpt, expressionPreviewAnnotations } from "./expression-preview";
import type { MeasureAnnotation, ParsedScore } from "./types";

const score: ParsedScore = {
  title: "Repeat with pickup",
  tempo: 80,
  timeSignature: { beats: 4, beatType: 4 },
  parts: [],
  measures: [],
  totalMeasures: 7,
  totalBeats: 25,
  measureNumbers: [0, 1, 2, 3, 4],
  playbackOrder: [0, 1, 2, 1, 2, 3, 4],
  measureStartBeats: [0, 1, 5, 9, 13, 17, 21],
  timeSignatureChanges: [],
};

describe("expression preview excerpt", () => {
  it("uses source measure numbers, includes pickups, and stops before a repeat", () => {
    expect(expressionExcerpt(score, 0, 4)).toMatchObject({ first: 0, count: 3, available: 3, start: 0, end: 9, endMeasure: 2 });
    expect(expressionExcerpt(score, 1, 4)).toMatchObject({ first: 1, count: 2, start: 1, end: 9, endMeasure: 2 });
    expect(expressionExcerpt(score, 3, 4)).toMatchObject({ first: 5, count: 2, start: 17, end: 25, endMeasure: 4 });
  });

  it("bounds the excerpt to 1–4 contiguous source measures and rejects missing measures", () => {
    expect(expressionExcerpt(score, 1, 0)?.count).toBe(1);
    expect(expressionExcerpt(score, 99, 4)).toBeNull();
    expect(expressionExcerpt(score, 1, NaN)).toBeNull();
    expect(expressionExcerpt({ ...score, playbackOrder: [0, 1, 3, 4], measureStartBeats: [0, 1, 5, 9], totalBeats: 13 }, 1, 4)).toMatchObject({ count: 1, end: 5, endMeasure: 1 });
    expect(expressionExcerpt({ ...score, playbackOrder: [0, 1, 2, 3, 4], measureStartBeats: [0, 1, 5, 9, 13], totalBeats: 17 }, 0, 10)).toMatchObject({ count: 4, end: 13, endMeasure: 3 });
  });
});

describe("expression preview annotations", () => {
  const annotations: MeasureAnnotation[] = [
    { measureNumber: 0, expression: { preset: "singing", amount: 0.3, endMeasure: 2 } },
    { measureNumber: 1, memo: "Breathe", wait: { type: "listen" }, role: { mode: "follow", strength: "light", factor: 0.1 }, leader: "player", expression: { preset: "tender", amount: 0.4 } },
    { measureNumber: 2, expression: { preset: "settling", amount: 0.6 } },
  ];

  it("compares only the target expression while preserving notes, waits and other phrases", () => {
    const original = structuredClone(annotations);
    const baseline = expressionPreviewAnnotations(annotations, 1);
    expect(baseline[1]).toEqual({ ...annotations[1], expression: undefined });
    expect(baseline[0]).toEqual(annotations[0]);
    expect(baseline[2]).toEqual(annotations[2]);
    const expression = { preset: "light" as const, amount: 0.8, endMeasure: 2 };
    const preview = expressionPreviewAnnotations(annotations, 1, expression);
    expect(preview[1]).toEqual({ ...annotations[1], expression });
    preview[1].wait!.type = "wait";
    expect(annotations).toEqual(original);
  });

  it("adds a draft only when a new expression is selected", () => {
    expect(expressionPreviewAnnotations(annotations, 3)).toEqual(annotations);
    expect(expressionPreviewAnnotations(annotations, 3, { preset: "light", amount: 0.5 }).at(-1)).toEqual({ measureNumber: 3, expression: { preset: "light", amount: 0.5 } });
  });
});
