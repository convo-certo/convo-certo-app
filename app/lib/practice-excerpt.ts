import { playerPart } from "./performance-seats";
import type { ParsedScore } from "./types";

export function firstPlayerExcerpt(score: ParsedScore, withLeadIn = false): { first: number; last: number } | null {
  const notes = playerPart(score)?.notes;
  if (!notes?.length || !score.measureStartBeats.length) return null;
  const beat = notes.reduce((earliest, note) => Math.min(earliest, note.startBeat), Infinity);
  const index = score.measureStartBeats.reduce((found, start, index) => start <= beat ? index : found, 0);
  return { first: Math.max(1, index + 1 - (withLeadIn ? 1 : 0)), last: Math.min(score.measureStartBeats.length, index + 4) };
}
