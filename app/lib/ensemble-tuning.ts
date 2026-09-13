export interface EnsembleTuning {
  follower?: "nearest" | "sequence";
  followAmount: number;
  responseSeconds: number;
  expressionAmount: number;
  dynamicsAmount: number;
  articulationAmount: number;
  inputDelayMs: number;
  sectionBlend: number;
}

export const defaultEnsembleTuning: EnsembleTuning = {
  follower: "nearest", followAmount: 1, responseSeconds: 0.35, expressionAmount: 1,
  dynamicsAmount: 1, articulationAmount: 1, inputDelayMs: 0, sectionBlend: 0.2,
};

export const tuningFields: Record<Exclude<keyof EnsembleTuning, "follower">, { label: string; min: number; max: number; step: number }> = {
  followAmount: { label: "あなたへの追従", min: 0, max: 1.5, step: 0.05 },
  responseSeconds: { label: "反応をなじませる秒数", min: 0.12, max: 1.2, step: 0.02 },
  expressionAmount: { label: "表情の強さ", min: 0, max: 1.5, step: 0.05 },
  dynamicsAmount: { label: "強弱への反応", min: 0, max: 1, step: 0.05 },
  articulationAmount: { label: "音の切りへの反応", min: 0, max: 1, step: 0.05 },
  inputDelayMs: { label: "入力の遅れ補正（ms）", min: 0, max: 250, step: 5 },
  sectionBlend: { label: "相手の席との寄り添い", min: 0, max: 1, step: 0.05 },
};

export function readEnsembleTuning(value: unknown): EnsembleTuning {
  if (!value || typeof value !== "object") throw new Error("共奏設定が不正です。");
  const result = { ...defaultEnsembleTuning };
  for (const key of Object.keys(tuningFields) as (keyof typeof tuningFields)[]) {
    const number = (value as EnsembleTuning)[key];
    const { min, max } = tuningFields[key];
    if (!Number.isFinite(number) || number < min || number > max) throw new Error(`共奏設定「${tuningFields[key].label}」が範囲外です。`);
    result[key] = number;
  }
  const follower = (value as EnsembleTuning).follower ?? "nearest";
  if (follower !== "nearest" && follower !== "sequence") throw new Error("追従方式が不正です。");
  result.follower = follower;
  return result;
}
