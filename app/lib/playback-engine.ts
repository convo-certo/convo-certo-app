import type {
  ExpressionProfile,
  NoteEvent,
  ParsedScore,
  EngineState,
  TempoEvent,
} from "./types";
import { TimeSignatureMap } from "./time-signature-map";
import { TempoMap } from "./tempo-map";
import { eventBus } from "./event-bus";

export interface PlaybackState {
  engineState: EngineState;
  currentMeasure: number;
  currentBeat: number;
  tempo: number;
  countingIn: boolean;
  countInBeat: number;
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

  private countInMeasures = 0;
  private countingIn = false;
  private countInStartTime = 0;
  private countInBeats = 0;
  private countInBeatDuration = 1;
  private countInBpm = 120;
  private countInBeatsPerMeasure = 4;
  private lastScheduledClickBeat = -1;
  private metronomeEnabled = false;

  private loopStartBeat: number | null = null;
  private loopEndBeat: number | null = null;

  private onClickOutput: ((accent: boolean, audioTime?: number) => void) | null = null;

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
    this.stop();
    this.score = score;
    this.loopStartBeat = null;
    this.loopEndBeat = null;
    this.tempoMap = new TempoMap([], score.tempo);
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

  setClickOutputCallback(cb: (accent: boolean, audioTime?: number) => void): void {
    this.onClickOutput = cb;
  }

  setCountInMeasures(measures: number): void {
    this.countInMeasures = Number.isFinite(measures) ? Math.max(0, Math.min(4, Math.floor(measures))) : 0;
  }

  getCountInMeasures(): number {
    return this.countInMeasures;
  }

  setMetronomeEnabled(enabled: boolean): void {
    if (enabled && !this.metronomeEnabled && !this.countingIn) {
      this.lastScheduledClickBeat = this.currentBeat - 0.000001;
    }
    this.metronomeEnabled = enabled;
  }

  isMetronomeEnabled(): boolean {
    return this.metronomeEnabled;
  }

  setLoop(startBeat: number | null, endBeat: number | null): void {
    const total = this.score?.totalBeats ?? 0;
    this.loopStartBeat = startBeat != null && Number.isFinite(startBeat)
      ? Math.max(0, Math.min(startBeat, total)) : null;
    this.loopEndBeat = endBeat != null && Number.isFinite(endBeat)
      ? Math.max(0, Math.min(endBeat, total)) : null;
    if (this.loopStartBeat != null && this.loopEndBeat != null && this.loopEndBeat <= this.loopStartBeat) {
      this.loopEndBeat = null;
    }
  }

  private get activeLoopEnd(): number | null {
    return this.loopStartBeat != null ? this.loopEndBeat : null;
  }

  getLoop(): { startBeat: number | null; endBeat: number | null } {
    return { startBeat: this.loopStartBeat, endBeat: this.loopEndBeat };
  }

  setTempo(bpm: number): void {
    if (!Number.isFinite(bpm)) return;
    const baseTempo = this.score?.tempo ?? 120;
    const minTempo = baseTempo * 0.25;
    const maxTempo = baseTempo * 4.0;
    const newTempo = Math.max(minTempo, Math.min(maxTempo, bpm));
    const newMultiplier = newTempo / baseTempo;

    if (this.engineState === "playing") {
      const now = this.getAudioTime();
      if (this.countingIn) {
        this.countInStartTime = now - (now - this.countInStartTime) * this.tempoMultiplier / newMultiplier;
      }
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
    if (!this.score || this.engineState === "playing") return;
    this.seekToBeat(this.currentBeat);

    if (this.countInMeasures > 0) {
      const signature = new TimeSignatureMap(this.score.timeSignatureChanges, this.score.timeSignature.beats, this.score.timeSignature.beatType);
      this.countInBeatsPerMeasure = signature.getBeatsAt(this.currentBeat);
      this.countInBeatDuration = 4 / signature.getBeatTypeAt(this.currentBeat);
      this.countInBpm = this.tempoMap.getBpmAtBeat(this.currentBeat);
      this.countInBeats = this.countInMeasures * this.countInBeatsPerMeasure;
      this.countingIn = true;
      this.countInStartTime = this.getAudioTime();
      this.lastScheduledClickBeat = -1;
      this.engineState = "playing";
      this.startAutoPlay();
      this.tick();
      eventBus.emit({ type: "playback_start" });
      this.emitState();
      return;
    }

    this.countingIn = false;
    this.engineState = "playing";
    this.audioStartTime = this.getAudioTime() - this.tempoMap.beatToSeconds(this.currentBeat) / this.tempoMultiplier;
    this.startAutoPlay();
    this.tick();
    eventBus.emit({ type: "playback_start" });
    this.emitState();
  }

  stop(): void {
    this.engineState = "idle";
    this.countingIn = false;
    this.stopAutoPlay();
    this.accompIndex = 0;
    this.currentBeat = 0;
    this.scheduledUpToBeat = 0;
    this.lastScheduledClickBeat = -1;
    this.currentMeasure = this.score?.measureNumbers[0] ?? 0;
    eventBus.emit({ type: "playback_stop" });
    this.emitState();
  }

  seekToBeat(beat: number): void {
    if (!this.score || !Number.isFinite(beat)) return;
    const clampedBeat = Math.max(0, Math.min(beat, Math.max(0, this.score.totalBeats - 0.01)));
    this.audioStartTime = this.getAudioTime() - this.tempoMap.beatToSeconds(clampedBeat) / this.tempoMultiplier;
    this.scheduledUpToBeat = clampedBeat;
    this.lastScheduledClickBeat = clampedBeat - 0.000001;
    this.accompIndex = 0;
    while (this.accompIndex < this.accompNotes.length && this.accompNotes[this.accompIndex].startBeat < clampedBeat) {
      this.accompIndex++;
    }

    this.currentBeat = clampedBeat;
    const playbackIndex = this.getMeasureIndex(clampedBeat);
    if (this.score) {
      const slot = this.score.playbackOrder[playbackIndex];
      this.currentMeasure = this.score.measureNumbers[slot] ?? 0;
    }
    this.emitState();
  }

  seekToMeasure(measureIndex: number): void {
    if (!this.score) return;
    const idx = Math.max(0, Math.min(measureIndex, this.score.measureStartBeats.length - 1));
    const beat = this.score.measureStartBeats[idx] ?? 0;
    this.seekToBeat(beat);
  }

  getTotalBeats(): number {
    return this.score?.totalBeats ?? 0;
  }

  getTotalMeasures(): number {
    return this.score?.measureStartBeats.length ?? 0;
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
      countingIn: this.countingIn,
      countInBeat: this.countingIn
        ? Math.floor(
            (this.getAudioTime() - this.countInStartTime) *
            this.tempoMultiplier *
            (this.countInBpm / 60) / this.countInBeatDuration
          )
        : 0,
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

    if (this.countingIn) {
      this.tickCountIn(now);
      if (this.countingIn) return;
    }

    const elapsedRaw = now - this.audioStartTime;
    const elapsed = elapsedRaw * this.tempoMultiplier;

    this.currentBeat = this.tempoMap.secondsToBeat(elapsed);

    if (
      this.loopStartBeat != null &&
      this.loopEndBeat != null &&
      this.currentBeat >= this.loopEndBeat
    ) {
      const loopStartSeconds = this.tempoMap.beatToSeconds(this.loopStartBeat);
      const loopDuration = this.tempoMap.beatToSeconds(this.loopEndBeat) - loopStartSeconds;
      const elapsedInLoop = (elapsed - loopStartSeconds) % loopDuration;
      this.seekToBeat(this.loopStartBeat);
      this.audioStartTime -= elapsedInLoop / this.tempoMultiplier;
      this.currentBeat = this.tempoMap.secondsToBeat(loopStartSeconds + elapsedInLoop);
    }

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

    if (this.metronomeEnabled) {
      this.scheduleMetronomeClicks(now);
    }

    this.scheduleAccompaniment(now);
    this.emitStateThrottled();
  }

  private tickCountIn(now: number): void {
    const elapsedRaw = now - this.countInStartTime;
    const elapsed = elapsedRaw * this.tempoMultiplier;
    const baseBpm = this.countInBpm / this.countInBeatDuration;
    const countInBeat = elapsed * (baseBpm / 60);
    const beatsPerMeasure = this.countInBeatsPerMeasure;

    this.scheduleCountInClicks(now, countInBeat, beatsPerMeasure, baseBpm);

    if (countInBeat >= this.countInBeats) {
      this.countingIn = false;
      this.audioStartTime = this.countInStartTime + this.countInBeats * 60 / baseBpm / this.tempoMultiplier - this.tempoMap.beatToSeconds(this.currentBeat) / this.tempoMultiplier;
      this.lastScheduledClickBeat = this.currentBeat - 0.000001;
      this.emitState();
      return;
    }

    this.emitStateThrottled();
  }

  private scheduleCountInClicks(
    now: number, currentBeat: number, beatsPerMeasure: number, baseBpm: number
  ): void {
    const lookAheadBeat = currentBeat + this.scheduleAheadTime * (baseBpm / 60) * this.tempoMultiplier;
    const startBeat = Math.max(0, Math.floor(this.lastScheduledClickBeat + 1));

    for (let b = startBeat; b <= Math.floor(lookAheadBeat) && b < this.countInBeats; b++) {
      if (b <= this.lastScheduledClickBeat) continue;
      const beatSec = (b / baseBpm) * 60;
      const audioTime = this.countInStartTime + beatSec / this.tempoMultiplier;
      const accent = b % beatsPerMeasure === 0;
      this.onClickOutput?.(accent, Math.max(now, audioTime));
      this.lastScheduledClickBeat = b;
    }
  }

  private scheduleMetronomeClicks(now: number): void {
    if (!this.score) return;
    const lookAheadSec = this.scheduleAheadTime;
    const lookAheadElapsed = (now - this.audioStartTime + lookAheadSec) * this.tempoMultiplier;
    const lookAheadBeat = this.tempoMap.secondsToBeat(lookAheadElapsed);
    const signature = new TimeSignatureMap(this.score.timeSignatureChanges, this.score.timeSignature.beats, this.score.timeSignature.beatType);
    const end = Math.min(lookAheadBeat, this.activeLoopEnd ?? this.score.totalBeats);
    for (let i = this.getMeasureIndex(this.currentBeat); i < this.score.measureStartBeats.length; i++) {
      const start = this.score.measureStartBeats[i];
      if (start > end) break;
      const measureEnd = this.score.measureStartBeats[i + 1] ?? this.score.totalBeats;
      const step = 4 / signature.getBeatTypeAt(start);
      for (let beat = start; beat < measureEnd && beat <= end; beat += step) {
        if (beat <= this.lastScheduledClickBeat || beat >= (this.activeLoopEnd ?? this.score.totalBeats)) continue;
        const audioTime = this.audioStartTime + this.tempoMap.beatToSeconds(beat) / this.tempoMultiplier;
        this.onClickOutput?.(beat === start, Math.max(now, audioTime));
        this.lastScheduledClickBeat = beat;
      }
    }
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
      this.accompNotes[this.accompIndex].startBeat <= lookAheadBeat &&
      this.accompNotes[this.accompIndex].startBeat < (this.activeLoopEnd ?? this.score?.totalBeats ?? Infinity)
    ) {
      const note = this.accompNotes[this.accompIndex];
      if (this.mutedParts.has(note.partIndex)) {
        this.accompIndex++;
        continue;
      }

      if (note.startBeat >= this.scheduledUpToBeat) {
        const { note: expNote, timingOffsetSec } = this.applyExpression(note, this.accompIndex);
        const noteSeconds = this.tempoMap.beatToSeconds(expNote.startBeat);
        const noteAudioTime = this.audioStartTime + noteSeconds / this.tempoMultiplier + timingOffsetSec;
        const delayMs = Math.max(0, (noteAudioTime - now) * 1000);
        this.onNoteOutput?.(expNote, delayMs, Math.max(now, noteAudioTime));
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
