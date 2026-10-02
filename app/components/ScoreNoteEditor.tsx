import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { MeasureAnnotation } from "~/lib/types";
import { expressionSoundLabels, expressionSoundLabelsEn } from "~/lib/expression-preview";
import { useLocale } from "~/lib/locale-context";

export function ScoreNoteEditor({ measure, annotation, onChange, expressionEditor }: { measure: number; annotation?: MeasureAnnotation; onChange: (patch: Partial<MeasureAnnotation>) => void; expressionEditor?: ReactNode }) {
  const { text } = useLocale();
  const [memo, setMemo] = useState(annotation?.memo ?? "");
  useEffect(() => { setMemo(annotation?.memo ?? ""); }, [measure, annotation?.memo]);
  return <div className="score-note-editor" aria-label={text(`${measure}小節のメモと演奏指示`, `Bar ${measure} notes and instructions`)}>
    <div className="score-note-actions"><strong>{text(`${measure}小節`, `Bar ${measure}`)}</strong>
      <label className="score-note-wait"><input type="checkbox" checked={!!annotation?.wait} onChange={event => onChange({ wait: event.target.checked ? { type: "listen" } : undefined })}/>{text("ここで合図を待つ", "Wait for my cue here")}</label>
      {!expressionEditor && <label>{text("音の変化", "Expression")}<select aria-label={text("楽譜に残す音の変化", "Expression to mark on the score")} value={annotation?.expression?.preset ?? ""} onChange={event => onChange({ expression: event.target.value ? { preset: event.target.value as keyof typeof expressionSoundLabels, amount: annotation?.expression?.amount ?? 0.6, endMeasure: annotation?.expression?.endMeasure ?? measure } : undefined })}>
        <option value="">{text("指示なし", "As written")}</option>{Object.entries(expressionSoundLabels).map(([key, label]) => <option key={key} value={key}>{text(label, expressionSoundLabelsEn[key as keyof typeof expressionSoundLabels])}</option>)}
      </select></label>}
      {!expressionEditor && annotation?.expression && <label>{text("変化の大きさ", "Amount")}<input aria-label={text("楽譜の指示の強さ", "Expression amount")} type="range" min="0" max="1" step="0.05" value={annotation.expression.amount} onChange={event => onChange({ expression: { ...annotation.expression!, amount: Number(event.target.value) } })}/></label>}
    </div>
    {expressionEditor}
    <form onSubmit={event => { event.preventDefault(); onChange({ memo: memo.trim() || undefined }); }}>
      <input aria-label={text("楽譜に残すメモ", "Note on the score")} placeholder={text("息をたっぷり、など（自分用のメモ）", "A reminder for yourself, e.g. let it ring")} maxLength={120} value={memo} onChange={event => setMemo(event.target.value)}/>
      <button type="submit">{text("メモを残す", "Save note")}</button>
      {annotation?.memo && <button type="button" onClick={() => { setMemo(""); onChange({ memo: undefined }); }}>{text("メモを消す", "Remove note")}</button>}
    </form>
  </div>;
}
