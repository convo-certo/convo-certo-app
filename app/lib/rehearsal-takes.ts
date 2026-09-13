import { requireTakeScoreContext, takeScoreContext } from "./take-score-context";
import { ConcertEngine, type ConcertObservation, type ConcertState } from "./concert-engine";
import type { ReferenceProfile } from "./reference-profile";
import type { EnsembleTuning } from "./ensemble-tuning";
import type { MeasureAnnotation, MidiNoteMessage, ParsedScore } from "./types";

export interface RehearsalTake {
  id: string;
  createdAt: string;
  scoreKey: string;
  scoreContext?: string;
  seatId: string;
  title: string;
  startBeat: number;
  baseTempo: number;
  mode: "lead" | "follow";
  leader: string;
  tuning: EnsembleTuning;
  annotations: MeasureAnnotation[];
  duration: number;
  inputs: { elapsed: number; message: MidiNoteMessage }[];
  states: { elapsed: number; state: ConcertState }[];
  feedback: string;
  experience?: { reuse: "" | "yes" | "unsure" | "no"; notes: string };
  cues: number[];
  changedSetup: boolean;
  reference: ReferenceProfile | null;
  practice: ReturnType<ConcertEngine["getPracticeOptions"]>;
}

export function scoreKey(score: ParsedScore): string {
  let hash = 2166136261;
  const text = JSON.stringify([score.title, score.totalBeats, score.measureNumbers, score.parts.map((p) => [p.id, p.notes.map((n) => [n.pitch, n.startBeat, n.durationBeats])])]);
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return (hash >>> 0).toString(16);
}

export class TakeRecorder {
  private started: number | null = null;
  readonly take: RehearsalTake;
  constructor(score: ParsedScore, seatId: string, engine: ConcertEngine, annotations: MeasureAnnotation[]) {
    const state = engine.getState();
    this.take = { id: crypto.randomUUID(), createdAt: new Date().toISOString(), scoreKey: scoreKey(score), scoreContext: takeScoreContext(score), seatId, title: score.title, startBeat: state.beat, baseTempo: engine.getBaseTempo(), mode: state.mode, leader: state.leader ?? "player", tuning: engine.getTuning(), annotations: structuredClone(annotations), duration: 0, inputs: [], states: [], feedback: "", cues: [], changedSetup: false, reference: engine.getReference(), practice: engine.getPracticeOptions() };
  }

  record(event: ConcertObservation): void {
    if (this.started == null) this.started = event.time;
    const elapsed = event.time - this.started;
    this.take.duration = Math.max(this.take.duration, elapsed);
    if (event.type === "control") {
      if (event.action === "cue") this.take.cues.push(elapsed);
      else this.take.changedSetup = true;
    } else if (event.type === "input") {
      if (this.take.inputs.length < 20000) this.take.inputs.push({ elapsed, message: { ...event.message } });
    } else if (event.state.status !== "idle" && this.take.states.length < 20000) {
      const last = this.take.states.at(-1);
      if (!last || elapsed - last.elapsed >= 0.09 || last.state.status !== event.state.status || last.state.matchedBeat !== event.state.matchedBeat) this.take.states.push({ elapsed, state: { ...event.state } });
    }
  }

  finish(): RehearsalTake { return structuredClone(this.take); }
}

export function summarizeTake(take: RehearsalTake) {
  const notes = take.inputs.filter((input) => input.message.type === "noteon" && input.message.velocity > 0).length;
  let matches = 0;
  let last: number | null = null;
  for (const { state } of take.states) if (state.matchedBeat != null && state.matchedBeat !== last) { matches++; last = state.matchedBeat; }
  const moving = take.states.filter(({ state }) => state.status === "playing");
  return { notes, matches, averageTempo: moving.length ? moving.reduce((sum, item) => sum + item.state.tempo, 0) / moving.length : 0, lastBeat: moving.at(-1)?.state.beat ?? take.startBeat };
}

export function replayTake(score: ParsedScore, take: RehearsalTake, tuning: EnsembleTuning): RehearsalTake {
  if (scoreKey(score) !== take.scoreKey) throw new Error("同じ譜面・移調・席のテイクを選んでください。");
  requireTakeScoreContext(score, take);
  if (take.changedSetup) throw new Error("途中で設定や位置を変えたテイクです。設定を固定して録り直してください。");
  if (take.duration > 600) throw new Error("比較するテイクは10分以内にしてください。");
  let now = 0;
  const engine = new ConcertEngine(() => now, false);
  engine.load(score);
  engine.setPracticeOptions(take.practice);
  engine.setTuning(tuning);
  engine.setTempo(take.baseTempo);
  engine.setMode(take.mode);
  engine.setLeader(take.leader);
  engine.setAnnotations(take.annotations);
  engine.setReference(take.reference);
  engine.seek(take.startBeat);
  const recorder = new TakeRecorder(score, take.seatId, engine, take.annotations);
  const off = engine.observe((event) => recorder.record(event));
  try {
    engine.start();
    let index = 0;
    let cue = 0;
    for (now = 0; now <= take.duration + 0.025; now += 0.025) {
      while (cue < take.cues.length && take.cues[cue] <= now) { engine.cue(); cue++; }
      while (index < take.inputs.length && take.inputs[index].elapsed <= now) engine.processNote(take.inputs[index++].message);
      engine.advance();
    }
    engine.stop();
    return recorder.finish();
  } finally { off(); engine.dispose(); }
}
