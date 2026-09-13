import type { ParsedScore } from "./types";

export function playbackBeatForSource(score: ParsedScore, sourceBeat: number, currentBeat: number): number {
  const starts = score.sourceMeasureStartBeats;
  if (!starts?.length) return Math.max(0, Math.min(sourceBeat, score.totalBeats));
  const slot = starts.reduce((found, start, index) => start <= sourceBeat + 0.00001 ? index : found, 0);
  const currentIndex = score.measureStartBeats.reduce((found, start, index) => start <= currentBeat + 0.00001 ? index : found, 0);
  const occurrences = score.playbackOrder.flatMap((value, index) => value === slot ? [index] : []);
  const occurrence = occurrences.includes(currentIndex) ? currentIndex : occurrences.find((index) => index >= currentIndex) ?? occurrences[0];
  return occurrence == null ? 0 : score.measureStartBeats[occurrence] + sourceBeat - starts[slot];
}
