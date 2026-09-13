import { useEffect, useState } from "react";
interface CatalogScore { id: string; title: string; composer: string; parts: string[]; measures: number; category: string; featured: boolean; scoreLicense: string; scoreSource: string; editionStatus: string }
export function ScoreCatalog({ busy, onLoad }: { busy: boolean; onLoad: (file: File) => Promise<void> }) {
  const [scores, setScores] = useState<CatalogScore[]>([]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("orchestra");
  const [clarinetOnly, setClarinetOnly] = useState(false);
  const [limit, setLimit] = useState(10);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { let cancelled = false; void fetch("/repertoire/ensemble/catalog.json").then((response) => { if (!response.ok) throw new Error(); return response.json(); }).then((data: CatalogScore[]) => { if (!cancelled) setScores(data); }).catch(() => { if (!cancelled) setError("楽譜一覧を読み込めませんでした。"); }); return () => { cancelled = true; }; }, []);
  const filtered = scores.filter((score) => (!category || score.category === category) && (!clarinetOnly || score.parts.some((part) => /clarinet|clari[nm]ette|クラリネット/i.test(part))) && `${score.title} ${score.composer} ${score.parts.join(" ")}`.toLowerCase().includes(query.toLowerCase())).sort((a, b) => Number(b.featured) - Number(a.featured));
  const clarinetCount = scores.filter((score) => score.parts.some((part) => /clarinet|clari[nm]ette|クラリネット/i.test(part))).length;
  const priorityRoadmap = [
    ["ベートーヴェン交響曲第5番 第1楽章", "収録済み"],
    ["ベートーヴェン交響曲第6番《田園》第1楽章", "第1楽章を収録済み・全曲を検証中"],
    ["ベートーヴェン交響曲第7番", "全曲MusicXMLを検証中"],
    ["モーツァルト クラリネット五重奏曲 K.581", "5パートを浄書・校正中"],
    ["ブラームス クラリネットソナタ Op.120-2", "ローカルMIDI変換版あり・公開用浄書中"],
  ];
  const windCandidates = [
    ["ドヴォルザーク《新世界より》第4楽章", "収録済み・権利確認済み"],
    ["ラデツキー行進曲", "収録済み・権利確認済み"],
    ["フロレンティーナ行進曲", "収録済み・権利確認済み"],
    ["オックスフォード伯の行進曲", "収録済み・権利確認済み"],
    ["Salvation Is Created", "収録済み・権利確認済み"],
    ["ヘンデル La March", "収録済み・権利確認済み"],
    ["ビゼー《アルルの女》金管版", "収録済み・権利確認済み"],
    ["ビゼー《アルルの女》拡張金管版", "収録済み・権利確認済み"],
    ["バッハ 管弦楽組曲第1番", "収録済み・権利確認済み"],
    ["モーツァルト トルコ行進曲", "収録済み・権利確認済み"],
  ];
  return <section className="concert-panel" aria-label="MusicXMLライブラリ">
    <h3>好きな楽器で、オーケストラの中へ</h3>
    <p><a href="/repertoire/ensemble/ConvoCerto-MusicXML.zip" download>MusicXML一式をZIPでダウンロード</a></p>
    <p>MusicXML {scores.length}譜・クラリネット席 {clarinetCount}譜。総譜のパートを選んで共奏できます。★は優先収録曲です。</p>
    <div className="concert-controls"><input aria-label="収録楽譜を検索" placeholder="曲名・作曲家・楽器名" value={query} onChange={(event) => { setQuery(event.target.value); setLimit(10); }} /><select aria-label="楽譜の編成" value={category} onChange={(event) => { setCategory(event.target.value); setLimit(10); }}><option value="orchestra">管弦楽編成</option><option value="wind">吹奏楽・木管合奏</option><option value="chamber">室内楽・伴奏付き</option><option value="solo">独奏</option><option value="">すべて</option></select><label><input aria-label="クラリネット席ありのみ" type="checkbox" checked={clarinetOnly} onChange={(event) => { setClarinetOnly(event.target.checked); setLimit(10); }} /> クラリネット席あり</label><span>{filtered.length}譜</span></div>
    <details className="concert-roadmap"><summary>優先曲の収録状況</summary><ul>{priorityRoadmap.map(([title, status]) => <li key={title}><strong>{title}</strong><span>{status}</span></li>)}</ul></details>
    <details className="concert-roadmap"><summary>公開利用可能な管楽曲 10曲</summary><ul>{windCandidates.map(([title, status]) => <li key={title}><strong>{title}</strong><span>{status}</span></li>)}</ul></details>
    {error && <p role="alert">{error}</p>}
    <div className="catalog-grid">{filtered.slice(0, limit).map((score) => <article className="catalog-score" key={score.id}>
      <h4>{score.featured ? "★ " : ""}{score.title}</h4>
      <p>{score.parts.length}パート · {score.measures}小節 · {score.scoreLicense}</p>
      <p aria-label="クラリネット席の有無">{score.parts.some((part) => /clarinet|clari[nm]ette|クラリネット/i.test(part)) ? "クラリネット席あり" : "クラリネット席なし"}</p>
      <details><summary>編成と出典</summary><p>{score.parts.join(" / ")}</p><p>{score.editionStatus}</p><a href={score.scoreSource} target="_blank" rel="noreferrer">出典を見る</a></details>
      <button disabled={busy || loading} onClick={async () => { setLoading(true); setError(""); try { const response = await fetch(`/repertoire/ensemble/${score.id}.musicxml`); if (!response.ok) throw new Error("楽譜を取得できませんでした。"); await onLoad(new File([await response.text()], `${score.id}.musicxml`)); } catch (error) { setError(String(error)); } finally { setLoading(false); } }}>この総譜で演奏 · {score.title}</button>
      <a href={`/repertoire/ensemble/${score.id}.musicxml`} download>MusicXMLをダウンロード</a>
    </article>)}</div>
    {filtered.length > limit && <button onClick={() => setLimit(limit + 10)}>さらに10譜表示</button>}
    <p className="concert-muted"><a href="/repertoire/ensemble/sources.json">各ファイルのライセンス表示・出典・照合記録</a>。CC0表示と内部の権利表示の矛盾がない版を選定しています。</p>
    <p className="concert-muted">優先収集：ベートーヴェン交響曲第5・6・7番。5番第1楽章と6番《田園》第1楽章は収録済み、全曲総譜の検証を進めています。<a href="https://imslp.org/wiki/Symphony_No.5%2C_Op.67_(Beethoven%2C_Ludwig_van)" target="_blank" rel="noreferrer">原曲の楽譜情報</a></p>
  </section>;
}
