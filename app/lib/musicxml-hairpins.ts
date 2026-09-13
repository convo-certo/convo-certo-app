import type { NoteEvent } from './types';

export interface DynamicMark { beat: number; value: number; staff?: string }
export interface HairpinMark { beat: number; type: string; number: string; staff?: string; niente: boolean }

export function applyHairpinDynamics(notes: NoteEvent[], dynamics: DynamicMark[], marks: HairpinMark[], originalLevels: Map<NoteEvent, number>): void {
  if (!dynamics.length && !marks.length) return;
  const open = new Map<string, HairpinMark>();
  const ambiguous = new Set<string>();
  const pairs: { start: HairpinMark; end: number }[] = [];
  for (const mark of [...marks].sort((a,b)=>a.beat-b.beat)) {
    const key = `${mark.staff ?? '*'}:${mark.number}`;
    if (mark.type === 'crescendo' || mark.type === 'diminuendo') {
      if (open.has(key) || ambiguous.has(key)) { open.delete(key); ambiguous.add(key); }
      else open.set(key,mark);
    }
    else if (mark.type === 'stop') {
      const start = open.get(key); open.delete(key); ambiguous.delete(key);
      if (start && mark.beat > start.beat && !start.niente && !mark.niente) pairs.push({start,end:mark.beat});
    }
  }
  for (const staff of new Set(notes.map(note=>note.staff ?? '1'))) {
    const changes = dynamics.filter(mark=>!mark.staff || mark.staff===staff).sort((a,b)=>a.beat-b.beat);
    const writtenAt = (beat: number) => changes.filter(mark=>mark.beat<=beat+1e-7).at(-1) ?? {beat:-Infinity,value:80};
    const candidates = pairs.filter(pair=>!pair.start.staff || pair.start.staff===staff);
    const simple = candidates.filter(pair=>!candidates.some(other=>other!==pair && other.start.beat<pair.end && other.end>pair.start.beat) && !changes.some(mark=>mark.beat>pair.start.beat+1e-7 && mark.beat<pair.end-1e-7)).sort((a,b)=>a.start.beat-b.start.beat);
    const spans: { start: number; end: number; from: number; to: number }[] = [];
    for (const pair of simple) {
      const written = writtenAt(pair.start.beat), previous = spans.at(-1);
      const from = previous && previous.end<=pair.start.beat && previous.end>written.beat ? previous.to : written.value;
      const target = changes.filter(mark=>Math.abs(mark.beat-pair.end)<1e-7).at(-1);
      const to = target?.value ?? Math.max(1,Math.min(127,from+(pair.start.type==='crescendo'?24:-24)));
      spans.push({start:pair.start.beat,end:pair.end,from,to});
    }
    const levelAt = (beat: number) => {
      const active = spans.find(span=>beat>=span.start && beat<span.end);
      if (active) return active.from+(active.to-active.from)*(beat-active.start)/(active.end-active.start);
      const written = writtenAt(beat), previous = spans.filter(span=>span.end<=beat).at(-1);
      return previous && previous.end>written.beat ? previous.to : written.value;
    };
    const boundaries = [...spans.flatMap(span=>[span.start,span.end]),...changes.flatMap(mark=>Math.abs(levelAt(mark.beat)-levelAt(mark.beat-1e-6))>0.0001 ? [mark.beat-1e-6,mark.beat] : [mark.beat])];
    for (const note of notes.filter(note=>(note.staff ?? '1')===staff)) {
      const end = note.startBeat+note.durationBeats;
      const accent = note.velocity/(originalLevels.get(note) ?? 80);
      const first = Math.max(1,Math.min(127,levelAt(note.startBeat)*accent));
      const beats = [...new Set([note.startBeat,end,...boundaries.filter(beat=>beat>note.startBeat && beat<end)])].sort((a,b)=>a-b);
      note.velocity = first;
      const curve = beats.map(beat=>({position:(beat-note.startBeat)/note.durationBeats,gain:Math.max(1,Math.min(127,levelAt(beat)*accent))/first}));
      if (curve.some(point=>Math.abs(point.gain-1)>1e-7)) note.gainCurve=curve;
    }
  }
}
