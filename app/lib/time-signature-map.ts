import type { TimeSignatureEvent } from "./types";

export class TimeSignatureMap {
  private readonly events: TimeSignatureEvent[];
  private readonly defaultBeats: number;
  private readonly defaultBeatType: number;

  constructor(
    events: TimeSignatureEvent[],
    defaultBeats: number,
    defaultBeatType: number
  ) {
    this.events = [...events].sort(
      (a, b) => a.beatPosition - b.beatPosition
    );
    this.defaultBeats = defaultBeats;
    this.defaultBeatType = defaultBeatType;
  }

  getBeatsAt(beat: number): number {
    let beats = this.defaultBeats;
    for (const ev of this.events) {
      if (ev.beatPosition > beat) break;
      beats = ev.beats;
    }
    return beats;
  }

  getBeatTypeAt(beat: number): number {
    let beatType = this.defaultBeatType;
    for (const ev of this.events) {
      if (ev.beatPosition > beat) break;
      beatType = ev.beatType;
    }
    return beatType;
  }

  getMeasureIndexAtBeat(beat: number, measureStartBeats: number[]): number {
    let lo = 0;
    let hi = measureStartBeats.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (measureStartBeats[mid] <= beat) {
        lo = mid;
      } else {
        hi = mid - 1;
      }
    }
    return lo;
  }
}
