import type { ExpressionDirective, MeasureAnnotation, ParsedScore } from "./types";

export const expressionPresets = {
  singing: { label: "歌うように", description: "フレーズを膨らませ、終わりに少し時間を取り、音をつなぐ" },
  tender: { label: "柔らかく寄り添う", description: "音量を抑え、奏者のテンポ変化を深く受け取る" },
  building: { label: "前へ、盛り上げる", description: "区間の終わりへ少しずつ音量と推進力を増す" },
  settling: { label: "語尾を収める", description: "区間の終わりへ少しずつ遅く、静かにする" },
  light: { label: "軽やかに", description: "音を短めに、少し軽い音量で弾く" },
} as const;

export function readExpression(value: unknown): ExpressionDirective {
  if (!value || typeof value !== "object") throw new Error("表情の指示が不正です。");
  const item = value as ExpressionDirective;
  if (!Object.hasOwn(expressionPresets, item.preset) || !Number.isFinite(item.amount) || item.amount < 0 || item.amount > 1 || (item.endMeasure != null && (!Number.isInteger(item.endMeasure) || item.endMeasure < 0))) throw new Error("表情の指示が不正です。");
  return { preset: item.preset, amount: item.amount, ...(item.endMeasure == null ? {} : { endMeasure: item.endMeasure }) };
}

export function expressionAt(score: ParsedScore, annotations: MeasureAnnotation[], beat: number) {
  let index = 0;
  while (index + 1 < score.measureStartBeats.length && score.measureStartBeats[index + 1] <= beat) index++;
  const measure = score.measureNumbers[score.playbackOrder[index]];
  const active = annotations.filter((a) => a.expression && a.measureNumber <= measure && (a.expression.endMeasure ?? a.measureNumber) >= measure).sort((a, b) => b.measureNumber - a.measureNumber)[0];
  const neutral = { tempo: 1, gain: 1, articulation: 1, follow: 0, label: "" };
  if (!active?.expression) return neutral;
  let start = index;
  while (start > 0 && score.measureNumbers[score.playbackOrder[start - 1]] >= active.measureNumber && score.playbackOrder[start - 1] < score.playbackOrder[start]) start--;
  let end = index + 1;
  while (end < score.playbackOrder.length && score.measureNumbers[score.playbackOrder[end]] <= (active.expression.endMeasure ?? active.measureNumber) && score.playbackOrder[end] > score.playbackOrder[end - 1]) end++;
  const first = score.measureStartBeats[start];
  const last = score.measureStartBeats[end] ?? score.totalBeats;
  const phase = Math.max(0, Math.min(1, (beat - first) / Math.max(0.001, last - first)));
  const amount = active.expression.amount;
  const value = { ...neutral, label: expressionPresets[active.expression.preset].label };
  switch (active.expression.preset) {
    case "singing": return { ...value, tempo: 1 - amount * 0.14 * phase ** 3, gain: 1 + amount * (0.22 * Math.sin(Math.PI * phase) - 0.12 * phase), articulation: 1 + 0.1 * amount, follow: 0.18 * amount };
    case "tender": return { ...value, gain: 1 - amount * 0.3, articulation: 1 + 0.08 * amount, follow: 0.25 * amount };
    case "building": return { ...value, tempo: 1 + amount * 0.08 * phase, gain: 1 + amount * 0.3 * phase };
    case "settling": return { ...value, tempo: 1 - amount * 0.25 * phase, gain: 1 - amount * 0.4 * phase, follow: 0.15 * amount };
    case "light": return { ...value, gain: 1 - amount * 0.1, articulation: 1 - amount * 0.4 };
  }
}
