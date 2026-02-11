/**
 * Accompaniment Engine
 *
 * Core engine that manages accompaniment playback with dynamic Lead/Follow
 * role switching. Integrates with the ScoreFollower and MIDI output.
 *
 * - Lead mode: AI drives tempo, performer adapts
 * - Follow mode: AI follows performer's tempo changes
 * - Wait: HMM paused, listening for start cue
 * - Listen: Transition from wait, actively syncing to performer
 */

import type {
  AccompanimentState,
  EngineState,
  MeasureAnnotation,
  MidiNoteMessage,
  MotionCue,
  NoteEvent,
  ParsedScore,
  RoleDirective,
  WaitDirective,
} from "./types";
import { ScoreFollower } from "./score-follower";
import { getRoleForMeasure } from "./musicxml-parser";
import { eventBus } from "./event-bus";
import type {
  AudioReferenceAnalyser,
  AudioReferenceProfile,
} from "./audio-reference";

export class AccompanimentEngine {
  private score: ParsedScore | null = null;
  private scoreFollower: ScoreFollower;
  private accompNotes: NoteEvent[] = [];
  private engineState: EngineState = "idle";
  private currentRole: RoleDirective = {
    mode: "follow",
    strength: "moderate",
    factor: 0.3,
  };
  private currentMeasure = 1;
  private currentBeat = 0;
  private tempo = 120;
  private leadFollowRatio = 0.3;
  private playbackTimer: ReturnType<typeof setTimeout> | null = null;
  private accompIndex = 0;
  private autoPlayTimer: ReturnType<typeof setInterval> | null = null;
  private autoPlayBeat = 0;
  private autoPlayMode = false;
  private audioRef: AudioReferenceAnalyser | null = null;
  private audioRefProfile: AudioReferenceProfile | null = null;
  private mutedParts: Set<number> = new Set();

  private onNoteOutput: ((note: NoteEvent, time: number) => void) | null = null;
  private onStateChange: ((state: AccompanimentState) => void) | null = null;

  constructor() {
    this.scoreFollower = new ScoreFollower();

    this.scoreFollower.setStateUpdateCallback((state) => {
      if (this.autoPlayMode && state.confidence > 0.3) {
        const blend = 1 - this.leadFollowRatio;
        this.autoPlayBeat =
          this.autoPlayBeat * this.leadFollowRatio +
          state.currentBeat * blend;
      }

      this.currentBeat = this.autoPlayMode
        ? this.autoPlayBeat
        : state.currentBeat;
      if (this.autoPlayMode && this.score) {
        const beatsPerMeasure = this.score.timeSignature.beats;
        const playbackIndex = Math.floor(this.autoPlayBeat / beatsPerMeasure);
        const slot = this.score.playbackOrder[playbackIndex] ?? 0;
        this.currentMeasure = this.score.measureNumbers[slot] ?? 0;
      } else {
        this.currentMeasure = state.currentMeasure;
      }

      if (this.score) {
        const newRole = getRoleForMeasure(
          this.score.measures,
          this.currentMeasure
        );
        if (
          newRole.mode !== this.currentRole.mode ||
          newRole.strength !== this.currentRole.strength
        ) {
          this.currentRole = newRole;
          this.leadFollowRatio = newRole.factor;
          eventBus.emit({ type: "role_change", data: newRole });
        }
      }

      const followerTempo = state.estimatedTempo;
      const baseTempo = this.score?.tempo ?? 120;
      const minTempo = baseTempo * 0.5;
      const maxTempo = baseTempo * 2.0;
      const blended =
        baseTempo * this.leadFollowRatio +
        followerTempo * (1 - this.leadFollowRatio);
      this.tempo = Math.max(minTempo, Math.min(maxTempo, blended));

      eventBus.emit({
        type: "tempo_change",
        data: { tempo: this.tempo },
      });

      this.scheduleAccompaniment();
      this.emitState();
    });

    // Listen for motion cues
    eventBus.on("motion_cue", (e) => this.handleMotionCue(e.data));
  }

  loadScore(score: ParsedScore, options?: { soloPartIndex?: number }): void {
    this.score = score;
    this.mutedParts.clear();

    let soloPart;
    let accompParts;
    if (options?.soloPartIndex !== undefined) {
      soloPart = score.parts[options.soloPartIndex];
      accompParts = score.parts.filter((_, i) => i !== options.soloPartIndex);
    } else {
      soloPart = score.parts.find((p) => p.isSolo);
      accompParts = score.parts.filter((p) => !p.isSolo);
    }

    if (soloPart) {
      this.scoreFollower.loadScore(
        soloPart.notes,
        score.tempo,
        score.timeSignature.beats,
        score.playbackOrder,
        score.measureNumbers
      );
    }

    this.accompNotes = accompParts.flatMap((p) => p.notes);
    this.accompNotes.sort((a, b) => a.startBeat - b.startBeat);
    this.tempo = score.tempo;

    // Check if first measure has a wait directive
    const firstMeasure = score.measures.find((m) => m.measureNumber === 1);
    if (firstMeasure?.wait) {
      this.engineState = "waiting";
    }

    this.emitState();
  }

  setNoteOutputCallback(
    cb: (note: NoteEvent, time: number) => void
  ): void {
    this.onNoteOutput = cb;
  }

  setStateChangeCallback(
    cb: (state: AccompanimentState) => void
  ): void {
    this.onStateChange = cb;
  }

  start(): void {
    if (!this.score) return;

    const firstMeasure = this.score.measures.find(
      (m) => m.measureNumber === 1
    );
    if (firstMeasure?.wait) {
      this.engineState = "waiting";
      this.handleWaitDirective(firstMeasure.wait);
    } else {
      this.engineState = "playing";
      this.scoreFollower.start();
      this.startAutoPlay();
    }

    eventBus.emit({ type: "playback_start" });
    this.emitState();
  }

  stop(): void {
    this.engineState = "idle";
    this.scoreFollower.stop();
    this.stopAutoPlay();
    this.accompIndex = 0;
    this.currentBeat = 0;
    this.currentMeasure = this.score?.measureNumbers[0] ?? 0;
    this.autoPlayBeat = 0;
    if (this.playbackTimer) {
      clearTimeout(this.playbackTimer);
      this.playbackTimer = null;
    }
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

  private startAutoPlay(): void {
    this.stopAutoPlay();
    this.autoPlayMode = true;
    this.autoPlayBeat = this.currentBeat;

    const tickMs = 50;
    this.autoPlayTimer = setInterval(() => {
      if (this.engineState !== "playing" && this.engineState !== "listening")
        return;

      const baseTempo = this.score?.tempo ?? 120;
      const minTempo = baseTempo * 0.5;
      const maxTempo = baseTempo * 2.0;
      const rawTempo = this.audioRef
        ? this.audioRef.getTempoAtBeat(this.autoPlayBeat)
        : this.tempo;
      const effectiveTempo = Math.max(minTempo, Math.min(maxTempo, rawTempo));

      const beatsPerTick = (effectiveTempo / 60000) * tickMs;
      this.autoPlayBeat += beatsPerTick;
      this.currentBeat = this.autoPlayBeat;

      const beatsPerMeasure = this.score?.timeSignature.beats ?? 4;
      const playbackIndex = Math.floor(this.autoPlayBeat / beatsPerMeasure);

      if (this.score && playbackIndex >= this.score.playbackOrder.length) {
        this.stop();
        return;
      }

      if (this.score) {
        const slot = this.score.playbackOrder[playbackIndex] ?? 0;
        this.currentMeasure = this.score.measureNumbers[slot] ?? 0;

        const newRole = getRoleForMeasure(
          this.score.measures,
          this.currentMeasure
        );
        if (
          newRole.mode !== this.currentRole.mode ||
          newRole.strength !== this.currentRole.strength
        ) {
          this.currentRole = newRole;
          this.leadFollowRatio = newRole.factor;
          eventBus.emit({ type: "role_change", data: newRole });
        }
      }

      this.scheduleAccompaniment();
      this.emitState();
    }, tickMs);
  }

  private stopAutoPlay(): void {
    if (this.autoPlayTimer) {
      clearInterval(this.autoPlayTimer);
      this.autoPlayTimer = null;
    }
    this.autoPlayMode = false;
  }

  /** Process MIDI input from performer */
  processMidiNote(msg: MidiNoteMessage): void {
    if (this.engineState === "waiting") {
      this.engineState = "listening";
      this.scoreFollower.start();
      setTimeout(() => {
        if (this.engineState === "listening") {
          this.engineState = "playing";
          this.startAutoPlay();
          this.emitState();
        }
      }, 500);
      this.emitState();
    }

    if (
      this.engineState === "playing" ||
      this.engineState === "listening"
    ) {
      this.scoreFollower.processNote(msg, this.currentRole);
    }

    eventBus.emit({ type: "midi_note", data: msg });
  }

  /** Update a measure's annotation (from rehearsal commands) */
  updateMeasureAnnotation(annotation: MeasureAnnotation): void {
    if (!this.score) return;
    const existing = this.score.measures.find(
      (m) => m.measureNumber === annotation.measureNumber
    );
    if (existing) {
      if (annotation.role) existing.role = annotation.role;
      if (annotation.wait) existing.wait = annotation.wait;
    } else {
      this.score.measures.push(annotation);
      this.score.measures.sort(
        (a, b) => a.measureNumber - b.measureNumber
      );
    }
  }

  getState(): AccompanimentState {
    return {
      engineState: this.engineState,
      currentRole: this.currentRole,
      currentMeasure: this.currentMeasure,
      currentBeat: this.currentBeat,
      tempo: this.tempo,
      leadFollowRatio: this.leadFollowRatio,
    };
  }

  setAudioReference(
    analyser: AudioReferenceAnalyser,
    profile: AudioReferenceProfile
  ): void {
    this.audioRef = analyser;
    this.audioRefProfile = profile;
  }

  getScoreFollower(): ScoreFollower {
    return this.scoreFollower;
  }

  private handleWaitDirective(wait: WaitDirective): void {
    if (wait.type === "wait" && wait.duration) {
      this.playbackTimer = setTimeout(() => {
        this.engineState = "listening";
        this.scoreFollower.start();
        setTimeout(() => {
          if (this.engineState === "listening") {
            this.engineState = "playing";
            this.startAutoPlay();
            this.emitState();
          }
        }, 500);
        this.emitState();
      }, wait.duration * 1000);
    }
  }

  private handleMotionCue(cue: MotionCue): void {
    if (this.engineState === "waiting") {
      if (
        cue.type === "breath" ||
        cue.type === "preparation" ||
        cue.type === "nod"
      ) {
        if (cue.confidence > 0.6) {
          this.engineState = "listening";
          this.scoreFollower.start();
          setTimeout(() => {
            if (this.engineState === "listening") {
              this.engineState = "playing";
              this.startAutoPlay();
              this.emitState();
            }
          }, 300);
          this.emitState();
        }
      }
    }

    if (this.engineState === "playing" && cue.type === "breath") {
      const baseTempo = this.score?.tempo ?? 120;
      const minTempo = baseTempo * 0.7;
      const maxTempo = baseTempo * 1.3;
      const nudge = (cue.confidence - 0.5) * 2;
      this.tempo = Math.max(minTempo, Math.min(maxTempo, this.tempo + nudge));
    }
  }

  private scheduleAccompaniment(): void {
    if (
      this.engineState !== "playing" &&
      this.engineState !== "listening"
    )
      return;

    const lookAhead = 2;
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
    const state = this.getState();
    this.onStateChange?.(state);
    eventBus.emit({ type: "engine_state", data: state });
  }
}
