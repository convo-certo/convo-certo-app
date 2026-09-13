import type { OrchestraChair } from './orchestra-space';
import type { NoteEvent } from './types';

function unit(key: string): number {
  let hash = 2166136261;
  for (let i = 0; i < key.length; i++) hash = Math.imul(hash ^ key.charCodeAt(i), 16777619);
  hash ^= hash >>> 16;
  return (hash >>> 0) / 4294967295;
}

export function playerVariation(chair: OrchestraChair, note: NoteEvent) {
  const amount = chair.variation ?? 0;
  const key = `${chair.id}:${note.pitch}:${note.startBeat}`;
  return {
    cents: (unit(chair.id + ':pitch') * 2 - 1) * 6 * amount,
    delay: unit(key + ':onset') * 0.012 * amount,
    gate: 1 + (unit(key + ':gate') * 2 - 1) * 0.02 * amount,
    gain: 1 + (unit(key + ':gain') * 2 - 1) * 0.04 * amount,
  };
}

export function chairLevel(chair: OrchestraChair, chairs: OrchestraChair[]): number {
  const copies = chairs.filter(item => item.partIndex === chair.partIndex && item.instrument === chair.instrument && item.level > 0).length;
  return chair.level / Math.sqrt(Math.max(1, copies));
}
