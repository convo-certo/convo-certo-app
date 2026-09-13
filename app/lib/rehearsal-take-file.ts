import { requireTakeScoreContext } from "./take-score-context";
import { readEnsembleTuning } from "./ensemble-tuning";
import { readReferenceProfile } from "./reference-profile";
import { readRehearsalPlan } from "./rehearsal-plan";
import { scoreKey, type RehearsalTake } from "./rehearsal-takes";
import { workSignature } from "./score-signature";
import type { ParsedScore } from "./types";

export const takeFileLimit = 16_000_000;

export function readRehearsalTake(text: string, score: ParsedScore, seatId: string): RehearsalTake {
  const invalid = (): never => { throw new Error("テイクの記録が不正です。元のファイルを選び直してください。"); };
  if (new TextEncoder().encode(text).length > takeFileLimit) throw new Error("テイクは16MB以下のファイルを選んでください。");
  let take: RehearsalTake;
  try { take = JSON.parse(text); } catch { return invalid(); }
  const number = (value: unknown, min: number, max: number, integer = false) => typeof value === "number" && Number.isFinite(value) && value >= min && value <= max && (!integer || Number.isInteger(value));
  const string = (value: unknown, max: number) => typeof value === "string" && value.length <= max;
  const leaders = new Set(["player", "conductor", ...score.parts.filter(part => !part.isSolo).map(part => part.id)]);
  if (!take || typeof take !== "object" || !string(take.id, 200) || !take.id || !string(take.createdAt, 100) || !Number.isFinite(Date.parse(take.createdAt)) || !string(take.title, 2000) || !string(take.feedback, 2000) || typeof take.changedSetup !== "boolean") invalid();
  if (take.scoreKey !== scoreKey(score) || take.seatId !== seatId) throw new Error("保存時と同じ譜面・移調・担当を選んでからテイクを開いてください。");
  if (take.scoreContext !== undefined) requireTakeScoreContext(score, take);
  if (!number(take.duration, 0, 601) || !number(take.startBeat, 0, score.totalBeats) || !number(take.baseTempo, 20, 300) || !["lead", "follow"].includes(take.mode) || !leaders.has(take.leader)) invalid();
  if (!take.practice || !["accompany", "listen", "wait"].includes(take.practice.mode) || !number(take.practice.countInBars, 0, 2, true) || typeof take.practice.click !== "boolean") invalid();
  if (take.experience !== undefined && (!take.experience || !["", "yes", "unsure", "no"].includes(take.experience.reuse) || !string(take.experience.notes, 2000))) invalid();
  if (!Array.isArray(take.inputs) || take.inputs.length > 20000 || !Array.isArray(take.states) || take.states.length > 20000 || !Array.isArray(take.cues) || take.cues.length > 20000 || !Array.isArray(take.annotations) || take.annotations.length > score.measureStartBeats.length) invalid();
  let previous = -1;
  for (const input of take.inputs) {
    if (!input || !number(input.elapsed, Math.max(0, previous), take.duration)) invalid();
    previous = input.elapsed;
    const message = input.message;
    if (!message || !["noteon", "noteoff"].includes(message.type) || !number(message.note, 0, 127, true) || !number(message.velocity, 0, 127) || !number(message.timestamp, 0, Number.MAX_SAFE_INTEGER) || (message.channel !== undefined && !number(message.channel, 0, 15, true))) invalid();
  }
  previous = -1;
  for (const item of take.states) {
    if (!item || !number(item.elapsed, Math.max(0, previous), take.duration)) invalid();
    previous = item.elapsed;
    const state = item.state;
    if (!state || !["idle", "playing", "waiting", "finished"].includes(state.status) || !["lead", "follow"].includes(state.mode) || !number(state.beat, 0, score.totalBeats + 1) || !number(state.measure, 0, Number.MAX_SAFE_INTEGER, true) || !number(state.tempo, 1, 1000) || !number(state.confidence, 0, 1) || (state.matchedBeat !== null && !number(state.matchedBeat, 0, score.totalBeats)) || (state.expression !== undefined && !string(state.expression, 2000)) || (state.leader !== undefined && !leaders.has(state.leader)) || (state.countInRemaining !== undefined && !number(state.countInRemaining, 0, 1000)) || (state.inputFeedback !== undefined && !["matched", "unmatched"].includes(state.inputFeedback))) invalid();
  }
  previous = -1;
  for (const cue of take.cues) { if (!number(cue, Math.max(0, previous), take.duration)) invalid(); previous = cue; }
  const tuning = readEnsembleTuning(take.tuning);
  const annotations = readRehearsalPlan(JSON.stringify({ version: 1, repertoireId: take.scoreKey, annotations: take.annotations }), take.scoreKey, score.measureStartBeats.length);
  if (annotations.some(annotation => annotation.leader !== undefined && !leaders.has(annotation.leader))) invalid();
  const reference = take.reference === null ? null : readReferenceProfile(JSON.stringify(take.reference));
  if (reference && (reference.workSignature !== workSignature(score) || reference.points.at(-1)!.beat > score.totalBeats)) invalid();
  return { ...take, tuning, annotations, reference };
}
