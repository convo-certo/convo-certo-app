import { playerPart } from "./performance-seats";
import type { ParsedScore } from "./types";

export function firstPlayerExcerpt(score: ParsedScore, withLeadIn = false): { first: number; last: number } | null {
  const notes = playerPart(score)?.notes;
  if (!notes?.length || !score.measureStartBeats.length) return null;
  const beat = notes.reduce((earliest, note) => Number.isFinite(note.pitch) && Number.isFinite(note.velocity) && note.velocity > 0 && Number.isFinite(note.durationBeats) && note.durationBeats > 0 && Number.isFinite(note.startBeat) && note.startBeat >= 0 && note.startBeat < score.totalBeats ? Math.min(earliest, note.startBeat) : earliest, Infinity);
  if (!Number.isFinite(beat)) return null;
  const index = score.measureStartBeats.reduce((found, start, index) => start <= beat ? index : found, 0);
  return { first: Math.max(1, index + 1 - (withLeadIn ? 1 : 0)), last: Math.min(score.measureStartBeats.length, index + 4) };
}
