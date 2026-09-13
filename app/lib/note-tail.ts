import type { NoteEvent } from './types';

export function noteTail(note: NoteEvent, beat: number): NoteEvent | null {
  const elapsed = beat - note.startBeat;
  const remaining = note.durationBeats - elapsed;
  const sounding = note.durationBeats * (note.articulation ?? 1) - elapsed;
  if (elapsed <= 0.00001 || remaining <= 0.00001 || sounding <= 0.00001) return null;
  const position = elapsed / note.durationBeats;
  const curve = note.gainCurve;
  let gain = 1;
  if (curve?.length) {
    const before = curve.filter(point => point.position <= position).at(-1) ?? curve[0];
    const after = curve.find(point => point.position > position) ?? before;
    gain = before.gain + (after.gain - before.gain) * (after.position > before.position ? (position - before.position) / (after.position - before.position) : 0);
  }
  const gainCurve = curve && gain > 0 ? [{position:0,gain:1}, ...curve.filter(point => point.position > position).map(point => ({position:(point.position-position)/(1-position),gain:point.gain/gain}))] : undefined;
  return {...note,startBeat:beat,durationBeats:remaining,articulation:sounding/remaining,velocity:Math.max(1,Math.min(127,note.velocity*gain)),gainCurve};
}
