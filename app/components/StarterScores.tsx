import { useState } from "react";
import { useLocale } from "~/lib/locale-context";
import { arrangeStarterDuet, starterInstruments, type StarterInstrumentId } from "~/lib/starter-duet";
import "./starter-scores.css";

const examples = [
  { title: "短いデュエット", titleEn: "A short duet", detail: "8小節 · まずは操作と音を試す", detailEn: "8 bars · Try the sound and controls", path: "/scores/sample-duet.musicxml", symbol: "♫" },
  { title: "モーツァルト：クラリネット協奏曲", titleEn: "Mozart: Clarinet Concerto", detail: "K.622 第2楽章 · 木管・ホルン・弦から担当を選択", detailEn: "K.622, II · Choose a woodwind, horn or string part", path: "/repertoire/ensemble/mozart-k622-2.musicxml", symbol: "𝄞" },
];

export function StarterScores({ busy, onLoad }: { busy: boolean; onLoad: (file: File) => Promise<void> }) {
  const { text } = useLocale();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [instrument, setInstrument] = useState<StarterInstrumentId | "preview">("preview");
  const openScore = async (example: typeof examples[number], duet: boolean) => {
    setLoading(true); setError(false);
    try {
      const response = await fetch(example.path);
      if (!response.ok) throw new Error("Starter score unavailable");
      const original = await response.text();
      const xml = duet && instrument !== "preview" ? arrangeStarterDuet(original, instrument) : original;
      await onLoad(new File([xml], example.path.split("/").at(-1)!));
    } catch { setError(true); }
    finally { setLoading(false); }
  };
  return <section id="starter-scores" className="starter-scores" aria-label={text("はじめの2曲", "Two starter scores")} aria-busy={loading}>
    <div className="starter-heading"><h3>{text("楽譜がなくても、まずは一曲。", "No score? Start here.")}</h3><span>{text("はじめの2曲", "Two starter scores")}</span></div>
    <div className="starter-grid">{examples.map((example, index) => {
      const button = <button disabled={busy || loading} onClick={() => void openScore(example, index === 0)}><span className="starter-symbol" aria-hidden="true">{example.symbol}</span><span><strong>{text(example.title, example.titleEn)}</strong><small>{text(example.detail, example.detailEn)}</small></span><span aria-hidden="true">↗</span></button>;
      return index === 0 ? <div key={example.path} className="starter-duet-card">{button}<label className="starter-instrument"><span>{text("デュエットの楽器", "Your duet instrument")}</span><select aria-label={text("デュエットの楽器", "Your duet instrument")} value={instrument} disabled={busy || loading} onChange={event => setInstrument(event.target.value as StarterInstrumentId | "preview")} aria-describedby="starter-instrument-help"><option value="preview">{text("まずは音を聴いて試す", "Listen and try the controls")}</option>{starterInstruments.map(option => <option key={option.id} value={option.id}>{text(option.label, option.labelEn)}</option>)}</select><small id="starter-instrument-help">{instrument === "preview" ? text("楽器がなくても試せます。演奏する場合は、先に自分の楽器を選んでください。", "No instrument needed. To play along, choose your instrument first.") : text("選んだ楽器の音域・調号・譜表で開きます。伴奏はピアノです。", "Opens in your instrument’s register, written key and clef, with piano accompaniment.")}</small></label></div> : <div key={example.path}>{button}</div>;
    })}</div>
    {loading && <p role="status">{text("楽譜を開いています…", "Opening the score…")}</p>}
    {error && <p role="alert">{text("楽譜を開けませんでした。もう一度お試しください。", "Couldn't open the score. Please try again.")}</p>}
    <a className="starter-credits" href="/credits.html">{text("楽譜・音源の出典", "Score & sound credits")}</a>
  </section>;
}
