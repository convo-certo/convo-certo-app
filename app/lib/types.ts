/** ConvoCerto core type definitions */

// --- Lead/Follow Role System ---

export type RoleMode = "lead" | "follow";
export type RoleStrength = "strong" | "moderate" | "light";

export interface RoleDirective {
  mode: RoleMode;
  strength: RoleStrength;
  /** 0.0 = full follow, 1.0 = full lead */
  factor: number;
}

// --- Wait/Listen Tags ---

export type WaitType = "wait" | "listen";

export interface WaitDirective {
  type: WaitType;
  /** Duration in seconds (for wait); undefined = until trigger */
  duration?: number;
}

// --- Extended MusicXML Measure ---

export interface MeasureAnnotation {
  measureNumber: number;
  role?: RoleDirective;
  wait?: WaitDirective;
}

// --- Score Data ---

export interface NoteEvent {
  /** MIDI note number (0-127) */
  pitch: number;
  /** Start time in beats */
  startBeat: number;
  /** Duration in beats */
  durationBeats: number;
  /** Velocity (0-127) */
  velocity: number;
  /** Voice/part index */
  partIndex: number;
}

export interface ScorePart {
  id: string;
  name: string;
  /** true = solo part (user), false = accompaniment */
  isSolo: boolean;
  notes: NoteEvent[];
}

export interface ParsedScore {
  title: string;
  tempo: number;
  timeSignature: { beats: number; beatType: number };
  parts: ScorePart[];
  measures: MeasureAnnotation[];
  totalMeasures: number;
  totalBeats: number;
  /** Slot indices in playback sequence (repeats expanded) */
  playbackOrder: number[];
  /** Maps slot index → physical measure number */
  measureNumbers: number[];
}

// --- HMM Score Follower ---

export interface ScoreFollowerState {
  currentBeat: number;
  currentMeasure: number;
  estimatedTempo: number;
  confidence: number;
  isPlaying: boolean;
}

export interface HMMState {
  position: number;
  tempo: number;
  probability: number;
}

// --- Accompaniment Engine ---

export type EngineState = "idle" | "waiting" | "listening" | "playing";

export interface AccompanimentState {
  engineState: EngineState;
  currentRole: RoleDirective;
  currentMeasure: number;
  currentBeat: number;
  tempo: number;
  /** 0.0 = fully following user, 1.0 = fully leading */
  leadFollowRatio: number;
}

// --- MIDI ---

export interface MidiNoteMessage {
  type: "noteon" | "noteoff";
  note: number;
  velocity: number;
  timestamp: number;
}

export interface MidiDeviceInfo {
  id: string;
  name: string;
  manufacturer: string;
}

// --- Pose Detection ---

export interface PoseKeypoint {
  x: number;
  y: number;
  z: number;
  visibility: number;
}

export interface PoseFrame {
  timestamp: number;
  landmarks: PoseKeypoint[];
}

export interface BreathEvent {
  timestamp: number;
  type: "inhale" | "exhale";
  magnitude: number;
}

export interface MotionCue {
  type: "breath" | "nod" | "sway" | "preparation";
  timestamp: number;
  confidence: number;
}

// --- Rehearsal NLP ---

export type RehearsalCommandType =
  | "set_role"
  | "set_wait"
  | "set_tempo"
  | "set_dynamics"
  | "reset";

export interface RehearsalCommand {
  type: RehearsalCommandType;
  measureNumber?: number;
  role?: RoleDirective;
  wait?: WaitDirective;
  tempo?: number;
  dynamics?: number;
  rawText: string;
}

// --- Event Bus ---

export type ConvoCertoEvent =
  | { type: "midi_note"; data: MidiNoteMessage }
  | { type: "score_position"; data: ScoreFollowerState }
  | { type: "role_change"; data: RoleDirective }
  | { type: "motion_cue"; data: MotionCue }
  | { type: "rehearsal_command"; data: RehearsalCommand }
  | { type: "engine_state"; data: AccompanimentState }
  | { type: "tempo_change"; data: { tempo: number } }
  | { type: "playback_start" }
  | { type: "playback_stop" };
