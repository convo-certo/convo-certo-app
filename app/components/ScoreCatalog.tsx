import { useEffect, useState } from "react";
interface CatalogScore { id: string; title: string; composer: string; parts: string[]; measures: number; category: string; featured: boolean; scoreLicense: string; scoreSource: string; editionStatus: string }
export function ScoreCatalog({ busy, onLoad }: { busy: boolean; onLoad: (file: File) => Promise<void> }) {
  const [scores, setScores] = useState<CatalogScore[]>([]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("orchestra");
  const [limit, setLimit] = useState(10);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { let cancelled = false; void fetch("/repertoire/ensemble/catalog.json").then((response) => { if (!response.ok) throw new Error(); return response.json(); }).then((data: CatalogScore[]) => { if (!cancelled) setScores(data); }).catch(() => { if (!cancelled) setError("楽譜一覧を読み込めませんでした。"); }); return () => { cancelled = true; }; }, []);
  const filtered = scores.filter((score) => (!category || score.category === category) && `${score.title} ${score.composer} ${score.parts.join(" ")}`.toLowerCase().includes(query.toLowerCase())).sort((a, b) => Number(b.featured) - Number(a.featured));
  return <section className="concert-panel" aria-label="MusicXMLライブラリ">
    <h3>好きな楽器で、オーケストラの中へ</h3>
    <p><a href="/repertoire/ensemble/ConvoCerto-MusicXML.zip" download>MusicXML一式をZIPでダウンロード</a></p>
    <p>MusicXML {scores.length}譜。総譜のパートを選んで共奏できます。★は優先収録曲です。</p>
    <div className="concert-controls"><input aria-label="収録楽譜を検索" placeholder="曲名・作曲家・楽器名" value={query} onChange={(event) => { setQuery(event.target.value); setLimit(10); }} /><select aria-label="楽譜の編成" value={category} onChange={(event) => { setCategory(event.target.value); setLimit(10); }}><option value="orchestra">管弦楽編成</option><option value="wind">吹奏楽・木管合奏</option><option value="chamber">室内楽・伴奏付き</option><option value="solo">独奏</option><option value="">すべて</option></select><span>{filtered.length}譜</span></div>
    {error && <p role="alert">{error}</p>}
    <div className="catalog-grid">{filtered.slice(0, limit).map((score) => <article className="catalog-score" key={score.id}>
      <h4>{score.featured ? "★ " : ""}{score.title}</h4>
      <p>{score.parts.length}パート · {score.measures}小節 · {score.scoreLicense}</p>
      <details><summary>編成と出典</summary><p>{score.parts.join(" / ")}</p><p>{score.editionStatus}</p><a href={score.scoreSource} target="_blank" rel="noreferrer">出典を見る</a></details>
      <button disabled={busy || loading} onClick={async () => { setLoading(true); setError(""); try { const response = await fetch(`/repertoire/ensemble/${score.id}.musicxml`); if (!response.ok) throw new Error("楽譜を取得できませんでした。"); await onLoad(new File([await response.text()], `${score.id}.musicxml`)); } catch (error) { setError(String(error)); } finally { setLoading(false); } }}>この総譜で演奏 · {score.title}</button>
      <a href={`/repertoire/ensemble/${score.id}.musicxml`} download>MusicXMLをダウンロード</a>
    </article>)}</div>
    {filtered.length > limit && <button onClick={() => setLimit(limit + 10)}>さらに10譜表示</button>}
    <p className="concert-muted"><a href="/repertoire/ensemble/sources.json">各ファイルのライセンス表示・出典・照合記録</a>。CC0表示と内部の権利表示の矛盾がない版を選定しています。</p>
    <p className="concert-muted">優先収集：ベートーヴェンのピアノ協奏曲第1番 第2楽章。再配布可能なMusicXML総譜はまだ確保できていません。<a href="https://imslp.org/wiki/Piano_Concerto_No.1,_Op.15_(Beethoven,_Ludwig_van)" target="_blank" rel="noreferrer">原曲の楽譜情報</a></p>
  </section>;
}
