import type { ExpressionDirective, MeasureAnnotation, ParsedScore } from "./types";

export const expressionSoundLabels: Record<ExpressionDirective["preset"], string> = {
  singing: "ふくらませ、語尾をゆっくり",
  tender: "音量を抑え、少しつなぐ",
  building: "だんだん大きく、少し速く",
  settling: "だんだん遅く、静かに",
  light: "音を短く、少し静かに",
};

export const expressionSoundLabelsEn: Record<ExpressionDirective["preset"], string> = {
  singing: "Swell, then ease the ending",
  tender: "Softer, with more connected notes",
  building: "Gradually louder and a little faster",
  settling: "Gradually slower and quieter",
  light: "Shorter and a little quieter",
};

export const expressionPresetLabelsEn: Record<ExpressionDirective["preset"], string> = {
  singing: "Singing",
  tender: "Tender",
  building: "Building",
  settling: "Settling",
  light: "Light",
};

export function expressionExcerpt(score: ParsedScore, measure: number, length: number) {
  const first = score.playbackOrder.findIndex(slot => score.measureNumbers[slot] === measure);
  if (first < 0 || !Number.isFinite(length)) return null;
  let available = 1;
  while (available < 4 && first + available < score.playbackOrder.length) {
    const previous = score.playbackOrder[first + available - 1];
    const next = score.playbackOrder[first + available];
    if (next !== previous + 1 || score.measureNumbers[next] <= score.measureNumbers[previous]) break;
    available++;
  }
  const count = Math.max(1, Math.min(available, Math.floor(length)));
  const endIndex = first + count;
  return {
    first,
    count,
    available,
    start: score.measureStartBeats[first],
    end: score.measureStartBeats[endIndex] ?? score.totalBeats,
    endMeasure: score.measureNumbers[score.playbackOrder[endIndex - 1]],
  };
}

export function expressionPreviewAnnotations(annotations: MeasureAnnotation[], measure: number, expression?: ExpressionDirective): MeasureAnnotation[] {
  const next = structuredClone(annotations);
  const target = next.find(annotation => annotation.measureNumber === measure);
  if (target) {
    if (expression) target.expression = { ...expression };
    else delete target.expression;
  } else if (expression) next.push({ measureNumber: measure, expression: { ...expression } });
  return next;
}
