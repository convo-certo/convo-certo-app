/**
 * HMM-based Score Follower
 *
 * Tracks the performer's position in the score by matching incoming MIDI
 * note events against the expected note sequence. Uses a simplified HMM
 * where states correspond to note positions and transitions model tempo
 * variation.
 */

import type {
  HMMState,
  MidiNoteMessage,
  NoteEvent,
  RoleDirective,
  ScoreFollowerState,
} from "./types";
import { eventBus } from "./event-bus";

const NUM_TEMPO_HYPOTHESES = 5;
const TEMPO_RANGE_FACTOR = 0.3;
const PITCH_MATCH_PROB = 0.8;
const PITCH_NEAR_PROB = 0.15;
const PITCH_MISS_PROB = 0.05;

export class ScoreFollower {
  private soloNotes: NoteEvent[] = [];
  private baseTempo = 120;
  private states: HMMState[] = [];
  private currentPosition = 0;
  private lastNoteTime = 0;
  private isActive = false;
  private isPaused = false;
  private beatsPerMeasure = 4;
  private playbackOrder: number[] = [];
  private measureNumbers: number[] = [];

  private onStateUpdate: ((state: ScoreFollowerState) => void) | null = null;

  constructor() {
    this.initStates();
  }

  loadScore(
    soloNotes: NoteEvent[],
    tempo: number,
    beatsPerMeasure: number,
    playbackOrder?: number[],
    measureNumbers?: number[]
  ): void {
    this.soloNotes = soloNotes.sort((a, b) => a.startBeat - b.startBeat);
    this.baseTempo = tempo;
    this.beatsPerMeasure = beatsPerMeasure;
    this.playbackOrder = playbackOrder ?? [];
    this.measureNumbers = measureNumbers ?? [];
    this.reset();
  }

  setStateUpdateCallback(
    cb: (state: ScoreFollowerState) => void
  ): void {
    this.onStateUpdate = cb;
  }

  start(): void {
    this.isActive = true;
    this.isPaused = false;
    this.lastNoteTime = performance.now();
  }

  stop(): void {
    this.isActive = false;
    this.reset();
  }

  pause(): void {
    this.isPaused = true;
  }

  resume(): void {
    this.isPaused = false;
    this.lastNoteTime = performance.now();
  }

  /**
   * Process an incoming MIDI note event from the performer.
   */
  processNote(msg: MidiNoteMessage, role: RoleDirective): void {
    if (!this.isActive || this.isPaused || msg.type !== "noteon") return;
    if (this.soloNotes.length === 0) return;

    const now = msg.timestamp || performance.now();
    const deltaMs = now - this.lastNoteTime;
    this.lastNoteTime = now;

    // Observation: which score positions match this pitch?
    const observations = this.computeObservation(msg.note);

    // Transition: advance states based on elapsed time and tempo hypotheses
    this.advanceStates(deltaMs, role);

    // Update: combine transition and observation probabilities
    this.updateWithObservation(observations);

    // Normalize
    this.normalizeStates();

    // Find best state
    const best = this.getBestState();
    this.currentPosition = best.position;

    const currentBeat = this.soloNotes[this.currentPosition]?.startBeat ?? 0;
    const playbackIndex = Math.floor(currentBeat / this.beatsPerMeasure);
    let currentMeasure: number;
    if (this.playbackOrder.length > 0 && this.measureNumbers.length > 0) {
      const slot = this.playbackOrder[playbackIndex] ?? 0;
      currentMeasure = this.measureNumbers[slot] ?? 0;
    } else {
      currentMeasure = playbackIndex + 1;
    }

    const state: ScoreFollowerState = {
      currentBeat,
      currentMeasure,
      estimatedTempo: best.tempo,
      confidence: best.probability,
      isPlaying: this.isActive,
    };

    this.onStateUpdate?.(state);
    eventBus.emit({ type: "score_position", data: state });
  }

  getPosition(): number {
    return this.currentPosition;
  }

  getCurrentBeat(): number {
    return this.soloNotes[this.currentPosition]?.startBeat ?? 0;
  }

  getEstimatedTempo(): number {
    return this.getBestState().tempo;
  }

  private initStates(): void {
    this.states = [];
    for (let t = 0; t < NUM_TEMPO_HYPOTHESES; t++) {
      const tempoRatio =
        1 - TEMPO_RANGE_FACTOR + (2 * TEMPO_RANGE_FACTOR * t) / (NUM_TEMPO_HYPOTHESES - 1);
      this.states.push({
        position: 0,
        tempo: this.baseTempo * tempoRatio,
        probability: 1 / NUM_TEMPO_HYPOTHESES,
      });
    }
  }

  private reset(): void {
    this.currentPosition = 0;
    this.lastNoteTime = performance.now();
    this.initStates();
  }

  private computeObservation(pitch: number): Map<number, number> {
    const observations = new Map<number, number>();
    const searchWindow = 10;
    const start = Math.max(0, this.currentPosition - 2);
    const end = Math.min(
      this.soloNotes.length,
      this.currentPosition + searchWindow
    );

    for (let i = start; i < end; i++) {
      const note = this.soloNotes[i];
      if (note.pitch === pitch) {
        observations.set(i, PITCH_MATCH_PROB);
      } else if (Math.abs(note.pitch - pitch) <= 2) {
        observations.set(i, PITCH_NEAR_PROB);
      } else {
        observations.set(i, PITCH_MISS_PROB);
      }
    }

    return observations;
  }

  private advanceStates(deltaMs: number, role: RoleDirective): void {
    for (const state of this.states) {
      const beatsPerMs = state.tempo / 60000;
      const expectedBeatsElapsed = beatsPerMs * deltaMs;

      // In follow mode, be more tolerant of tempo variations
      // In lead mode, keep closer to the base tempo
      const tempoAdaptRate = role.mode === "follow" ? 0.3 : 0.1;

      // Advance position estimate
      const currentBeat =
        this.soloNotes[state.position]?.startBeat ?? 0;
      const targetBeat = currentBeat + expectedBeatsElapsed;

      // Find closest note position to target beat
      let bestPos = state.position;
      let bestDist = Infinity;
      const searchEnd = Math.min(
        this.soloNotes.length - 1,
        state.position + 5
      );
      for (let i = state.position; i <= searchEnd; i++) {
        const dist = Math.abs(this.soloNotes[i].startBeat - targetBeat);
        if (dist < bestDist) {
          bestDist = dist;
          bestPos = i;
        }
      }

      state.position = bestPos;

      if (deltaMs > 0 && bestPos > 0) {
        const actualBeatsElapsed =
          this.soloNotes[bestPos].startBeat -
          this.soloNotes[Math.max(0, bestPos - 1)].startBeat;
        if (actualBeatsElapsed > 0) {
          const impliedTempo = (actualBeatsElapsed / deltaMs) * 60000;
          const minTempo = this.baseTempo * 0.3;
          const maxTempo = this.baseTempo * 3.0;
          const clamped = Math.max(minTempo, Math.min(maxTempo, impliedTempo));
          state.tempo =
            state.tempo * (1 - tempoAdaptRate) +
            clamped * tempoAdaptRate;
        }
      }
    }
  }

  private updateWithObservation(
    observations: Map<number, number>
  ): void {
    for (const state of this.states) {
      const obsProb = observations.get(state.position) ?? PITCH_MISS_PROB;
      state.probability *= obsProb;
    }
  }

  private normalizeStates(): void {
    const sum = this.states.reduce((s, st) => s + st.probability, 0);
    if (sum > 0) {
      for (const state of this.states) {
        state.probability /= sum;
      }
    } else {
      const uniform = 1 / this.states.length;
      for (const state of this.states) {
        state.probability = uniform;
      }
    }
  }

  private getBestState(): HMMState {
    let best = this.states[0];
    for (const state of this.states) {
      if (state.probability > best.probability) {
        best = state;
      }
    }
    return best;
  }
}
