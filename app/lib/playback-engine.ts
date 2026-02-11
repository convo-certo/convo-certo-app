import type {
  NoteEvent,
  ParsedScore,
  EngineState,
} from "./types";
import { eventBus } from "./event-bus";

export interface PlaybackState {
  engineState: EngineState;
  currentMeasure: number;
  currentBeat: number;
  tempo: number;
}

export class PlaybackEngine {
  private score: ParsedScore | null = null;
  private accompNotes: NoteEvent[] = [];
  private engineState: EngineState = "idle";
  private currentMeasure = 0;
  private currentBeat = 0;
  private tempo = 120;
  private autoPlayTimer: ReturnType<typeof setInterval> | null = null;
  private accompIndex = 0;
  private mutedParts: Set<number> = new Set();

  private lastEmitTime = 0;
  private readonly emitIntervalMs = 200;

  private onNoteOutput: ((note: NoteEvent, time: number) => void) | null = null;
  private onStateChange: ((state: PlaybackState) => void) | null = null;

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
    this.currentMeasure = score.measureNumbers[0] ?? 0;
    this.engineState = "idle";
    this.emitState();
  }

  setNoteOutputCallback(cb: (note: NoteEvent, time: number) => void): void {
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
    this.emitState();
  }

  getTempo(): number {
    return this.tempo;
  }

  start(): void {
    if (!this.score) return;
    this.engineState = "playing";
    this.startAutoPlay();
    eventBus.emit({ type: "playback_start" });
    this.emitState();
  }

  stop(): void {
    this.engineState = "idle";
    this.stopAutoPlay();
    this.accompIndex = 0;
    this.currentBeat = 0;
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
    const tickMs = 50;
    this.autoPlayTimer = setInterval(() => {
      if (this.engineState !== "playing") return;

      const beatsPerTick = (this.tempo / 60000) * tickMs;
      this.currentBeat += beatsPerTick;

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

      this.scheduleAccompaniment();
      this.emitStateThrottled();
    }, tickMs);
  }

  private stopAutoPlay(): void {
    if (this.autoPlayTimer) {
      clearInterval(this.autoPlayTimer);
      this.autoPlayTimer = null;
    }
  }

  private scheduleAccompaniment(): void {
    if (this.engineState !== "playing") return;

    const lookAhead = 4;
    const targetBeat = this.currentBeat + lookAhead;

    while (
      this.accompIndex < this.accompNotes.length &&
      this.accompNotes[this.accompIndex].startBeat <= targetBeat
    ) {
      const note = this.accompNotes[this.accompIndex];
      if (this.mutedParts.has(note.partIndex)) {
        this.accompIndex++;
        continue;
      }
      const beatDelta = note.startBeat - this.currentBeat;
      const msPerBeat = 60000 / this.tempo;
      const delayMs = Math.max(0, beatDelta * msPerBeat);
      this.onNoteOutput?.(note, delayMs);
      this.accompIndex++;
    }
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
