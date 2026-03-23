import type { TempoEvent } from "./types";

export class TempoMap {
  readonly events: TempoEvent[];
  readonly defaultBpm: number;

  constructor(events: TempoEvent[], defaultBpm: number) {
    this.events = [...events].sort(
      (a, b) => a.beatPosition - b.beatPosition
    );
    this.defaultBpm = defaultBpm;
  }

  getBpmAtBeat(beat: number): number {
    let bpm = this.defaultBpm;

    for (const ev of this.events) {
      if (ev.beatPosition > beat) break;

      if (ev.type === "continuous" && ev.endBeatPosition != null && ev.endBpm != null) {
        if (beat <= ev.endBeatPosition) {
          const span = ev.endBeatPosition - ev.beatPosition;
          if (span <= 0) {
            bpm = ev.bpm;
          } else {
            const ratio = (beat - ev.beatPosition) / span;
            bpm = ev.bpm + (ev.endBpm - ev.bpm) * ratio;
          }
          return bpm;
        }
        bpm = ev.endBpm;
      } else {
        bpm = ev.bpm;
      }
    }

    return bpm;
  }

  beatToSeconds(beat: number): number {
    let seconds = 0;
    let prevBeat = 0;
    let currentBpm = this.defaultBpm;

    for (const ev of this.events) {
      if (ev.beatPosition >= beat) break;

      const segEnd = Math.min(ev.beatPosition, beat);
      seconds += this.segmentDuration(prevBeat, segEnd, currentBpm);
      prevBeat = segEnd;

      if (ev.type === "continuous" && ev.endBeatPosition != null && ev.endBpm != null) {
        const contEnd = Math.min(ev.endBeatPosition, beat);
        if (contEnd > prevBeat) {
          seconds += this.continuousSegmentDuration(
            prevBeat, contEnd, ev.beatPosition, ev.endBeatPosition, ev.bpm, ev.endBpm
          );
          prevBeat = contEnd;
        }
        if (beat > ev.endBeatPosition) {
          currentBpm = ev.endBpm;
        } else {
          return seconds;
        }
      } else {
        currentBpm = ev.bpm;
      }
    }

    if (prevBeat < beat) {
      seconds += this.segmentDuration(prevBeat, beat, currentBpm);
    }

    return seconds;
  }

  secondsToBeat(seconds: number): number {
    let accSeconds = 0;
    let prevBeat = 0;
    let currentBpm = this.defaultBpm;

    for (const ev of this.events) {
      const segDuration = this.segmentDuration(prevBeat, ev.beatPosition, currentBpm);
      if (accSeconds + segDuration >= seconds) {
        const remaining = seconds - accSeconds;
        return prevBeat + remaining * (currentBpm / 60);
      }
      accSeconds += segDuration;
      prevBeat = ev.beatPosition;

      if (ev.type === "continuous" && ev.endBeatPosition != null && ev.endBpm != null) {
        const contDuration = this.continuousSegmentDuration(
          ev.beatPosition, ev.endBeatPosition, ev.beatPosition, ev.endBeatPosition, ev.bpm, ev.endBpm
        );
        if (accSeconds + contDuration >= seconds) {
          return this.inverseContinuous(
            seconds - accSeconds, ev.beatPosition, ev.endBeatPosition, ev.bpm, ev.endBpm
          );
        }
        accSeconds += contDuration;
        prevBeat = ev.endBeatPosition;
        currentBpm = ev.endBpm;
      } else {
        currentBpm = ev.bpm;
      }
    }

    const remaining = seconds - accSeconds;
    return prevBeat + remaining * (currentBpm / 60);
  }

  private segmentDuration(startBeat: number, endBeat: number, bpm: number): number {
    const beats = endBeat - startBeat;
    if (beats <= 0) return 0;
    return (beats / bpm) * 60;
  }

  private continuousSegmentDuration(
    segStart: number, segEnd: number,
    evStart: number, evEnd: number,
    startBpm: number, endBpm: number
  ): number {
    const totalSpan = evEnd - evStart;
    if (totalSpan <= 0) return 0;

    const r0 = (segStart - evStart) / totalSpan;
    const r1 = (segEnd - evStart) / totalSpan;
    const bpmAt0 = startBpm + (endBpm - startBpm) * r0;
    const bpmAt1 = startBpm + (endBpm - startBpm) * r1;
    const avgBpm = (bpmAt0 + bpmAt1) / 2;
    const beatSpan = segEnd - segStart;

    if (avgBpm <= 0) return 0;
    return (beatSpan / avgBpm) * 60;
  }

  private inverseContinuous(
    targetSeconds: number,
    evStart: number, evEnd: number,
    startBpm: number, endBpm: number
  ): number {
    let lo = evStart;
    let hi = evEnd;

    for (let i = 0; i < 50; i++) {
      const mid = (lo + hi) / 2;
      const dur = this.continuousSegmentDuration(evStart, mid, evStart, evEnd, startBpm, endBpm);
      if (dur < targetSeconds) {
        lo = mid;
      } else {
        hi = mid;
      }
    }
    return (lo + hi) / 2;
  }
}

export function createTempoMap(events: TempoEvent[], defaultBpm: number): TempoMap {
  return new TempoMap(events, defaultBpm);
}
