import type { ParsedScore } from "./types";

export function takeScoreContext(score: ParsedScore): string {
  const ordered = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(ordered);
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, item]) => [key, ordered(item)]));
    return value;
  };
  const text = JSON.stringify(ordered({ ...score, parts: score.parts.map(({ generatedName, ...part }) => part) }));
  let first = 2166136261, second = 5381;
  for (let i = 0; i < text.length; i++) {
    first = Math.imul(first ^ text.charCodeAt(i), 16777619);
    second = Math.imul(second, 33) ^ text.charCodeAt(i);
  }
  return `score-v1:${text.length}:${(first >>> 0).toString(16)}:${(second >>> 0).toString(16)}`;
}

export function requireTakeScoreContext(score: ParsedScore, take: { scoreContext?: string }): void {
  if (!take.scoreContext) throw new Error("この旧形式テイクには楽譜の演奏条件が記録されていません。比較・表現の作成には新しく記録してください。");
  if (take.scoreContext !== takeScoreContext(score)) throw new Error("テイクと楽譜の演奏条件が違います。保存時のテンポ・強弱・拍子・担当を含む譜面を開いてください。");
}
