import type { MidiNoteMessage, NoteEvent } from "./types";

export interface PerformanceMatch { beat: number; tempo: number; confidence: number; duration: number; velocity: number }

export class PerformanceFollower {
  private notes: NoteEvent[] = [];
  private last: { beat: number; time: number } | null = null;
  private tempo = 120;
  private tempos: number[] = [];

  load(notes: NoteEvent[], tempo: number): void {
    this.notes = [...notes].sort((a, b) => a.startBeat - b.startBeat);
    this.reset(tempo);
  }

  reset(tempo: number): void { this.last = null; this.tempo = tempo; this.tempos = []; }

  match(message: MidiNoteMessage, expectedBeat: number, baseTempo: number): PerformanceMatch | null {
    if (message.type !== "noteon" || message.velocity === 0 || !Number.isFinite(message.timestamp)) return null;
    if (this.last && message.timestamp - this.last.time < 65) return null;
    let best: NoteEvent | null = null;
    let bestCost = Infinity;
    const predicted = this.last ? this.last.beat + (message.timestamp - this.last.time) * this.tempo / 60000 : expectedBeat;
    for (const note of this.notes) {
      if (note.startBeat < expectedBeat - 8) continue;
      if (note.startBeat > expectedBeat + 8) break;
      if (note.pitch !== message.note) continue;
      if (this.last && note.startBeat <= this.last.beat + 0.001) continue;
      const cost = Math.abs(note.startBeat - predicted) * 0.7 + Math.abs(note.startBeat - expectedBeat) * 0.3;
      if (cost < bestCost) { best = note; bestCost = cost; }
    }
    if (!best || bestCost > 4) return null;
    if (this.last) {
      const delta = message.timestamp - this.last.time;
      const distance = best.startBeat - this.last.beat;
      const implied = distance * 60000 / delta;
      if (delta >= 100 && distance <= 8 && implied >= baseTempo * 0.4 && implied <= baseTempo * 2.2) {
        this.tempos.push(implied);
        if (this.tempos.length > 5) this.tempos.shift();
        const sorted = [...this.tempos].sort((a, b) => a - b);
        this.tempo += (sorted[Math.floor(sorted.length / 2)] - this.tempo) * 0.35;
      }
    }
    this.last = { beat: best.startBeat, time: message.timestamp };
    return { beat: best.startBeat, tempo: this.tempo, confidence: Math.exp(-bestCost / 3), duration: best.durationBeats, velocity: best.velocity };
  }
}
