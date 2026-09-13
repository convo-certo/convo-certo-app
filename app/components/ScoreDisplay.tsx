import { useEffect, useRef, useState } from "react";
import type { OpenSheetMusicDisplay, VexFlowGraphicalNote } from "opensheetmusicdisplay";
import type { MeasureAnnotation, TempoEvent } from "~/lib/types";
import { expressionPresets } from "~/lib/expressive-intent";
import type { Locale } from "~/lib/i18n";

interface ScoreDisplayProps {
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

export function ScoreDisplay({ transpose = 0, followPosition = false, musicXML, currentMeasure, currentBeat, totalMeasures, engineState, measures, onTempoMapReady, onSeek, focusVoice, focusStaff, focusLabel }: ScoreDisplayProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const anchors = useRef<ScoreAnchor[]>([]);
  const highlighted = useRef<ScoreAnchor[]>([]);
  const tempoCallback = useRef(onTempoMapReady);
  tempoCallback.current = onTempoMapReady;
  const [printNotice, setPrintNotice] = useState("");
  useEffect(() => {
    const receive = (event: Event) => {
      const result = (event as CustomEvent).detail;
      if (result?.status === "failed") { setPrintNotice(""); setRenderError(result.error ?? "印刷できませんでした。"); }
      else setPrintNotice(result?.status === "cancelled" ? "印刷をキャンセルしました。" : "印刷処理を完了しました。");
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
          autoResize: false, backend: "svg", pageFormat: "A4_P", drawTitle: width >= 600, drawSubtitle: false,
          drawComposer: width >= 600, drawCredits: false, drawPartNames: true, drawMeasureNumbers: true,
          followCursor: false, cursorsOptions: [],
        });
        osmd.EngravingRules.RenderRehearsalMarks = false;
        await osmd.load(new DOMParser().parseFromString(musicXML, "application/xml"));
        if (cancelled) return;
        osmd.TransposeCalculator = new module.TransposeCalculator();
        osmd.Sheet.Transpose = transpose; osmd.Zoom = zoom * Math.min(1, width / 600); osmd.render();
        const elements = new Map<SVGGElement, ScoreAnchor>();
        for (const row of osmd.GraphicSheet.MeasureList) for (const measure of row) {
          if (!measure) continue;
          for (const entry of measure.staffEntries) for (const voice of entry.graphicalVoiceEntries) for (const note of voice.notes) {
            const element = (note as VexFlowGraphicalNote).getSVGGElement();
            if (!element) continue;
            const beat = note.sourceNote.getAbsoluteTimestamp().RealValue * 4;
            const end = beat + Math.max(0.05, note.sourceNote.Length.RealValue * 4);
            const voiceId = String(note.sourceNote.ParentVoiceEntry.ParentVoice.VoiceId);
            const staffId = String(note.sourceNote.ParentStaff.Id);
            const focused = focusVoice == null || (voiceId === focusVoice && (focusStaff == null || staffId === focusStaff));
            const existing = elements.get(element);
            if (existing) { existing.end = Math.max(existing.end, end); existing.focused ||= focused; }
            else elements.set(element, { element, beat, end, focused });
            element.dataset.scoreBeat = String(beat);
            element.dataset.scoreVoice = voiceId;
            element.dataset.scoreStaff = staffId;
            element.setAttribute("aria-label", `${beat + 1}拍目から再生`);
            element.setAttribute("role", "button"); element.setAttribute("tabindex", "0");
          }
        }
        anchors.current = [...elements.values()].sort((a, b) => a.beat - b.beat);
        const focusAvailable = focusVoice == null || anchors.current.some((anchor) => anchor.focused);
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
        if (!cancelled) setRenderError("譜面を表示できませんでした。MusicXMLの内容を確認してください。");
      }
    };
    void load();
    return () => { cancelled = true; osmd?.cursors.forEach((cursor) => cursor.Dispose()); };
  }, [musicXML, transpose, zoom, width, focusVoice, focusStaff]);

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

  const choose = (target: EventTarget | null) => {
    const element = target instanceof Element ? target.closest<SVGGElement>("[data-score-beat]") : null;
    if (element && onSeek) onSeek(Number(element.dataset.scoreBeat));
  };
  const printScore = () => {
    const bridge = (window as unknown as { webkit?: { messageHandlers?: { convoPrint?: { postMessage: (data: { html: string }) => void } } } }).webkit?.messageHandlers?.convoPrint;
    if (bridge && containerRef.current) {
      const document = window.document.implementation.createHTMLDocument("ConvoCerto — 楽譜");
      const policy = document.createElement("meta"); policy.httpEquiv = "Content-Security-Policy"; policy.content = "default-src 'none'; style-src 'unsafe-inline'; img-src data:";
      document.head.append(policy);
      const style = document.createElement("style");
      style.textContent = "@page { size: A4 portrait; margin: 10mm; } body { margin: 0; } svg { display: block; width: 100%; height: auto; break-after: page; } svg:last-child { break-after: auto; }";
      document.head.append(style);
      for (const svg of containerRef.current.querySelectorAll("svg")) document.body.append(svg.cloneNode(true));
      setPrintNotice("印刷を準備しています…");
      bridge.postMessage({ html: "<!doctype html>" + document.documentElement.outerHTML });
      return;
    }
    const preview = window.open("", "_blank");
    if (!preview || !containerRef.current) { setRenderError("印刷ウィンドウを開けませんでした。ポップアップを許可してください。"); return; }
    preview.document.title = "ConvoCerto — 楽譜";
    const style = preview.document.createElement("style");
    style.textContent = "@page { size: A4 portrait; margin: 10mm; } body { margin: 0; } svg { display: block; width: 100%; height: auto; break-after: page; } svg:last-child { break-after: auto; }";
    preview.document.head.append(style);
    for (const svg of containerRef.current.querySelectorAll("svg")) preview.document.body.append(svg.cloneNode(true));
    void preview.document.fonts.ready.then(() => { preview.focus(); preview.print(); });
  };
  return <div>
    {printNotice && <p role="status">{printNotice}</p>}
    {musicXML && <div className="score-tools">
      <label>譜面の大きさ<select aria-label="譜面の大きさ" value={zoom} onChange={(event) => setZoom(Number(event.target.value))}>{[0.75, 1, 1.25, 1.5].map((value) => <option key={value} value={value}>{value * 100}%</option>)}</select></label>
      <button disabled={!loaded} onClick={printScore}>楽譜を印刷 / PDF</button>
      <button aria-pressed={autoScroll} onClick={() => setAutoScroll(!autoScroll)}>譜面の自動スクロール {autoScroll ? "ON" : "OFF"}</button>
      {transpose !== 0 && <span>記譜を {transpose > 0 ? "+" : ""}{transpose} 半音移調</span>}
    </div>}
    {renderError && <p role="alert">{renderError}</p>}
    {focusVoice != null && <p className="concert-muted">担当: {focusLabel ?? `譜表${focusStaff ?? "1"}・声部${focusVoice}`}。{focusAvailable ? "あなたの声部を濃く、相手の声部を薄く表示しています。" : "譜面上の声部を特定できないため、パート全体を通常表示しています。"}</p>}
    <div className="score-position" aria-live="off"><span>{currentMeasure} / {totalMeasures} 小節 · {currentBeat.toFixed(1)} 拍</span>{onSeek && <span>音符・休符を押すと、その位置から再生</span>}</div>
    <div className="printable-score" ref={containerRef} onClick={(event) => choose(event.target)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); choose(event.target); } }} style={{ maxHeight: "60vh", overflow: "auto", background: "#fff", borderRadius: 8, padding: 16, overflowAnchor: "none", scrollbarGutter: "stable" }} />
    {measures.length > 0 && <div className="score-annotations">{measures.map((measure) => <span key={measure.measureNumber}>m.{measure.measureNumber}: {measure.role ? `${measure.role.mode}:${measure.role.strength}` : measure.wait ? `${measure.wait.type}${measure.wait.duration ? `:${measure.wait.duration}s` : ""}` : measure.expression ? expressionPresets[measure.expression.preset].label : ""}</span>)}</div>}
  </div>;
}
