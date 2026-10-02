import { ScoreNoteEditor } from "./ScoreNoteEditor";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import type { OpenSheetMusicDisplay, VexFlowGraphicalNote } from "opensheetmusicdisplay";
import type { MeasureAnnotation, TempoEvent } from "~/lib/types";
import { expressionPresets } from "~/lib/expressive-intent";
import { expressionPresetLabelsEn } from "~/lib/expression-preview";
import type { Locale } from "~/lib/i18n";
import { useLocale } from "~/lib/locale-context";

interface ScoreDisplayProps {
  extraTools?: ReactNode;
  onAnnotationPreview?: (measure: number) => ReactNode;
  onAnnotation?: (measure: number, patch: Partial<MeasureAnnotation>) => void;
  compact?: boolean;
  transpose?: number;
  followPosition?: boolean;
  musicXML: string | null;
  currentMeasure: number;
  currentBeat: number;
  beatsPerMeasure: number;
  totalMeasures: number;
  engineState: "idle" | "waiting" | "listening" | "playing";
  measures: MeasureAnnotation[];
  measureNumbers: number[];
  locale?: Locale;
  onTempoMapReady?: (events: TempoEvent[]) => void;
  onSeek?: (sourceBeat: number) => void;
  focusVoice?: string;
  focusStaff?: string;
  focusLabel?: string;
}
interface ScoreAnchor { element: SVGGElement; beat: number; end: number; focused: boolean }

export function ScoreDisplay({ extraTools, compact = false, transpose = 0, followPosition = false, musicXML, currentMeasure, currentBeat, totalMeasures, engineState, measures, measureNumbers, onAnnotation, onAnnotationPreview, onTempoMapReady, onSeek, focusVoice, focusStaff, focusLabel }: ScoreDisplayProps) {
  const { locale, text } = useLocale();
  const textRef = useRef(text);
  textRef.current = text;
  const [pencil, setPencil] = useState(false);
  const [selectedMeasure, setSelectedMeasure] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const focusEditor = useRef(false);
  const keyboardHelp = useId();
  const interactive = !!(onSeek || onAnnotation);
  const anchors = useRef<ScoreAnchor[]>([]);
  const highlighted = useRef<ScoreAnchor[]>([]);
  const tempoCallback = useRef(onTempoMapReady);
  tempoCallback.current = onTempoMapReady;
  const [printNotice, setPrintNotice] = useState("");
  useEffect(() => {
    const receive = (event: Event) => {
      const result = (event as CustomEvent).detail;
      if (result?.status === "failed") { setPrintNotice(""); setRenderError(textRef.current(result.error ?? "印刷できませんでした。", "Printing failed. Please try again.")); }
      else setPrintNotice(result?.status === "cancelled" ? textRef.current("印刷をキャンセルしました。", "Printing cancelled.") : textRef.current("印刷処理を完了しました。", "Printing complete."));
    };
    window.addEventListener("convocerto-print", receive);
    return () => window.removeEventListener("convocerto-print", receive);
  }, []);
  const [zoom, setZoom] = useState(1);
  const [autoScroll, setAutoScroll] = useState(true);
  const [renderError, setRenderError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [renderRevision, setRenderRevision] = useState(0);
  const [focusAvailable, setFocusAvailable] = useState(true);
  const [width, setWidth] = useState(0);
  const active = engineState !== "idle";

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(([entry]) => setWidth((previous) => Math.abs(entry.contentRect.width - previous) > 2 ? entry.contentRect.width : previous));
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!musicXML || !containerRef.current || !width) return;
    let cancelled = false;
    let osmd: OpenSheetMusicDisplay | undefined;
    setLoaded(false);
    anchors.current = []; highlighted.current = [];
    const load = async () => {
      try {
        const module = await import("opensheetmusicdisplay");
        if (cancelled || !containerRef.current) return;
        containerRef.current.replaceChildren();
        osmd = new module.OpenSheetMusicDisplay(containerRef.current, {
          autoResize: false, backend: "svg", pageFormat: "A4_P", drawTitle: !followPosition && width >= 600, drawSubtitle: false,
          drawComposer: !followPosition && width >= 600, drawCredits: false, drawPartNames: true, drawMeasureNumbers: true,
          followCursor: false, cursorsOptions: [],
        });
        osmd.EngravingRules.RenderRehearsalMarks = false;
        osmd.EngravingRules.RenderMultipleRestMeasures = false;
        osmd.EngravingRules.AutoGenerateMultipleRestMeasuresFromRestMeasures = false;
        await osmd.load(new DOMParser().parseFromString(musicXML, "application/xml"));
        if (cancelled) return;
        osmd.TransposeCalculator = new module.TransposeCalculator();
        osmd.Sheet.Transpose = transpose; osmd.Zoom = zoom * (followPosition ? 1 : Math.min(1, width / 600)); osmd.render();
        const elements = new Map<SVGGElement, ScoreAnchor>();
        for (const row of osmd.GraphicSheet.MeasureList) for (const measure of row) {
          if (!measure) continue;
          for (const entry of measure.staffEntries) for (const voice of entry.graphicalVoiceEntries) for (const note of voice.notes) {
            const element = (note as VexFlowGraphicalNote).getSVGGElement();
            if (!element) continue;
            const beat = note.sourceNote.getAbsoluteTimestamp().RealValue * 4;
            const rawEnd = beat + Math.max(0.05, note.sourceNote.Length.RealValue * 4);
            const end = note.sourceNote.isRest() ? Math.min(rawEnd, (measure.parentSourceMeasure.AbsoluteTimestamp.RealValue + measure.parentSourceMeasure.Duration.RealValue) * 4) : rawEnd;
            const voiceId = String(note.sourceNote.ParentVoiceEntry.ParentVoice.VoiceId);
            const staffId = String(note.sourceNote.ParentStaff.Id);
            const focused = (focusVoice == null || voiceId === focusVoice) && (focusStaff == null || staffId === focusStaff);
            const existing = elements.get(element);
            if (existing) { existing.end = Math.max(existing.end, end); existing.focused ||= focused; }
            else elements.set(element, { element, beat, end, focused });
            element.dataset.scoreBeat = String(beat);
            element.dataset.scoreMeasure = String(measureNumbers[measure.parentSourceMeasure.measureListIndex] ?? measure.MeasureNumber);
            element.dataset.scoreVoice = voiceId;
            element.dataset.scoreStaff = staffId;
          }
        }
        anchors.current = [...elements.values()].sort((a, b) => a.beat - b.beat);
        const focusAvailable = (focusVoice == null && focusStaff == null) || anchors.current.some((anchor) => anchor.focused);
        setFocusAvailable(focusAvailable);
        for (const anchor of anchors.current) {
          if (!focusAvailable) anchor.focused = true;
          anchor.element.dataset.scoreFocused = String(anchor.focused);
          anchor.element.setAttribute("opacity", anchor.focused ? "1" : "0.35");
        }
        type TempoExpression = { AbsoluteTimestamp: { RealValue: number }; InstantaneousTempo?: { TempoInBpm: number }; ContinuousTempo?: { AbsoluteStartTimestamp: { RealValue: number }; AbsoluteEndTimestamp: { RealValue: number }; StartTempo: number; EndTempo: number } };
        const expressions = (osmd.Sheet as unknown as { TimestampSortedTempoExpressionsList?: TempoExpression[] }).TimestampSortedTempoExpressionsList ?? [];
        const tempoEvents: TempoEvent[] = [];
        for (const expression of expressions) {
          const continuous = expression.ContinuousTempo;
          if (continuous) tempoEvents.push({ beatPosition: continuous.AbsoluteStartTimestamp.RealValue * 4, bpm: continuous.StartTempo, type: "continuous", endBeatPosition: continuous.AbsoluteEndTimestamp.RealValue * 4, endBpm: continuous.EndTempo });
          else if (expression.InstantaneousTempo) tempoEvents.push({ beatPosition: expression.AbsoluteTimestamp.RealValue * 4, bpm: expression.InstantaneousTempo.TempoInBpm, type: "instant" });
        }
        tempoCallback.current?.(tempoEvents);
        setRenderError(""); setLoaded(true); setRenderRevision((revision) => revision + 1);
      } catch {
        if (!cancelled) setRenderError(textRef.current("譜面を表示できませんでした。MusicXMLの内容を確認してください。", "The score could not be displayed. Check the MusicXML file."));
      }
    };
    void load();
    return () => { cancelled = true; osmd?.cursors.forEach((cursor) => cursor.Dispose()); };
  }, [musicXML, transpose, zoom, width, focusVoice, focusStaff, measureNumbers]);

  useEffect(() => {
    if (!loaded) return;
    const previous = anchors.current.find(anchor => anchor.element.getAttribute("tabindex") === "0");
    const representatives = new Map<string, ScoreAnchor>();
    for (const anchor of anchors.current) {
      const measure = anchor.element.dataset.scoreMeasure!;
      if (anchor.focused && !representatives.has(measure)) representatives.set(measure, anchor);
      anchor.element.setAttribute("aria-label", pencil
        ? text(`${measure}小節の指示を編集`, `Bar ${measure}: edit instructions`)
        : text(`${measure}小節のこの音から再生`, `Bar ${measure}: play from this note`));
      if (interactive) {
        anchor.element.setAttribute("role", "button");
        anchor.element.setAttribute("tabindex", "-1");
      } else {
        anchor.element.removeAttribute("role");
        anchor.element.removeAttribute("tabindex");
      }
      delete anchor.element.dataset.scoreKeyboard;
    }
    for (const anchor of representatives.values()) anchor.element.dataset.scoreKeyboard = "true";
    const entry = previous && representatives.get(previous.element.dataset.scoreMeasure!) || representatives.values().next().value;
    if (interactive) entry?.element.setAttribute("tabindex", "0");
  }, [loaded, renderRevision, pencil, interactive, text]);

  useEffect(() => {
    if (!focusEditor.current) return;
    editorRef.current?.focus();
    focusEditor.current = false;
  }, [pencil, selectedMeasure]);

  useEffect(() => {
    if (!loaded) return;
    const beat = active || followPosition ? currentBeat : 0;
    const next = anchors.current.filter((anchor) => anchor.focused && anchor.beat <= beat + 0.001 && anchor.end > beat + 0.001);
    if (next.length === highlighted.current.length && next.every((anchor, index) => anchor === highlighted.current[index])) return;
    for (const anchor of highlighted.current) { anchor.element.classList.remove("score-current-note"); anchor.element.removeAttribute("aria-current"); }
    for (const anchor of next) { anchor.element.classList.add("score-current-note"); anchor.element.setAttribute("aria-current", "true"); }
    highlighted.current = next;
    const container = containerRef.current;
    if (!active || !autoScroll || !container || !next[0]) return;
    const target = next[0].element.getBoundingClientRect();
    const viewport = container.getBoundingClientRect();
    if (target.top < viewport.top + 24 || target.bottom > viewport.bottom - 36) container.scrollTop += target.top - viewport.top - 72;
  }, [currentBeat, loaded, renderRevision, active, followPosition, autoScroll]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !loaded) return;
    container.querySelectorAll("[data-score-memo]").forEach(element => element.remove());
    for (const annotation of measures) {
      const anchor = anchors.current.find(anchor => Number(anchor.element.dataset.scoreMeasure) === annotation.measureNumber);
      const svg = anchor?.element.ownerSVGElement;
      if (!anchor || !svg) continue;
      const labels = [annotation.expression ? text(expressionPresets[annotation.expression.preset].label, expressionPresetLabelsEn[annotation.expression.preset]) : "", annotation.wait ? annotation.wait.duration ? text(`${annotation.wait.duration}秒待つ`, `Wait ${annotation.wait.duration}s`) : text("合図を待つ", "Wait for a cue") : "", annotation.role ? annotation.role.mode === "follow" ? text("自分がリード", "I lead") : text("伴奏に合わせる", "Follow accompaniment") : "", annotation.memo ?? ""].filter(Boolean);
      if (!labels.length) continue;
      const matrix = svg.getScreenCTM()?.inverse();
      if (!matrix) continue;
      const bounds = anchor.element.getBoundingClientRect();
      const point = new DOMPoint(bounds.left, bounds.top).matrixTransform(matrix);
      const ns = "http://www.w3.org/2000/svg";
      const group = document.createElementNS(ns, "g");
      group.dataset.scoreMemo = "true"; group.dataset.scoreMeasure = String(annotation.measureNumber);
      if (onAnnotation) { group.setAttribute("role", "button"); group.setAttribute("tabindex", "-1"); }
      group.setAttribute("aria-label", text(`${annotation.measureNumber}小節: ${labels.join("、")}`, `Bar ${annotation.measureNumber}: ${labels.join(", ")}`));
      const label = document.createElementNS(ns, "text");
      label.setAttribute("x", String(Math.max(5, point.x - 4))); label.setAttribute("y", String(Math.max(16, point.y - 24)));
      label.setAttribute("fill", "#995430"); label.setAttribute("font-size", "11"); label.setAttribute("font-family", "serif");
      const title = document.createElementNS(ns, "title"); title.textContent = labels.join(" · "); group.append(title);
      label.textContent = labels.join(" · ").slice(0, 22) + (labels.join(" · ").length > 22 ? "…" : "");
      label.setAttribute("paint-order", "stroke"); label.setAttribute("stroke", "#fffdf5"); label.setAttribute("stroke-width", "4"); label.setAttribute("stroke-linejoin", "round");
      group.append(label); svg.append(group);
    }
  }, [measures, loaded, renderRevision, text, interactive]);

  const openAnnotation = (measure: number) => {
    if (pencil && selectedMeasure === measure) editorRef.current?.focus();
    else { focusEditor.current = true; setPencil(true); setSelectedMeasure(measure); }
  };

  const choose = (target: EventTarget | null) => {
    const marker = target instanceof Element ? target.closest<SVGGElement>("[data-score-memo]") : null;
    if (marker && onAnnotation) { openAnnotation(Number(marker.dataset.scoreMeasure)); return; }
    const element = target instanceof Element ? target.closest<SVGGElement>("[data-score-beat]") : null;
    if (element && pencil && onAnnotation) { openAnnotation(Number(element.dataset.scoreMeasure)); return; }
    if (element && onSeek) onSeek(Number(element.dataset.scoreBeat));
  };
  const printScore = () => {
    const bridge = (window as unknown as { webkit?: { messageHandlers?: { convoPrint?: { postMessage: (data: { html: string }) => void } } } }).webkit?.messageHandlers?.convoPrint;
    if (bridge && containerRef.current) {
      const document = window.document.implementation.createHTMLDocument(text("ConvoCerto — 楽譜", "ConvoCerto — Score"));
      document.documentElement.lang = locale;
      const policy = document.createElement("meta"); policy.httpEquiv = "Content-Security-Policy"; policy.content = "default-src 'none'; style-src 'unsafe-inline'; img-src data:";
      document.head.append(policy);
      const style = document.createElement("style");
      style.textContent = "@page { size: A4 portrait; margin: 10mm; } body { margin: 0; } svg { display: block; width: 100%; height: auto; break-after: page; } svg:last-child { break-after: auto; }";
      document.head.append(style);
      for (const svg of containerRef.current.querySelectorAll("svg")) document.body.append(svg.cloneNode(true));
      setPrintNotice(text("印刷を準備しています…", "Preparing to print…"));
      bridge.postMessage({ html: "<!doctype html>" + document.documentElement.outerHTML });
      return;
    }
    const preview = window.open("", "_blank");
    if (!preview || !containerRef.current) { setRenderError(text("印刷ウィンドウを開けませんでした。ポップアップを許可してください。", "Allow pop-ups, then try printing again.")); return; }
    preview.document.title = text("ConvoCerto — 楽譜", "ConvoCerto — Score");
    preview.document.documentElement.lang = locale;
    const style = preview.document.createElement("style");
    style.textContent = "@page { size: A4 portrait; margin: 10mm; } body { margin: 0; } svg { display: block; width: 100%; height: auto; break-after: page; } svg:last-child { break-after: auto; }";
    preview.document.head.append(style);
    for (const svg of containerRef.current.querySelectorAll("svg")) preview.document.body.append(svg.cloneNode(true));
    void preview.document.fonts.ready.then(() => { preview.focus(); preview.print(); });
  };
  return <div data-editing={pencil}>
    {printNotice && <p role="status">{printNotice}</p>}
    {musicXML && <div className="score-tools">
      {onAnnotation && <button aria-pressed={pencil} onClick={() => { setPencil(!pencil); if (selectedMeasure == null) setSelectedMeasure(measureNumbers[0] ?? 1); }}>✎ {text("楽譜に書き込む", "Mark the score")}</button>}
      {extraTools}
      <details className="score-view-menu" open={!compact}><summary>{text("表示・印刷", "View & print")}</summary><div>
      <label>{text("譜面の大きさ", "Score size")}<select aria-label={text("譜面の大きさ", "Score size")} value={zoom} onChange={(event) => setZoom(Number(event.target.value))}>{[0.75, 1, 1.25, 1.5].map((value) => <option key={value} value={value}>{value * 100}%</option>)}</select></label>
      <button disabled={!loaded} onClick={printScore}>{text("楽譜を印刷 / PDF", "Print / PDF")}</button>
      <button aria-pressed={autoScroll} onClick={() => setAutoScroll(!autoScroll)}>{text("譜面の自動スクロール", "Auto-scroll")} {autoScroll ? "ON" : "OFF"}</button>
      </div></details>
      {transpose !== 0 && <span>{text(`記譜を ${transpose > 0 ? "+" : ""}${transpose} 半音移調`, `Notation transposed ${transpose > 0 ? "+" : ""}${transpose} semitones`)}</span>}
    </div>}
    {pencil && onAnnotation && selectedMeasure != null && <div ref={editorRef} className="score-editor-focus" role="region" tabIndex={-1} aria-label={text(`${selectedMeasure}小節の演奏指示`, `Bar ${selectedMeasure} instructions`)}><ScoreNoteEditor key={`${selectedMeasure}:${measures.find(a => a.measureNumber === selectedMeasure)?.memo ?? ""}`} measure={selectedMeasure} expressionEditor={onAnnotationPreview?.(selectedMeasure)} annotation={measures.find(a => a.measureNumber === selectedMeasure)} onChange={patch => onAnnotation(selectedMeasure, patch)}/></div>}
    {renderError && <p role="alert">{renderError}</p>}
    {(focusVoice != null || focusStaff != null) && <p className="concert-muted">{text("担当", "Your part")}: {focusLabel ?? (focusVoice == null ? text(`譜表${focusStaff}（全声部）`, `Staff ${focusStaff} (all voices)`) : text(`譜表${focusStaff ?? "1"}・声部${focusVoice}`, `Staff ${focusStaff ?? "1"}, voice ${focusVoice}`))}. {focusAvailable ? focusVoice == null ? text("担当する譜表の全声部を濃く、他の譜表を薄く表示しています。", "All voices on your staff are highlighted; other staves are dimmed.") : text("あなたの声部を濃く、相手の声部を薄く表示しています。", "Your voice is highlighted; other voices are dimmed.") : focusVoice == null ? text("譜面上の譜表を特定できないため、パート全体を通常表示しています。", "This staff could not be identified in the notation. Showing the complete part.") : text("譜面上の声部を特定できないため、パート全体を通常表示しています。", "This voice could not be identified in the notation. Showing the complete part.")}</p>}
    <div className="score-position" aria-live="off"><span>{text(`${currentMeasure} / ${totalMeasures} 小節 · ${currentBeat.toFixed(1)} 拍`, `Bar ${currentMeasure} / ${totalMeasures} · beat ${currentBeat.toFixed(1)}`)}</span>{onSeek && <span>{pencil ? text("音符を押して、書き込む小節を選ぶ", "Select a note to mark its bar") : text("音符を押して、その位置から演奏", "Select a note to play from there")}</span>}</div>
    {interactive && <p id={keyboardHelp} className="sr-only">{text("左右の矢印キーで小節を移動、HomeとEndで最初と最後へ。Enterかスペースで再生、書き込み中は小節の指示を編集します。", "Use Left and Right arrows to move between bars, and Home or End for the first or last bar. Enter or Space starts playback, or opens bar instructions while marking the score.")}</p>}
    <div className="printable-score" ref={containerRef} role="group" aria-label={text("楽譜", "Score")} aria-describedby={interactive ? keyboardHelp : undefined} onClick={(event) => choose(event.target)} onKeyDown={(event) => {
      if (!interactive || event.altKey || event.ctrlKey || event.metaKey) return;
      const current = event.target instanceof Element ? event.target.closest<SVGGElement>("[data-score-beat], [data-score-memo]") : null;
      if (!current) return;
      if (event.key === "Enter" || event.key === " ") { event.preventDefault(); choose(current); return; }
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      const entries = anchors.current.filter(anchor => anchor.element.dataset.scoreKeyboard === "true");
      if (!entries.length) return;
      event.preventDefault();
      const index = Math.max(0, entries.findIndex(anchor => anchor.element.dataset.scoreMeasure === current.dataset.scoreMeasure));
      const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? entries.length - 1 : Math.max(0, Math.min(entries.length - 1, index + (event.key === "ArrowRight" ? 1 : -1)));
      for (const anchor of entries) anchor.element.setAttribute("tabindex", "-1");
      const next = entries[nextIndex].element;
      next.setAttribute("tabindex", "0"); next.focus(); next.scrollIntoView?.({ block: "nearest", inline: "nearest" });
    }} style={{ maxHeight: "60vh", overflow: "auto", background: "#fff", borderRadius: 8, padding: 16, overflowAnchor: "none", scrollbarGutter: "stable" }} />
    {!onAnnotation && measures.length > 0 && <div className="score-annotations">{measures.map((measure) => <span key={measure.measureNumber}>m.{measure.measureNumber}: {measure.role ? `${measure.role.mode}:${measure.role.strength}` : measure.wait ? `${measure.wait.type}${measure.wait.duration ? `:${measure.wait.duration}s` : ""}` : measure.expression ? text(expressionPresets[measure.expression.preset].label, expressionPresetLabelsEn[measure.expression.preset]) : ""}</span>)}</div>}
  </div>;
}
