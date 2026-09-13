import type { MidiNoteMessage, NoteEvent } from "./types";
import type { PerformanceMatch } from "./performance-follower";

export interface LabeledInput {
  message: MidiNoteMessage;
  expectedBeat: number;
  targetBeat: number | null;
}

interface Follower {
  load(notes: NoteEvent[], tempo: number): void;
  match(message: MidiNoteMessage, expectedBeat: number, tempo: number): PerformanceMatch | null;
}

export function evaluateFollower(follower: Follower, notes: NoteEvent[], tempo: number, inputs: LabeledInput[], now = () => performance.now()) {
  follower.load(notes, tempo);
  let correct = 0, missed = 0, wrongPosition = 0, falseMatch = 0, rejectedExtra = 0;
  const errors: number[] = [], processing: number[] = [];
  const outcomes = inputs.map(({ message, expectedBeat, targetBeat }) => {
    if (message.type !== "noteon" || message.velocity <= 0) throw new Error("Evaluation inputs must be audible note onsets");
    if (!Number.isFinite(expectedBeat) || (targetBeat !== null && !Number.isFinite(targetBeat))) throw new Error("Evaluation beats must be finite");
    const start = now();
    const result = follower.match(message, expectedBeat, tempo);
    processing.push(now() - start);
    let outcome: "correct" | "missed" | "wrongPosition" | "falseMatch" | "rejectedExtra";
    if (targetBeat === null) {
      outcome = result ? "falseMatch" : "rejectedExtra";
      if (result) falseMatch++; else rejectedExtra++;
    } else if (!result) { missed++; outcome = "missed"; }
    else {
      const error = Math.abs(result.beat - targetBeat);
      errors.push(error);
      if (error <= 0.0001) { correct++; outcome = "correct"; }
      else { wrongPosition++; outcome = "wrongPosition"; }
    }
    return { timestamp: message.timestamp, targetBeat, matchedBeat: result?.beat ?? null, estimatedTempo: result?.tempo ?? null, outcome };
  });
  const percentile = (values: number[], quantile: number): number | null => {
    if (!values.length) return null;
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.max(0, Math.ceil(quantile * sorted.length) - 1)];
  };
  const labeledNotes = correct + missed + wrongPosition;
  return {
    inputCount: inputs.length, labeledNotes, extraNotes: falseMatch + rejectedExtra,
    correct, missed, wrongPosition, falseMatch, rejectedExtra,
    accuracy: labeledNotes ? correct / labeledNotes : null,
    matchedPositionErrorBeats: { p50: percentile(errors, 0.5), p95: percentile(errors, 0.95) },
    processingMs: { p50: percentile(processing, 0.5), p95: percentile(processing, 0.95) },
    outcomes,
  };
}
