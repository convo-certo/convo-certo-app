import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { ConcertEngine } from "~/lib/concert-engine";
import { expressionPresets } from "~/lib/expressive-intent";
import { expressionExcerpt, expressionPreviewAnnotations, expressionSoundLabels, expressionSoundLabelsEn, expressionPresetLabelsEn } from "~/lib/expression-preview";
import { useLocale } from "~/lib/locale-context";
import { expressionPreviewSetup } from "~/lib/expression-preview-setup";
import { OrchestraAudio } from "~/lib/orchestra-audio";
import type { OrchestraSpace, PracticeEnsemble } from "~/lib/practice-session";
import type { ExpressionDirective, MeasureAnnotation, ParsedScore } from "~/lib/types";

type PreviewMode = "before" | "after";
type PreviewPlayer = { audio: OrchestraAudio; engine: ConcertEngine; ready: Promise<void>; score: ParsedScore };
let activePreview: { id: symbol; stop: () => void } | null = null;

export function ExpressionPreview({ score, measure, annotations, demo = false, disabled = false, tempo, mutedParts = [], tuningHz = 440, volume = 0.65, ensemble, space, onBeforePlay, onApply }: {
  score: ParsedScore;
  measure: number;
  annotations: MeasureAnnotation[];
  demo?: boolean;
  disabled?: boolean;
  tempo?: number;
  mutedParts?: number[];
  tuningHz?: number;
  volume?: number;
  ensemble?: PracticeEnsemble;
  space?: OrchestraSpace;
  onBeforePlay: () => void;
  onApply?: (patch: Partial<MeasureAnnotation>) => void;
}) {
  const { text } = useLocale();
  const current = annotations.find(annotation => annotation.measureNumber === measure)?.expression;
  const [preset, setPreset] = useState<ExpressionDirective["preset"] | "">(current?.preset ?? "light");
  const [amount, setAmount] = useState(current?.amount ?? (demo ? 0.8 : 0.6));
  const [length, setLength] = useState(demo ? 2 : 1);
  const [mode, setMode] = useState<PreviewMode | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<"" | "interrupted" | "playback">("");
  const [applied, setApplied] = useState<"" | "applied" | "removed">("");
  const player = useRef<PreviewPlayer | null>(null);
  const identity = useRef(Symbol());
  const request = useRef(0);
  const descriptionId = useId();
  const excerpt = expressionExcerpt(score, measure, length);
  const baseTempo = tempo != null && Number.isFinite(tempo) ? Math.max(20, Math.min(300, tempo)) : score.tempo;
  const previewTuning = Number.isFinite(tuningHz) && tuningHz > 0 ? tuningHz : 440;
  const previewVolume = Number.isFinite(volume) ? Math.max(0, Math.min(1, volume)) : 0.65;
  const mutedKey = [...new Set(mutedParts.filter(index => Number.isInteger(index) && index >= 0 && index < score.parts.length))].sort((a, b) => a - b).join(",");
  const muted = new Set(mutedKey ? mutedKey.split(",").map(Number) : []);
  const setup = useMemo(() => expressionPreviewSetup(score.parts, ensemble, space), [score, ensemble, space]);
  const soloAudible = !score.parts.some(part => !part.isSolo && part.notes.length > 0);
  const soundingParts = excerpt ? score.parts.flatMap((part, index) => (soloAudible || !part.isSolo) && part.notes.some(note => note.startBeat < excerpt.end && note.startBeat + note.durationBeats > excerpt.start) ? [index] : []) : [];
  const hasSound = previewVolume > 0 && soundingParts.some(index => !muted.has(index) && setup.space.chairs.some(chair => chair.partIndex === index && chair.level > 0));
  const silentReason = !soundingParts.length ? text("この区間に試聴できる音符がありません", "No notes to preview in this passage") : !previewVolume ? text("音量を上げると試聴できます", "Turn up the volume to preview") : text("伴奏のミュート・席の音量を確認してください", "Check muted parts and instrument levels");

  const cancel = useCallback((dispose = false) => {
    request.current++;
    if (activePreview?.id === identity.current) activePreview = null;
    const instance = player.current;
    if (!instance) return;
    instance.engine.onState = () => {};
    instance.engine.onNote = () => {};
    instance.audio.onAvailabilityChanged = () => {};
    instance.engine.stop();
    if (dispose) {
      player.current = null;
      instance.engine.dispose();
      instance.audio.dispose();
    }
  }, []);

  const stop = useCallback(() => {
    cancel();
    setMode(null);
    setBusy(false);
    setProgress(0);
  }, [cancel]);

  useEffect(() => () => cancel(true), [score, cancel]);
  useEffect(() => {
    stop();
    setError("");
    setPreset(current?.preset ?? "light");
    setAmount(current?.amount ?? (demo ? 0.8 : 0.6));
    const first = expressionExcerpt(score, measure, 4);
    const end = current?.endMeasure ?? measure;
    let count = 1;
    if (first) {
      while (count < first.available && score.measureNumbers[score.playbackOrder[first.first + count]] <= end) count++;
    }
    setLength(demo ? 2 : count);
  }, [score, measure, current?.preset, current?.amount, current?.endMeasure, demo, stop]);
  useEffect(() => { stop(); }, [annotations, disabled, stop]);
  useEffect(() => { stop(); }, [baseTempo, mutedKey, previewTuning, previewVolume, stop]);
  useEffect(() => { stop(); }, [setup.key, stop]);
  useEffect(() => { setApplied(""); }, [score, measure]);

  const play = async (selected: PreviewMode) => {
    if (disabled || !excerpt || !hasSound) return;
    if (mode === selected) { stop(); return; }
    stop();
    activePreview?.stop();
    setError("");
    setMode(selected);
    setBusy(true);
    let token = request.current;
    try {
      onBeforePlay();
      let instance = player.current;
      if (!instance || instance.score !== score) {
        cancel(true);
        token = request.current;
        const audio = new OrchestraAudio();
        const engine = new ConcertEngine(() => audio.currentTime);
        engine.onSilence = () => audio.stop();
        instance = { audio, engine, ready: audio.prepare(score.parts), score };
        player.current = instance;
      }
      activePreview = { id: identity.current, stop };
      const { audio, engine } = instance;
      await instance.ready;
      if (token !== request.current || player.current !== instance) return;
      await audio.resume();
      if (token !== request.current || player.current !== instance) return;
      audio.setSoloAudible(soloAudible);
      audio.setTuning(previewTuning);
      audio.setVolume(previewVolume);
      audio.configureSpace(setup.space.chairs, setup.space.listener, setup.space.enabled);
      score.parts.forEach((_, index) => audio.setPartVolume(index, muted.has(index) ? 0 : 1));
      engine.load(score);
      engine.setTempo(baseTempo);
      engine.setPracticeOptions({ mode: "listen", countInBars: 0, click: false });
      engine.setTuning(setup.ensemble.tuning);
      engine.setReference(setup.ensemble.reference ?? null);
      engine.setLeader(setup.ensemble.leader);
      engine.setAnnotations(expressionPreviewAnnotations(annotations, measure, selected === "after" && preset ? { preset, amount, endMeasure: excerpt.endMeasure } : undefined));
      engine.onNote = (note, time, duration, notated) => {
        if (note.startBeat < excerpt.end) audio.play(note, time, Math.min(duration, (excerpt.end - note.startBeat) * 60 / engine.getState().tempo), notated);
      };
      engine.onState = state => {
        if (token !== request.current || player.current !== instance) return;
        if (state.status === "waiting") { engine.cue(); return; }
        if (state.beat >= excerpt.end || state.status === "finished") { stop(); return; }
        setProgress(Math.max(0, Math.min(100, (state.beat - excerpt.start) / (excerpt.end - excerpt.start) * 100)));
      };
      audio.onAvailabilityChanged = state => {
        if (token === request.current && state !== "running") {
          stop();
          setError("interrupted");
        }
      };
      engine.seek(excerpt.start);
      engine.start();
      setBusy(false);
    } catch {
      if (token !== request.current) return;
      cancel(true);
      setMode(null);
      setBusy(false);
      setError("playback");
    }
  };

  const change = () => { stop(); setApplied(""); setError(""); };
  const rangeLabel = excerpt && excerpt.count > 1 ? text(`${measure}–${excerpt.endMeasure}小節`, `Bars ${measure}–${excerpt.endMeasure}`) : text(`${measure}小節`, `Bar ${measure}`);
  const appliedMessage = applied === "applied" ? text(`${rangeLabel}の楽譜に残しました`, `Added to the score: ${rangeLabel}`) : applied === "removed" ? text(`${measure}小節の表情指示を消しました`, `Removed expression from bar ${measure}`) : "";

  return <section className="expression-preview" aria-label={text("表情を聴き比べる", "Compare expression")}>
    <div className="expression-preview-heading"><strong>{demo ? text("同じフレーズを聴き比べる", "Same phrase, different expression") : text("音で選ぶ", "Choose by listening")}</strong><span>{rangeLabel}</span></div>
    <div className="expression-preview-controls">
      <label>{text("音の変化", "Change")}<select aria-label={text("試す音の変化", "Expression to try")} value={preset} disabled={disabled} onChange={event => { change(); setPreset(event.target.value as ExpressionDirective["preset"] | ""); }}>
        {Object.entries(expressionSoundLabels).map(([key, label]) => <option key={key} value={key}>{text(label, expressionSoundLabelsEn[key as ExpressionDirective["preset"]])}</option>)}
        {current && <option value="">{text("この表情指示を消す", "Remove this expression")}</option>}
      </select></label>
      {!demo && <label>{text("区間", "Passage")}<select aria-label={text("表情をつける小節数", "Number of bars")} value={excerpt?.count ?? 1} disabled={disabled || !excerpt} onChange={event => { change(); setLength(Number(event.target.value)); }}>
        {Array.from({ length: excerpt?.available ?? 1 }, (_, index) => <option key={index + 1} value={index + 1}>{text(`${index + 1}小節`, `${index + 1} ${index === 0 ? "bar" : "bars"}`)}</option>)}
      </select></label>}
      <label className="expression-preview-amount">{text("変化の大きさ", "Amount")} <output>{Math.round(amount * 100)}%</output><input aria-label={text("表情の変化の大きさ", "Expression amount")} type="range" min="0" max="1" step="0.05" value={amount} disabled={disabled || !preset} onChange={event => { change(); setAmount(Number(event.target.value)); }}/></label>
    </div>
    <p id={descriptionId} className="expression-preview-effect">{preset ? text(`${expressionPresets[preset].label} · ${expressionSoundLabels[preset]}`, `${expressionPresetLabelsEn[preset]} · ${expressionSoundLabelsEn[preset]}`) : text("この小節に置いた表情指示を削除します", "Remove the expression added at this bar")}{setup.ensemble.tuning.expressionAmount === 0 && text("（設定で表情の反映がオフになっています）", " (Expression is turned off in settings)")}</p>
    <div className="expression-preview-transport"><div className="expression-preview-actions" aria-describedby={descriptionId}>
      <button type="button" aria-pressed={mode === "before"} disabled={disabled || !hasSound} onClick={() => void play("before")}><span aria-hidden="true">{mode === "before" ? "■" : "▶"}</span> A {text("この指示なし", "Without this change")}</button>
      <button type="button" aria-pressed={mode === "after"} disabled={disabled || !hasSound} onClick={() => void play("after")}><span aria-hidden="true">{mode === "after" ? "■" : "▶"}</span> B {text("変化を聴く", "Hear the change")}</button>
      {onApply && <button type="button" className="expression-preview-apply" disabled={disabled || !excerpt} onClick={() => {
        if (!excerpt) return;
        stop();
        onApply({ expression: preset ? { preset, amount, endMeasure: excerpt.endMeasure } : undefined });
        setApplied(preset ? "applied" : "removed");
      }}>{preset ? text("楽譜に残す", "Add to score") : text("指示を消す", "Remove change")}</button>}
    </div>
    <progress aria-label={text("表情の試聴位置", "Expression preview progress")} value={progress} max="100"/>
    <div className="expression-preview-status"><span role="status">{busy ? text("音源を準備中…", "Preparing sounds…") : mode ? text(`${mode === "before" ? "A" : "B"} 再生中`, `Playing ${mode === "before" ? "A" : "B"}`) : appliedMessage || (!hasSound ? silentReason : text(`${soloAudible ? "全パート" : "伴奏のみ"}・合図待ちは省略`, `${soloAudible ? "All parts" : "Accompaniment only"} · cue waits skipped`))}</span></div>
    {error && <p className="expression-preview-error" role="alert">{error === "interrupted" ? text("音声が中断されました。もう一度再生してください。", "Audio was interrupted. Press play to try again.") : text("音声を再生できませんでした。", "Couldn't play audio. Please try again.")}</p>}</div>
  </section>;
}
