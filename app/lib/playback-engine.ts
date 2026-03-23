import type {
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

  private tempoMap: TempoMap = new TempoMap([], 120);
  private audioStartTime = 0;
  private getAudioTime: () => number;

  private readonly scheduleAheadTime = 0.1;
  private readonly tickIntervalMs = 25;
  private scheduledUpToBeat = 0;

  private lastEmitTime = 0;
  private readonly emitIntervalMs = 200;

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
    this.tempo = Math.max(minTempo, Math.min(maxTempo, bpm));
    this.tempoMultiplier = this.tempo / baseTempo;
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

    const beatsPerMeasure = this.score?.timeSignature.beats ?? 4;
    const playbackIndex = Math.floor(this.currentBeat / beatsPerMeasure);

    if (this.score && playbackIndex >= this.score.playbackOrder.length) {
      this.stop();
      return;
    }

    if (this.score) {
      const slot = this.score.playbackOrder[playbackIndex];
      this.currentMeasure = this.score.measureNumbers[slot] ?? 0;
    }

    this.tempo = this.tempoMap.getBpmAtBeat(this.currentBeat) * this.tempoMultiplier;

    this.scheduleAccompaniment(now);
    this.emitStateThrottled();
  }

  private stopAutoPlay(): void {
    if (this.autoPlayTimer) {
      clearInterval(this.autoPlayTimer);
      this.autoPlayTimer = null;
    }
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
        const noteSeconds = this.tempoMap.beatToSeconds(note.startBeat);
        const noteAudioTime = this.audioStartTime + noteSeconds / this.tempoMultiplier;
        const delayMs = Math.max(0, (noteAudioTime - now) * 1000);
        this.onNoteOutput?.(note, delayMs, noteAudioTime);
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
