import type { MidiNoteMessage, NoteEvent } from "./types";
import type { PerformanceMatch } from "./performance-follower";

interface Hypothesis { index: number; time: number; tempo: number; cost: number; matched: boolean; slowTempo?: number }

export class SequenceFollower {
  private onsets: NoteEvent[][] = [];
  private beam: Hypothesis[] = [];
  private initialTempo = 120;

  load(notes: NoteEvent[], tempo: number): void {
    this.onsets = [];
    for (const note of [...notes].sort((a, b) => a.startBeat - b.startBeat)) {
      const group = this.onsets.at(-1);
      if (group && Math.abs(group[0].startBeat - note.startBeat) < 0.0001) group.push(note);
      else this.onsets.push([note]);
    }
    this.reset(tempo);
  }

  reset(tempo: number): void { this.beam = []; this.initialTempo = tempo; }

  match(message: MidiNoteMessage, expectedBeat: number, baseTempo: number): PerformanceMatch | null {
    if (message.type !== "noteon" || message.velocity <= 0 || !Number.isFinite(message.timestamp) || !Number.isFinite(expectedBeat)) return null;
    const candidates: Hypothesis[] = [];
    if (!this.beam.length) {
      for (let index = this.lowerBound(expectedBeat - 8); index < this.onsets.length; index++) {
        const group = this.onsets[index];
        if (group[0].startBeat > expectedBeat + 8) break;
        if (group.some((note) => note.pitch === message.note)) candidates.push({ index, time: message.timestamp, tempo: this.initialTempo, cost: Math.abs(group[0].startBeat - expectedBeat), matched: true });
      }
    } else {
      if (message.timestamp <= Math.max(...this.beam.map((item) => item.time))) return null;
      for (const previous of this.beam) {
        candidates.push({ ...previous, cost: previous.cost + 1.8, matched: false, slowTempo: undefined });
        const elapsed = (message.timestamp - previous.time) / 1000;
        const beat = this.onsets[previous.index][0].startBeat;
        for (let index = previous.index + 1; index < Math.min(this.onsets.length, previous.index + 9); index++) {
          const group = this.onsets[index];
          if (!group.some((note) => note.pitch === message.note)) continue;
          const distance = group[0].startBeat - beat;
          const timingResidual = elapsed * previous.tempo / 60 - distance;
          const timingCost = Math.min(timingResidual > 0 ? 2 : 3, Math.abs(timingResidual)) * 0.7;
          const cost = previous.cost + timingCost + (index - previous.index - 1) * 0.65;
          const implied = distance * 60 / elapsed;
          const extendedGap = elapsed - distance * 60 / previous.tempo > Math.max(0.75, 90 / previous.tempo);
          const validTempo = elapsed >= 0.02 && implied >= baseTempo * 0.4 && implied <= baseTempo * 2.2;
          const slowTempo = extendedGap && validTempo && index === previous.index + 1 ? implied : undefined;
          const confirmedSlowdown = slowTempo != null && previous.slowTempo != null && Math.abs(slowTempo / previous.slowTempo - 1) <= 0.1;
          const tempo = validTempo && (!extendedGap || confirmedSlowdown)
            ? previous.tempo + (implied - previous.tempo) * 0.25 : previous.tempo;
          candidates.push({ index, time: message.timestamp, tempo, cost, matched: true, slowTempo });
        }
      }
    }
    if (!candidates.length) return null;
    candidates.sort((a, b) => a.cost - b.cost);
    const unique = new Map<number, Hypothesis>();
    for (const item of candidates) if (!unique.has(item.index)) unique.set(item.index, item);
    const best = candidates[0];
    this.beam = [...unique.values()].slice(0, 8).map((item) => ({ ...item, cost: item.cost - best.cost }));
    if (!best.matched) return null;
    const note = this.onsets[best.index].find((item) => item.pitch === message.note)!;
    const probability = 1 / this.beam.reduce((sum, item) => sum + Math.exp(-item.cost), 0);
    return { beat: note.startBeat, tempo: best.tempo, confidence: probability, duration: note.durationBeats, velocity: note.velocity };
  }

  private lowerBound(beat: number): number {
    let low = 0, high = this.onsets.length;
    while (low < high) { const mid = (low + high) >>> 1; if (this.onsets[mid][0].startBeat < beat) low = mid + 1; else high = mid; }
    return low;
  }
}
