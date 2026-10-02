import type { MeasureAnnotation } from "./types";
import { readExpression } from "./expressive-intent";
import { roleDirective } from "./rehearsal-nlp";

export function readRehearsalPlan(text: string, repertoireId: string, totalMeasures: number): MeasureAnnotation[] {
  const plan = JSON.parse(text);
  if (plan.version !== 1 || plan.repertoireId !== repertoireId || !Array.isArray(plan.annotations)) throw new Error("この楽章の練習設定ファイルを選択してください。");
  const seen = new Set<number>();
  return plan.annotations.map((value: MeasureAnnotation) => {
    if (!value || !Number.isInteger(value.measureNumber) || value.measureNumber < 1 || value.measureNumber > totalMeasures || seen.has(value.measureNumber)) throw new Error("練習設定の小節番号が不正です。");
    seen.add(value.measureNumber);
    const annotation: MeasureAnnotation = { measureNumber: value.measureNumber };
    if (value.memo != null) {
      if (typeof value.memo !== "string" || value.memo.length > 120) throw new Error("メモは120文字以内にしてください。");
      annotation.memo = value.memo;
    }
    if (value.leader != null) {
      if (typeof value.leader !== "string" || !value.leader || value.leader.length > 200) throw new Error("主導者の指定が不正です。");
      annotation.leader = value.leader;
    }
    if (value.expression) {
      annotation.expression = readExpression(value.expression);
      if ((annotation.expression.endMeasure ?? value.measureNumber) < value.measureNumber || (annotation.expression.endMeasure ?? value.measureNumber) > totalMeasures) throw new Error("表情の区間が不正です。");
    }
    if (value.role) {
      if (!["lead", "follow"].includes(value.role.mode) || !["strong", "moderate", "light"].includes(value.role.strength)) throw new Error("練習設定の役割が不正です。");
      annotation.role = roleDirective(value.role.mode, value.role.strength);
    }
    if (value.wait) {
      if (!["wait", "listen"].includes(value.wait.type) || (value.wait.duration != null && (!Number.isFinite(value.wait.duration) || value.wait.duration <= 0 || value.wait.duration > 30))) throw new Error("練習設定の待機時間が不正です。");
      annotation.wait = { type: value.wait.type, duration: value.wait.duration };
    }
    return annotation;
  });
}
