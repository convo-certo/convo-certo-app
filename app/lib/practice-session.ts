import type { ReferenceProfile } from "./reference-profile";
import type { EnsembleTuning } from "./ensemble-tuning";
import type { OrchestraChair } from "./orchestra-space";
export interface OrchestraSpace {
  chairs: OrchestraChair[];
  listener: { x: number; z: number };
  enabled: boolean;
}
export interface PracticeEnsemble {
  tuning: EnsembleTuning;
  leader: string;
  reference?: ReferenceProfile | null;
}
export interface PracticeSession {
  version: 1;
  seatId: string;
  instrumentKey: number;
  shift: number;
  tuning: number;
  tempo: number;
  beat: number;
  startMeasure: number;
  loopEnd: number;
  loopEnabled: boolean;
  mode: "accompany" | "listen" | "wait";
  countInBars: number;
  click: boolean;
  volume: number;
  midiWritten: boolean;
  mutedPartIds?: string[];
  space?: OrchestraSpace;
  ensemble?: PracticeEnsemble;
}
