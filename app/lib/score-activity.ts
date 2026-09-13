import type { NoteEvent } from './types';

export interface SoundingInterval { start: number; end: number }

export function scoreActivity(notes: NoteEvent[]): SoundingInterval[] {
  const intervals: SoundingInterval[] = [];
  const valid = notes.filter(note => Number.isFinite(note.startBeat) && Number.isFinite(note.startBeat + note.durationBeats) && note.durationBeats > 0);
  for (const note of valid.sort((a, b) => a.startBeat - b.startBeat)) {
    const end = note.startBeat + note.durationBeats;
    const previous = intervals.at(-1);
    if (previous && note.startBeat <= previous.end) previous.end = Math.max(previous.end, end);
    else intervals.push({ start: note.startBeat, end });
  }
  return intervals;
}

export function soundingAt(intervals: SoundingInterval[], beat: number): boolean {
  if (!Number.isFinite(beat)) return false;
  let low = 0, high = intervals.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (intervals[mid].start <= beat) low = mid + 1;
    else high = mid;
  }
  return low > 0 && beat < intervals[low - 1].end;
}
