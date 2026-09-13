import { requireTakeScoreContext } from "./take-score-context";
import { workSignature } from "./score-signature";
import { playerPart } from "./performance-seats";
import type { RehearsalTake } from "./rehearsal-takes";
import type { ParsedScore } from "./types";

export interface ReferencePoint { beat: number; tempoRatio: number; gain: number; articulation: number }
export interface ReferenceProfile {
  version: 1;
  title: string;
  source: { type: "recorded-input"; takeId: string; recordedAt: string };
  scoreTitle: string;
  workSignature: string;
  sourcePartId: string;
  points: ReferencePoint[];
}

export function profileFromTake(score: ParsedScore, take: RehearsalTake): ReferenceProfile {
  requireTakeScoreContext(score, take);
  if (take.changedSetup) throw new Error("設定を固定したテイクから表現を作ってください。");
  const part = playerPart(score);
  if (!part) throw new Error("奏者の席が選択されていません。");
  let lastBeat: number | null = null;
  const observations: { beat: number; time: number; velocity: number; articulation: number }[] = [];
  for (const { elapsed, state } of take.states) {
    if (state.matchedBeat == null || state.matchedBeat === lastBeat || state.confidence < 0.5) continue;
    const onset = [...take.inputs].reverse().find((input) => input.elapsed <= elapsed + 0.001 && elapsed - input.elapsed < 0.15 && input.message.type === "noteon" && input.message.velocity > 0);
    const written = part.notes.find((note) => note.startBeat === state.matchedBeat && note.pitch === onset?.message.note);
    if (!onset || !written) continue;
    lastBeat = state.matchedBeat;
    const release = take.inputs.find((input) => input.elapsed > onset.elapsed && input.message.note === onset.message.note && (input.message.type === "noteoff" || input.message.velocity === 0));
    const length = release ? (release.message.timestamp - onset.message.timestamp) / 1000 : written.durationBeats * 60 / take.baseTempo;
    observations.push({ beat: state.matchedBeat, time: onset.message.timestamp / 1000, velocity: onset.message.velocity, articulation: Math.max(0.5, Math.min(1.2, length / (written.durationBeats * 60 / state.tempo))) });
  }
  if (observations.length < 4) throw new Error("確かに照合できた音が4音以上あるテイクを使ってください。");
  const average = observations.reduce((sum, observation) => sum + observation.velocity, 0) / observations.length;
  const points: ReferencePoint[] = [];
  for (let i = 1; i < observations.length; i++) {
    const current = observations[i];
    const previous = observations[i - 1];
    const gap = current.beat - previous.beat;
    const seconds = current.time - previous.time;
    if (gap <= 0 || gap > 8 || seconds <= 0) continue;
    points.push({ beat: previous.beat, tempoRatio: Math.max(0.5, Math.min(1.5, gap * 60 / seconds / take.baseTempo)), gain: Math.max(0.65, Math.min(1.35, previous.velocity / average)), articulation: previous.articulation });
  }
  if (points.length < 3) throw new Error("連続したフレーズを記録してください。");
  const last = observations.at(-1)!;
  points.push({ ...points.at(-1)!, beat: last.beat, gain: Math.max(0.65, Math.min(1.35, last.velocity / average)), articulation: last.articulation });
  return { version: 1, title: `${score.title} · テイクの表現`, scoreTitle: score.title, workSignature: workSignature(score), sourcePartId: part.sourcePartId ?? part.id, source: { type: "recorded-input", takeId: take.id, recordedAt: take.createdAt }, points };
}

export function readReferenceProfile(text: string): ReferenceProfile {
  const profile = JSON.parse(text) as ReferenceProfile;
  if (!profile || profile.version !== 1 || typeof profile.workSignature !== "string" || typeof profile.title !== "string" || typeof profile.scoreTitle !== "string" || typeof profile.sourcePartId !== "string" || profile.source?.type !== "recorded-input" || typeof profile.source.takeId !== "string" || typeof profile.source.recordedAt !== "string" || !Array.isArray(profile.points) || profile.points.length < 3 || profile.points.length > 20000) throw new Error("対応する表現プロファイルではありません。");
  let last = -1;
  for (const point of profile.points) {
    if (!point || !Number.isFinite(point.beat) || point.beat < 0 || point.beat <= last || !Number.isFinite(point.tempoRatio) || point.tempoRatio < 0.5 || point.tempoRatio > 1.5 || !Number.isFinite(point.gain) || point.gain < 0.65 || point.gain > 1.35 || !Number.isFinite(point.articulation) || point.articulation < 0.5 || point.articulation > 1.2) throw new Error("表現曲線の値が不正です。");
    last = point.beat;
  }
  return profile;
}

export function referenceAt(profile: ReferenceProfile | null, beat: number): ReferencePoint {
  const neutral = { beat, tempoRatio: 1, gain: 1, articulation: 1 };
  if (!profile || beat < profile.points[0].beat || beat > profile.points.at(-1)!.beat) return neutral;
  let index = 0;
  while (index + 1 < profile.points.length && profile.points[index + 1].beat <= beat) index++;
  const left = profile.points[index];
  const right = profile.points[index + 1] ?? left;
  const fraction = right.beat === left.beat ? 0 : (beat - left.beat) / (right.beat - left.beat);
  return { beat, tempoRatio: left.tempoRatio + (right.tempoRatio - left.tempoRatio) * fraction, gain: left.gain + (right.gain - left.gain) * fraction, articulation: left.articulation + (right.articulation - left.articulation) * fraction };
}

export const artistReferences = [
  { title: "Wenzel Fuchs × Alan Gilbert × Berliner Philharmoniker", work: "Mozart K.622", url: "https://www.digitalconcerthall.com/en/concert/51189", status: "公式の演奏資料。録音の再利用・解析条件は未確認。表現モデルには未使用。" },
  { title: "Wenzel Fuchs × Elena Bashkirova", work: "Brahms Op.120-2", url: "https://www.euroarts.com/tv-license/4425-brahms-sonata-clarinet-and-piano-no2", status: "権利元の作品情報。録音の再利用・解析条件は未確認。表現モデルには未使用。" },
];
