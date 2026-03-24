import type {
  ExpressionProfile,
  NoteEvent,
  ParsedScore,
  EngineState,
  TempoEvent,
} from "./types";
import { TempoMap } from "./tempo-map";
import { eventBus } from "./event-bus";

export interface PlaybackState {
  engineState: EngineState;
  currentMeasure: number;
  currentBeat: number;
  tempo: number;
}

export interface PlaybackEngineOptions {
  getAudioTime?: () => number;
}

export class PlaybackEngine {
  private score: ParsedScore | null = null;
  private accompNotes: NoteEvent[] = [];
  private engineState: EngineState = "idle";
  private currentMeasure = 0;
  private currentBeat = 0;
  private tempo = 120;
  private tempoMultiplier = 1.0;
  private autoPlayTimer: ReturnType<typeof setInterval> | null = null;
  private accompIndex = 0;
  private mutedParts: Set<number> = new Set();
  private expressionParams: ExpressionProfile | null = null;

  private tempoMap: TempoMap = new TempoMap([], 120);
  private audioStartTime = 0;
  private getAudioTime: () => number;

  private readonly scheduleAheadTime = 0.1;
  private readonly tickIntervalMs = 25;
  private scheduledUpToBeat = 0;

  private lastEmitTime = 0;
  private readonly emitIntervalMs = 50;

  private onNoteOutput: ((note: NoteEvent, delayMs: number, audioTime?: number) => void) | null = null;
  private onStateChange: ((state: PlaybackState) => void) | null = null;

  constructor(options?: PlaybackEngineOptions) {
    this.getAudioTime = options?.getAudioTime ?? (() => performance.now() / 1000);
  }

  loadScore(score: ParsedScore, options?: { excludeSolo?: boolean; excludePartIndex?: number }): void {
    this.score = score;
    this.mutedParts.clear();

    let partsToPlay;
    if (options?.excludePartIndex !== undefined) {
      partsToPlay = score.parts.filter((_, i) => i !== options.excludePartIndex);
    } else if (options?.excludeSolo) {
      partsToPlay = score.parts.filter((p) => !p.isSolo);
    } else {
      partsToPlay = score.parts;
    }

    this.accompNotes = partsToPlay.flatMap((p) => p.notes);
    this.accompNotes.sort((a, b) => a.startBeat - b.startBeat);
    this.tempo = score.tempo;
    this.expressionParams = score.expressionParams ?? null;
    this.tempoMultiplier = 1.0;
    this.currentMeasure = score.measureNumbers[0] ?? 0;
    this.engineState = "idle";
    this.emitState();
  }

  setTempoMap(events: TempoEvent[]): void {
    const defaultBpm = this.score?.tempo ?? 120;
    this.tempoMap = new TempoMap(events, defaultBpm);
  }

  setNoteOutputCallback(cb: (note: NoteEvent, delayMs: number, audioTime?: number) => void): void {
    this.onNoteOutput = cb;
  }

  setStateChangeCallback(cb: (state: PlaybackState) => void): void {
    this.onStateChange = cb;
  }

  setTempo(bpm: number): void {
    const baseTempo = this.score?.tempo ?? 120;
    const minTempo = baseTempo * 0.25;
    const maxTempo = baseTempo * 4.0;
    const newTempo = Math.max(minTempo, Math.min(maxTempo, bpm));
    const newMultiplier = newTempo / baseTempo;

    if (this.engineState === "playing") {
      const now = this.getAudioTime();
      const elapsedRaw = now - this.audioStartTime;
      const elapsedScaled = elapsedRaw * this.tempoMultiplier;
      this.audioStartTime = now - elapsedScaled / newMultiplier;
    }

    this.tempo = newTempo;
    this.tempoMultiplier = newMultiplier;
    this.emitState();
  }

  getTempo(): number {
    return this.tempo;
  }

  start(): void {
    if (!this.score) return;
    this.engineState = "playing";
    this.audioStartTime = this.getAudioTime();
    this.scheduledUpToBeat = 0;
    this.startAutoPlay();
    eventBus.emit({ type: "playback_start" });
    this.emitState();
  }

  stop(): void {
    this.engineState = "idle";
    this.stopAutoPlay();
    this.accompIndex = 0;
    this.currentBeat = 0;
    this.scheduledUpToBeat = 0;
    this.currentMeasure = this.score?.measureNumbers[0] ?? 0;
    eventBus.emit({ type: "playback_stop" });
    this.emitState();
  }

  mutePart(partIndex: number): void {
    this.mutedParts.add(partIndex);
  }

  unmutePart(partIndex: number): void {
    this.mutedParts.delete(partIndex);
  }

  isMuted(partIndex: number): boolean {
    return this.mutedParts.has(partIndex);
  }

  getMutedParts(): Set<number> {
    return new Set(this.mutedParts);
  }

  getState(): PlaybackState {
    return {
      engineState: this.engineState,
      currentMeasure: this.currentMeasure,
      currentBeat: this.currentBeat,
      tempo: this.tempo,
    };
  }

  private startAutoPlay(): void {
    this.stopAutoPlay();
    this.autoPlayTimer = setInterval(() => {
      this.tick();
    }, this.tickIntervalMs);
  }

  private tick(): void {
    if (this.engineState !== "playing") return;

    const now = this.getAudioTime();
    const elapsedRaw = now - this.audioStartTime;
    const elapsed = elapsedRaw * this.tempoMultiplier;

    this.currentBeat = this.tempoMap.secondsToBeat(elapsed);

    if (this.score && this.currentBeat >= this.score.totalBeats) {
      this.stop();
      return;
    }

    const playbackIndex = this.getMeasureIndex(this.currentBeat);

    if (this.score) {
      const slot = this.score.playbackOrder[playbackIndex];
      this.currentMeasure = this.score.measureNumbers[slot] ?? 0;
    }

    this.tempo = this.tempoMap.getBpmAtBeat(this.currentBeat) * this.tempoMultiplier;

    this.scheduleAccompaniment(now);
    this.emitStateThrottled();
  }

  private getMeasureIndex(beat: number): number {
    const starts = this.score?.measureStartBeats;
    if (!starts || starts.length === 0) {
      const bpm = this.score?.timeSignature.beats ?? 4;
      return Math.floor(beat / bpm);
    }
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= beat) {
        lo = mid;
      } else {
        hi = mid - 1;
      }
    }
    return lo;
  }

  private stopAutoPlay(): void {
    if (this.autoPlayTimer) {
      clearInterval(this.autoPlayTimer);
      this.autoPlayTimer = null;
    }
  }

  private applyExpression(note: NoteEvent, noteIndex: number): { note: NoteEvent; timingOffsetSec: number } {
    if (!this.expressionParams) return { note, timingOffsetSec: 0 };

    const params = this.expressionParams;
    const idx = Math.min(noteIndex, params.velocity.length - 1);
    if (idx < 0) return { note, timingOffsetSec: 0 };

    const velParam = params.velocity[idx] ?? 0;
    const velScale = Math.pow(2, velParam * 0.5);
    const expressiveVelocity = Math.max(1, Math.min(127,
      Math.round(note.velocity * velScale)
    ));

    const timingParam = params.timing[idx] ?? 0;
    const beatPeriod = params.beatPeriod[idx] ?? (60 / this.tempo);
    const timingOffsetSec = timingParam * beatPeriod * 0.3;

    const artParam = params.articulationLog[idx] ?? 0;
    const artScale = Math.pow(2, artParam * 0.3);
    const expressiveDuration = Math.max(0.01, note.durationBeats * artScale);

    return {
      note: {
        ...note,
        velocity: expressiveVelocity,
        durationBeats: expressiveDuration,
      },
      timingOffsetSec,
    };
  }

  private scheduleAccompaniment(now: number): void {
    if (this.engineState !== "playing") return;

    const lookAheadSeconds = this.scheduleAheadTime;
    const lookAheadElapsed = (now - this.audioStartTime + lookAheadSeconds) * this.tempoMultiplier;
    const lookAheadBeat = this.tempoMap.secondsToBeat(lookAheadElapsed);

    while (
      this.accompIndex < this.accompNotes.length &&
      this.accompNotes[this.accompIndex].startBeat <= lookAheadBeat
    ) {
      const note = this.accompNotes[this.accompIndex];
      if (this.mutedParts.has(note.partIndex)) {
        this.accompIndex++;
        continue;
      }

      if (note.startBeat > this.scheduledUpToBeat) {
        const { note: expNote, timingOffsetSec } = this.applyExpression(note, this.accompIndex);
        const noteSeconds = this.tempoMap.beatToSeconds(expNote.startBeat);
        const noteAudioTime = this.audioStartTime + noteSeconds / this.tempoMultiplier + timingOffsetSec;
        const delayMs = Math.max(0, (noteAudioTime - now) * 1000);
        this.onNoteOutput?.(expNote, delayMs, noteAudioTime);
      }

      this.accompIndex++;
    }

    this.scheduledUpToBeat = lookAheadBeat;
  }

  private emitState(): void {
    this.lastEmitTime = 0;
    const state = this.getState();
    this.onStateChange?.(state);
  }

  private emitStateThrottled(): void {
    const now = performance.now();
    if (now - this.lastEmitTime < this.emitIntervalMs) return;
    this.lastEmitTime = now;
    const state = this.getState();
    this.onStateChange?.(state);
  }
}
