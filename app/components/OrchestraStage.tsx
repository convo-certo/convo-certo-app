import { scoreActivity, soundingAt } from "~/lib/score-activity";
import type { OrchestraSpace } from "~/lib/practice-session";
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { defaultChairs, type OrchestraChair } from "~/lib/orchestra-space";
import { instrumentForPart, type OrchestraAudio } from "~/lib/orchestra-audio";
import type { ScorePart } from "~/lib/types";

const commonInstruments = ["clarinet", "flute", "piccolo", "oboe", "english_horn", "bassoon", "french_horn", "trumpet", "trombone", "tuba", "soprano_sax", "alto_sax", "tenor_sax", "baritone_sax", "violin", "viola", "cello", "contrabass", "string_ensemble_1", "orchestral_harp", "timpani", "marimba", "glockenspiel", "harpsichord", "acoustic_guitar_nylon", "acoustic_grand_piano"];
const instrumentLabels: Record<string, string> = { clarinet: "クラリネット", flute: "フルート", piccolo: "ピッコロ", oboe: "オーボエ", english_horn: "イングリッシュホルン", bassoon: "ファゴット", french_horn: "ホルン", trumpet: "トランペット", trombone: "トロンボーン", tuba: "チューバ", soprano_sax: "ソプラノサックス", alto_sax: "アルトサックス", tenor_sax: "テナーサックス", baritone_sax: "バリトンサックス", violin: "ヴァイオリン", viola: "ヴィオラ", cello: "チェロ", contrabass: "コントラバス", string_ensemble_1: "弦楽合奏", orchestral_harp: "ハープ", timpani: "ティンパニ", marimba: "マリンバ", glockenspiel: "グロッケンシュピール", harpsichord: "チェンバロ", acoustic_guitar_nylon: "クラシックギター", acoustic_grand_piano: "ピアノ" };
const instrumentGroups = [["木管", ["flute", "piccolo", "oboe", "english_horn", "bassoon", "clarinet", "soprano_sax", "alto_sax", "tenor_sax", "baritone_sax"]], ["金管", ["french_horn", "trumpet", "trombone", "tuba"]], ["弦", ["violin", "viola", "cello", "contrabass", "string_ensemble_1", "orchestral_harp"]], ["鍵盤・打楽器", ["acoustic_grand_piano", "harpsichord", "acoustic_guitar_nylon", "timpani", "marimba", "glockenspiel"]]] as const;

export function OrchestraStage({ parts, audio, beat, active, initialSpace, onSpaceChange, mutedParts = [] }: { parts: ScorePart[]; audio: OrchestraAudio; beat: number; active: boolean; mutedParts?: number[]; initialSpace?: OrchestraSpace; onSpaceChange?: (space: OrchestraSpace) => void }) {
  const [chairs, setChairs] = useState(() => initialSpace?.chairs ?? defaultChairs(parts));
  const [selected, setSelected] = useState(chairs[0]?.id ?? "");
  const [listener, setListener] = useState(initialSpace?.listener ?? { x: 0, z: 1 });
  const [enabled, setEnabled] = useState(initialSpace?.enabled ?? true);
  const [dragging, setDragging] = useState<string | null>(null);
  const mapRef = useRef<SVGSVGElement>(null);
  const activity = useMemo(() => parts.map(part => scoreActivity(part.notes)), [parts]);
  const soundingParts = useMemo(() => activity.map(intervals => active && soundingAt(intervals, beat)), [activity, active, beat]);
  const chair = chairs.find((item) => item.id === selected);
  const instruments = useMemo(() => [...new Set([...commonInstruments, ...parts.map(instrumentForPart)])], [parts]);
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
  return <section className="concert-panel orchestra-space" aria-label="オーケストラの空間">
    <div className="concert-now"><div><p className="concert-eyebrow">INSIDE THE ORCHESTRA</p><h3>あなたの周りに、オーケストラ。</h3></div><button aria-pressed={enabled} onClick={() => setEnabled(!enabled)}>空間音響 {enabled ? "ON" : "OFF"}</button></div>
    <p className="concert-muted">席を選ぶか、ドラッグして舞台上の位置を動かせます。</p>
    <svg ref={mapRef} className="orchestra-map" viewBox="0 0 800 480" role="group" aria-label="オーケストラ座席図" onPointerMove={moveFromPointer} onPointerUp={() => setDragging(null)} onPointerLeave={() => setDragging(null)}>
      <defs><radialGradient id="stage-light"><stop stopColor="#394a63"/><stop offset="1" stopColor="#111a29"/></radialGradient></defs>
      <rect width="800" height="480" rx="24" fill="url(#stage-light)"/>
      {[100, 190, 280, 370].map((y) => <path key={y} d={`M 60 ${y} Q 400 ${y + 100} 740 ${y}`} fill="none" stroke="#ffffff13" strokeWidth="2"/>)}
      <text x="400" y="28" textAnchor="middle" fill="#a8b7ca" fontSize="13">STAGE · 奏者の席</text>
      {chairs.map((item) => {
        const part = parts[item.partIndex];
        const sounding = !part.isSolo && item.level > 0 && !mutedParts.includes(item.partIndex) && soundingParts[item.partIndex];
        return <g key={item.id} role="button" tabIndex={0} aria-label={`席 ${item.id}: ${part.name}`} aria-pressed={selected === item.id} onClick={() => setSelected(item.id)} onPointerDown={(event) => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); setSelected(item.id); setDragging(item.id); }} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelected(item.id); } }} transform={`translate(${400 + item.x * 48},${355 + item.z * 31})`} className="orchestra-chair">
          <circle r={selected === item.id ? 24 : 20} fill={part.isSolo ? "#66dfc4" : sounding ? "#f8c66b" : "#344862"} stroke={selected === item.id ? "white" : "#8295ae"} strokeWidth="2"/>
          <text textAnchor="middle" y="5" fill={part.isSolo || sounding ? "#152132" : "white"} fontSize="13">{item.partIndex + 1}</text>
          <text textAnchor="middle" y="33" fill="#e4ecf6" fontSize="11">{part.name.slice(0, 19)}{item.instrument === "french_horn" && instrumentForPart(part) !== "french_horn" ? " · Horn" : ""}</text>
        </g>;
      })}
      <g transform={`translate(${400 + listener.x * 48},${355 + listener.z * 31})`}><circle r="13" fill="#ff8c73"/><text x="-20" y="5" textAnchor="end" fill="#ffb6a6" fontSize="13">耳</text></g>
    </svg>
    <div className="space-editors">
      <fieldset><legend>聴く場所</legend><div className="concert-controls"><button onClick={() => setListener({ x: 0, z: 1 })}>指揮者の位置</button><button disabled={!chair} onClick={() => chair && setListener({ x: chair.x, z: chair.z + 0.4 })}>選んだ席に座る</button></div><label>耳の左右<input aria-label="耳の左右" type="range" min="-6" max="6" step="0.1" value={listener.x} onChange={(event) => setListener({ ...listener, x: +event.target.value })}/></label><label>耳の前後<input aria-label="耳の前後" type="range" min="-10" max="2" step="0.1" value={listener.z} onChange={(event) => setListener({ ...listener, z: +event.target.value })}/></label></fieldset>
      {chair && <fieldset><legend>選択した奏者</legend><label>担当するMusicXMLパート<select aria-label="席の担当パート" value={chair.partIndex} onChange={(event) => update({ partIndex: +event.target.value })}>{parts.map((part, index) => <option key={part.id} value={index}>{part.name}{part.isSolo ? "（あなた・共奏時は無音）" : ""}</option>)}</select></label><label>鳴らす楽器<select aria-label="席の楽器" value={chair.instrument} onChange={(event) => update({ instrument: event.target.value })}>{instrumentGroups.map(([group, choices]) => <optgroup key={group} label={group}>{choices.filter((instrument) => instruments.includes(instrument)).map((instrument) => <option key={instrument} value={instrument}>{instrumentLabels[instrument]}</option>)}</optgroup>)}</select></label><label>席の左右<input aria-label="席の左右" type="range" min="-6" max="6" step="0.1" value={chair.x} onChange={(event) => update({ x: +event.target.value })}/></label><label>席の前後<input aria-label="席の前後" type="range" min="-10" max="0" step="0.1" value={chair.z} onChange={(event) => update({ z: +event.target.value })}/></label><label>奏者の音量 {Math.round(chair.level * 100)}%<input aria-label="奏者の音量" type="range" min="0" max="1.5" step="0.05" value={chair.level} onChange={(event) => update({ level: +event.target.value })}/></label><label>奏者の微細なずれ {Math.round((chair.variation ?? 0) * 100)}%<input aria-label="奏者の微細なずれ" type="range" min="0" max="1" step="0.1" value={chair.variation ?? 0} onChange={(event) => update({ variation: +event.target.value })}/></label><div className="concert-controls"><button disabled={chairs.length >= 64} onClick={() => { const id = crypto.randomUUID(); setChairs([...chairs, { ...chair, id, x: Math.min(6, chair.x + 0.8) }]); setSelected(id); }}>同じ楽器の奏者を追加</button><button disabled={chairs.length >= 64} onClick={() => { const id = crypto.randomUUID(); setChairs([...chairs, { ...chair, id, instrument: "french_horn", x: Math.min(6, chair.x + 0.8) }]); setSelected(id); }}>ホルンを1本追加</button><button disabled={chairs.length <= 1} onClick={() => { const next = chairs.filter((item) => item.id !== selected); setChairs(next); setSelected(next[0].id); }}>この奏者を外す</button></div></fieldset>}
    </div>
    <p className="concert-muted">追加奏者は選んだパートの実音を演奏します。「微細なずれ」は音程・入り・強弱・切り方の小さな差で、0%で無効。変更は次の音から反映します。同じ楽器・パートを重ねると音量を自動調整します。新しい対旋律の作曲や譜面への追加ではありません。空間配置は「この練習を保存」で楽譜と一緒に保存。頭の向きの追跡・ホール残響はまだありません。</p>
  </section>;
}
