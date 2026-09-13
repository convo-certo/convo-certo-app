import type { ParsedScore } from "./types";

export function workSignature(score: ParsedScore): string {
  const parts = new Map<string, number[][]>();
  for (const part of score.parts) {
    const id = part.sourcePartId ?? part.id;
    const notes = parts.get(id) ?? [];
    notes.push(...part.notes.map((note) => [note.pitch, note.startBeat, note.durationBeats]));
    parts.set(id, notes);
  }
  const text = JSON.stringify([score.title, score.totalBeats, score.measureNumbers, [...parts].sort(([a], [b]) => a.localeCompare(b)).map(([id, notes]) => [id, notes.sort((a, b) => a[1] - b[1] || a[0] - b[0] || a[2] - b[2])])]);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return (hash >>> 0).toString(16);
}
