import { scoreActivity, soundingAt } from "~/lib/score-activity";
import type { OrchestraSpace } from "~/lib/practice-session";
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { defaultChairs, type OrchestraChair } from "~/lib/orchestra-space";
import { instrumentForPart, type OrchestraAudio } from "~/lib/orchestra-audio";
import { instrumentGroups, instrumentLabels, instrumentLabelsEn, instrumentGroupLabelsEn, placementInstruments } from "~/lib/instrument-palette";
import { useLocale } from "~/lib/locale-context";
import { performanceName } from "~/lib/performance-seats";
import type { ScorePart } from "~/lib/types";


export function OrchestraStage({ parts, audio, beat, active, initialSpace, onSpaceChange, mutedParts = [] }: { parts: ScorePart[]; audio: OrchestraAudio; beat: number; active: boolean; mutedParts?: number[]; initialSpace?: OrchestraSpace; onSpaceChange?: (space: OrchestraSpace) => void }) {
  const { locale, text } = useLocale();
  const [chairs, setChairs] = useState(() => initialSpace?.chairs ?? defaultChairs(parts));
  const [selected, setSelected] = useState(chairs[0]?.id ?? "");
  const [listener, setListener] = useState(initialSpace?.listener ?? { x: 0, z: 1 });
  const [enabled, setEnabled] = useState(initialSpace?.enabled ?? true);
  const [dragging, setDragging] = useState<string | null>(null);
  const mapRef = useRef<SVGSVGElement>(null);
  const activity = useMemo(() => parts.map(part => scoreActivity(part.notes)), [parts]);
  const soundingParts = useMemo(() => activity.map(intervals => active && soundingAt(intervals, beat)), [activity, active, beat]);
  const chair = chairs.find((item) => item.id === selected);
  const instruments = useMemo(() => [...new Set([...placementInstruments, ...parts.map(instrumentForPart)])], [parts]);
  useEffect(() => { audio.configureSpace(chairs, listener, enabled); }, [audio, chairs, listener, enabled, parts]);
  useEffect(() => { onSpaceChange?.({ chairs, listener, enabled }); }, [chairs, listener, enabled, onSpaceChange]);
  const update = (patch: Partial<OrchestraChair>) => setChairs((items) => items.map((item) => item.id === selected ? { ...item, ...patch } : item));
  const moveFromPointer = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!dragging || !mapRef.current) return;
    const rect = mapRef.current.getBoundingClientRect();
    const pointX = (event.clientX - rect.left) * 800 / rect.width;
    const pointY = (event.clientY - rect.top) * 480 / rect.height;
    setChairs((items) => items.map((item) => item.id === dragging ? { ...item, x: Math.max(-6, Math.min(6, (pointX - 400) / 48)), z: Math.max(-10, Math.min(0, (pointY - 355) / 31)) } : item));
  };
  return <section className="concert-panel orchestra-space" aria-label={text("オーケストラの空間", "Orchestra space")}>
    <div className="concert-now"><div><p className="concert-eyebrow">INSIDE THE ORCHESTRA</p><h3>{text("あなたの周りに、オーケストラ。", "An orchestra around you.")}</h3></div><button aria-pressed={enabled} onClick={() => setEnabled(!enabled)}>{text("空間音響", "Spatial audio")} {enabled ? "ON" : "OFF"}</button></div>
    <p className="concert-muted">{text("席を選ぶか、ドラッグして舞台上の位置を動かせます。", "Select a player or drag their seat to move them on stage.")}</p>
    <svg ref={mapRef} className="orchestra-map" viewBox="0 0 800 480" role="group" aria-label={text("オーケストラ座席図", "Orchestra seating plan")} onPointerMove={moveFromPointer} onPointerUp={() => setDragging(null)} onPointerLeave={() => setDragging(null)}>
      <defs><radialGradient id="stage-light"><stop stopColor="#394a63"/><stop offset="1" stopColor="#111a29"/></radialGradient></defs>
      <rect width="800" height="480" rx="24" fill="url(#stage-light)"/>
      {[100, 190, 280, 370].map((y) => <path key={y} d={`M 60 ${y} Q 400 ${y + 100} 740 ${y}`} fill="none" stroke="#ffffff13" strokeWidth="2"/>)}
      <text x="400" y="28" textAnchor="middle" fill="#a8b7ca" fontSize="13">{text("STAGE · 奏者の席", "STAGE · Player seats")}</text>
      {chairs.map((item) => {
        const part = parts[item.partIndex];
        const sounding = !part.isSolo && item.level > 0 && !mutedParts.includes(item.partIndex) && soundingParts[item.partIndex];
        return <g key={item.id} role="button" tabIndex={0} aria-label={`${text("席", "Seat")} ${item.id}: ${performanceName(part, locale)}`} aria-pressed={selected === item.id} onClick={() => setSelected(item.id)} onPointerDown={(event) => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); setSelected(item.id); setDragging(item.id); }} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelected(item.id); } }} transform={`translate(${400 + item.x * 48},${355 + item.z * 31})`} className="orchestra-chair">
          <circle r={selected === item.id ? 24 : 20} fill={part.isSolo ? "#66dfc4" : sounding ? "#f8c66b" : "#344862"} stroke={selected === item.id ? "white" : "#8295ae"} strokeWidth="2"/>
          <text textAnchor="middle" y="5" fill={part.isSolo || sounding ? "#152132" : "white"} fontSize="13">{item.partIndex + 1}</text>
          <text textAnchor="middle" y="33" fill="#e4ecf6" fontSize="11">{performanceName(part, locale).slice(0, 19)}{item.instrument === "french_horn" && instrumentForPart(part) !== "french_horn" ? " · Horn" : ""}</text>
        </g>;
      })}
      <g transform={`translate(${400 + listener.x * 48},${355 + listener.z * 31})`}><circle r="13" fill="#ff8c73"/><text x="-20" y="5" textAnchor="end" fill="#ffb6a6" fontSize="13">{text("耳", "You hear here")}</text></g>
    </svg>
    <div className="space-editors">
      <fieldset><legend>{text("聴く場所", "Listening position")}</legend><div className="concert-controls"><button onClick={() => setListener({ x: 0, z: 1 })}>{text("指揮者の位置", "Conductor’s position")}</button><button disabled={!chair} onClick={() => chair && setListener({ x: chair.x, z: chair.z + 0.4 })}>{text("選んだ席に座る", "Sit in the selected seat")}</button></div><label>{text("耳の左右", "Listener left / right")}<input aria-label={text("耳の左右", "Listener left / right")} type="range" min="-6" max="6" step="0.1" value={listener.x} onChange={(event) => setListener({ ...listener, x: +event.target.value })}/></label><label>{text("耳の前後", "Listener front / back")}<input aria-label={text("耳の前後", "Listener front / back")} type="range" min="-10" max="2" step="0.1" value={listener.z} onChange={(event) => setListener({ ...listener, z: +event.target.value })}/></label></fieldset>
      {chair && <fieldset><legend>{text("選択した奏者", "Selected player")}</legend><label>{text("担当するMusicXMLパート", "MusicXML part")}<select aria-label={text("席の担当パート", "Seat part")} value={chair.partIndex} onChange={(event) => update({ partIndex: +event.target.value })}>{parts.map((part, index) => <option key={part.id} value={index}>{performanceName(part, locale)}{part.isSolo ? text("（あなた・共奏時は無音）", " (you · silent while accompanying)") : ""}</option>)}</select></label><label>{text("鳴らす楽器", "Instrument sound")}<select aria-label={text("席の楽器", "Seat instrument")} value={chair.instrument} onChange={(event) => update({ instrument: event.target.value })}>{instrumentGroups.map(([group, choices]) => <optgroup key={group} label={text(group, instrumentGroupLabelsEn[group])}>{choices.filter((instrument) => instruments.includes(instrument)).map((instrument) => <option key={instrument} value={instrument}>{text(instrumentLabels[instrument], instrumentLabelsEn[instrument])}</option>)}</optgroup>)}</select></label><label>{text("席の左右", "Seat left / right")}<input aria-label={text("席の左右", "Seat left / right")} type="range" min="-6" max="6" step="0.1" value={chair.x} onChange={(event) => update({ x: +event.target.value })}/></label><label>{text("席の前後", "Seat front / back")}<input aria-label={text("席の前後", "Seat front / back")} type="range" min="-10" max="0" step="0.1" value={chair.z} onChange={(event) => update({ z: +event.target.value })}/></label><label>{text("奏者の音量", "Player volume")} {Math.round(chair.level * 100)}%<input aria-label={text("奏者の音量", "Player volume")} type="range" min="0" max="1.5" step="0.05" value={chair.level} onChange={(event) => update({ level: +event.target.value })}/></label><label>{text("奏者の微細なずれ", "Player variation")} {Math.round((chair.variation ?? 0) * 100)}%<input aria-label={text("奏者の微細なずれ", "Player variation")} type="range" min="0" max="1" step="0.1" value={chair.variation ?? 0} onChange={(event) => update({ variation: +event.target.value })}/></label><div className="concert-controls"><button disabled={chairs.length >= 64} onClick={() => { const id = crypto.randomUUID(); setChairs([...chairs, { ...chair, id, x: Math.min(6, chair.x + 0.8) }]); setSelected(id); }}>{text("同じ楽器の奏者を追加", "Add a player with this instrument")}</button><button disabled={chairs.length >= 64} onClick={() => { const id = crypto.randomUUID(); setChairs([...chairs, { ...chair, id, instrument: "french_horn", x: Math.min(6, chair.x + 0.8) }]); setSelected(id); }}>{text("ホルンを1本追加", "Add a French horn")}</button><button disabled={chairs.length <= 1} onClick={() => { const next = chairs.filter((item) => item.id !== selected); setChairs(next); setSelected(next[0].id); }}>{text("この奏者を外す", "Remove this player")}</button></div></fieldset>}
    </div>
    <p className="concert-muted">{text("追加奏者は選んだパートの実音を演奏します。「微細なずれ」は音程・入り・強弱・切り方の小さな差で、0%で無効。変更は次の音から反映します。同じ楽器・パートを重ねると音量を自動調整します。新しい対旋律の作曲や譜面への追加ではありません。空間配置は「この練習を保存」で楽譜と一緒に保存。頭の向きの追跡・ホール残響はまだありません。", "Added players perform the selected part at concert pitch. Variation adds small differences in pitch, timing, dynamics and note endings; 0% turns it off. Changes apply from the next note. Players sharing a part and instrument are balanced automatically. This does not compose new parts or change the score. Save your practice to keep the seating with your score. Head tracking and hall reverb are not yet available.")}</p>
  </section>;
}
