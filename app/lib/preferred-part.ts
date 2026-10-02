import { catalogPartInstrument, type CatalogInstrumentId } from "./score-catalog";
import type { ParsedScore } from "./types";

export function preferredPartId(score: ParsedScore, instrument?: CatalogInstrumentId): string | undefined {
  if (!instrument) return undefined;
  return score.parts.find(part =>
    part.notes.some(note => note.durationBeats > 0 && note.velocity > 0)
    && catalogPartInstrument({ name: part.name, program: part.midiProgram == null ? null : part.midiProgram + 1 }) === instrument
  )?.id;
}
