import { playerPart } from "./performance-seats";
import type { ParsedScore, ScorePart } from "./types";

const hasNotes = (part: ScorePart) => part.notes.some(note => note.durationBeats > 0 && note.velocity > 0);

export function practicePartIssue(score: ParsedScore): "empty-part" | "no-accompaniment" | null {
  const solo = playerPart(score);
  if (!solo || !hasNotes(solo)) return "empty-part";
  return score.parts.some(part => !part.isSolo && hasNotes(part)) ? null : "no-accompaniment";
}
