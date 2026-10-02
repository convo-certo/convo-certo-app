import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import type { ConcertState } from "~/lib/concert-engine";
import { useLocale } from "~/lib/locale-context";
import { PracticeGuideDialog } from "./PracticeGuide";
import "./studio-entry.css";

export function StudioControls({ state, busy, mode, partName, inputLabel, children, onPlay, onListen, onTempo, onLoop, loop, first, last, total, repeated, onRange, entryRange, hasAccompaniment, onSelectEntry, onCountIn, countIn, onSave, saved, onExport, onExportXML, onSettings, partPicker, initialSetup = false, partRequest = 0, onConfirmPart, volume, onVolume, onRestart }: {
  state: ConcertState; busy: boolean; mode: "accompany" | "listen" | "wait";
  partName: string; inputLabel: string; children: ReactNode; partPicker: ReactNode; initialSetup?: boolean;
  partRequest?: number; onConfirmPart?: () => void;
  onPlay: () => void; onListen: () => void; onTempo: (tempo: number) => void;
  onLoop: (enabled: boolean) => void; loop: boolean; first: number; last: number; total: number; repeated?: boolean;
  onRange: (first: number, last: number) => void; countIn: number; onCountIn: (bars: number) => void;
  entryRange: { first: number; last: number } | null; hasAccompaniment: boolean; onSelectEntry: (includeLeadIn: boolean) => void;
  onSave: () => void; saved: boolean; onExportXML: () => void; onExport: () => void; onSettings: () => void;
  volume: number; onVolume: (volume: number) => void; onRestart: () => void;
}) {
  const { text } = useLocale();
  const [tool, setTool] = useState<string | null>(initialSetup ? "part" : null);
  const [guideOpen, setGuideOpen] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const previousTool = useRef(tool);
  const controls = useRef<HTMLDivElement>(null);
  const entryHelpId = useId();
  const leadInHelpId = useId();
  useEffect(() => { if (partRequest) setTool("part"); }, [partRequest]);
  useEffect(() => {
    if (partRequest && tool === "part") panel.current?.querySelector<HTMLSelectElement>("select")?.focus();
  }, [partRequest, tool]);
  useEffect(() => {
    if (tool && tool !== "part") panel.current?.scrollIntoView({ block: "nearest" });
    else if (previousTool.current && previousTool.current !== "part") controls.current?.closest(".score-page")?.scrollTo({ top: 0 });
    previousTool.current = tool;
  }, [tool]);
  const active = state.status === "playing" || state.status === "waiting";
  const entryBars = entryRange ? entryRange.last - entryRange.first + 1 : 4;
  const entryLabel = text(`自分の入りの${entryBars}小節`, entryBars === 1 ? "My first-entry bar" : `${entryBars} bars from my first entry`);
  const entryHelp = !entryRange ? text("このパートには演奏できる音符がありません。別のパートを選んでください。", "This part has no playable notes. Choose another part.") : !hasAccompaniment ? text("伴奏の音符がありません。「お手本」で選んだ区間を確認できます。", "This score has no accompaniment notes. Use Listen to hear the selected passage.") : text("区間を選ぶと停止します。「演奏する」または「お手本」で始められます。", "Selecting a passage pauses playback. Use Play or Listen to begin.");
  const leadInHelp = !entryRange ? text("音符のあるパートを選ぶと、入りの位置を選べます。", "Choose a part with notes to select your entry.") : !hasAccompaniment ? text("入りの前に聴く伴奏がありません。", "There is no accompaniment to hear before your entry.") : entryRange.first === 1 ? text("曲の最初から入るため、前の小節はありません。", "Your part starts in the first bar, so there is no earlier bar.") : text("1小節前の伴奏を聴いてから、自分の入りへ。", "Hear one bar of accompaniment before your entry.");
  const toggle = (value: string) => setTool(previous => previous === value ? null : value);
  return <div ref={controls} className="studio-controls">
    <div className="studio-part"><button aria-expanded={tool === "part"} onClick={() => toggle("part")}>♩ {partName} <span>⌄</span></button><button className="studio-input-status" aria-label={text("楽器とマイクを確認", "Check instrument and microphone")} onClick={() => setTool("part")}>{inputLabel}</button></div>
    <div className="studio-toolbar" role="group" aria-label={text("練習の操作", "Practice controls")}>
      <button className="studio-play" disabled={busy} onClick={onPlay}>{active && mode !== "listen" ? text("■ 停止", "■ Stop") : text("▶ 演奏する", "▶ Play")}</button>
      <button aria-pressed={active && mode === "listen"} disabled={busy} onClick={onListen}>{active && mode === "listen" ? text("■ 試聴を止める", "■ Stop listening") : text("♫ お手本", "♫ Listen")}</button>
      <button aria-label={text(`テンポを調整 ${Math.round(state.tempo)} BPM`, `Adjust tempo ${Math.round(state.tempo)} BPM`)} aria-expanded={tool === "tempo"} onClick={() => toggle("tempo")}><strong>{Math.round(state.tempo)}</strong> <small>BPM</small></button>
      <button aria-expanded={tool === "loop"} className={loop ? "is-selected" : ""} onClick={() => toggle("loop")}>↻ {loop ? text(`${first}–${last} 小節`, `Bars ${first}–${last}`) : text("区間", "Loop")}</button>
      <button aria-expanded={tool === "expression"} onClick={() => toggle("expression")}>◒ {text("表情", "Expression")}</button>
      <button aria-label={text("保存と設定", "Save and settings")} aria-expanded={tool === "more"} onClick={() => toggle("more")}>•••</button>
    </div>
    {tool && <div ref={panel} className="studio-tool-panel" data-tool={tool} aria-label={tool === "expression" ? text("音の表情を聴き比べる", "Compare expression") : text("練習ツール", "Practice tools")}>
      <button className="studio-panel-close" aria-label={text("練習ツールを閉じる", "Close practice tools")} onClick={() => setTool(null)}>×</button>
      {tool === "part" && <><h4>{text("あなたのパート", "Your part")}</h4>{partPicker}<div className="studio-part-actions"><button className="concert-primary" disabled={busy} onClick={() => { onConfirmPart?.(); setTool(null); }}>{text("このパートで練習", "Practise this part")}</button></div></>}
      {tool === "tempo" && <><h4>{text("テンポ", "Tempo")}</h4><label className="studio-range"><span>{text("ゆっくり", "Slower")}</span><input aria-label={text("演奏テンポ", "Practice tempo")} type="range" min="20" max="240" value={Math.min(240, state.tempo)} onChange={event => onTempo(Number(event.target.value))}/><span>{Math.round(state.tempo)} BPM</span></label><label className="studio-countin">{text("カウントイン", "Count-in")}<select aria-label={text("カウントイン", "Count-in")} value={countIn} disabled={active || busy} onChange={event => onCountIn(Number(event.target.value))}><option value="0">{text("なし", "None")}</option><option value="1">{text("1小節", "1 bar")}</option><option value="2">{text("2小節", "2 bars")}</option></select></label></>}
      {tool === "loop" && <>
        <h4>{text("くり返す区間", "Loop a passage")}</h4>
        <div className="studio-entry">
          <button aria-label={entryLabel} aria-describedby={entryHelpId} disabled={busy || !entryRange} onClick={() => onSelectEntry(false)}><strong>{entryLabel}</strong>{entryRange && <span>{text(`${entryRange.first}–${entryRange.last} 小節`, `Bars ${entryRange.first}–${entryRange.last}`)}</span>}</button>
          <p id={entryHelpId}>{entryHelp}</p>
        </div>
        {repeated && <p className="concert-muted">{text("再生順の小節番号（楽譜の反復を含む）", "Bar numbers follow playback order, including repeats.")}</p>}
        <div className="studio-loop"><label>{text("開始", "From")}<input aria-label={text("開始小節", "Start bar")} type="number" min="1" max={total} value={first} onChange={event => { const next = Math.max(1, Math.min(total, Number(event.target.value) || 1)); onRange(next, Math.max(next, last)); }}/></label><span>—</span><label>{text("終了", "To")}<input aria-label={text("終了小節", "End bar")} type="number" min={first} max={total} value={last} onChange={event => onRange(first, Math.max(first, Math.min(total, Number(event.target.value) || first)))}/></label><button aria-pressed={loop} onClick={() => onLoop(!loop)}>{loop ? text("くり返し ON", "Loop on") : text("くり返す", "Turn loop on")}</button></div>
        <div className="studio-entry-leadin">
          <button aria-describedby={leadInHelpId} disabled={busy || !entryRange || entryRange.first <= 1 || !hasAccompaniment} onClick={() => onSelectEntry(true)}>{text("入りの1小節前から", "One bar before my entry")}</button>
          <p id={leadInHelpId}>{leadInHelp}</p>
        </div>
      </>}
      {tool === "expression" && children}
      {tool === "more" && <div className="studio-menu"><label className="studio-range">{text("伴奏音量", "Accompaniment volume")}<input aria-label={text("伴奏音量", "Accompaniment volume")} type="range" min="0" max="100" value={volume} onChange={event => onVolume(Number(event.target.value))}/><span>{volume}%</span></label><button disabled={busy} onClick={onRestart}>{text("この小節から入り直す", "Restart this bar")}</button><div className="studio-save-action"><button disabled={busy} onClick={onSave}>{text("この練習を保存", "Save practice")}</button>{saved && <span role="status" className="studio-save-status">{text("保存しました", "Saved")}</span>}</div><button disabled={busy} onClick={onExport}>{text("練習ファイルを書き出す", "Export practice file")}</button><button disabled={busy} onClick={onExportXML}>{text("指示付きMusicXMLを保存", "Export annotated MusicXML")}</button><button onClick={onSettings}>{text("楽器・伴奏の設定", "Instrument & accompaniment")}</button><button aria-haspopup="dialog" onClick={() => setGuideOpen(true)}>{text("使い方", "How to practise")}</button></div>}
    </div>}
    <PracticeGuideDialog open={guideOpen} onClose={() => setGuideOpen(false)} />
  </div>;
}
