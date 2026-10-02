import { defaultEnsembleTuning, readEnsembleTuning } from "./ensemble-tuning";
import { defaultChairs } from "./orchestra-space";
import type { OrchestraSpace, PracticeEnsemble } from "./practice-session";
import type { ScorePart } from "./types";

export function expressionPreviewSetup(parts: ScorePart[], ensemble?: PracticeEnsemble, space?: OrchestraSpace) {
  const profile = ensemble?.reference;
  const normalizedEnsemble: PracticeEnsemble = {
    tuning: readEnsembleTuning(ensemble?.tuning ?? defaultEnsembleTuning),
    leader: ensemble?.leader ?? "player",
    reference: profile ? {
      version: profile.version,
      title: profile.title,
      source: { type: profile.source.type, takeId: profile.source.takeId, recordedAt: profile.source.recordedAt },
      scoreTitle: profile.scoreTitle,
      workSignature: profile.workSignature,
      sourcePartId: profile.sourcePartId,
      points: profile.points.map(point => ({ beat: point.beat, tempoRatio: point.tempoRatio, gain: point.gain, articulation: point.articulation })),
    } : null,
  };
  const normalizedSpace: OrchestraSpace = {
    enabled: space?.enabled ?? true,
    listener: { x: space?.listener.x ?? 0, z: space?.listener.z ?? 1 },
    chairs: (space?.chairs ?? defaultChairs(parts)).map(chair => ({
      id: chair.id, partIndex: chair.partIndex, instrument: chair.instrument,
      x: chair.x, z: chair.z, level: chair.level, variation: chair.variation ?? 0,
    })),
  };
  return { ensemble: normalizedEnsemble, space: normalizedSpace, key: JSON.stringify([normalizedEnsemble, normalizedSpace]) };
}
