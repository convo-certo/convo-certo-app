import { useEffect, useState } from "react";
interface CatalogScore { id: string; title: string; composer: string; parts: string[]; measures: number; category: string; featured: boolean; scoreLicense: string; scoreSource: string; editionStatus: string }
const isClarinetPart = (name: string) => /clarinet|clari[nm]ette|クラリネット/i.test(name) || /(?:^|[^a-z])(?:solo|[1-4](?:st|nd|rd|th)?)?cl(?:[^a-z]|$)/i.test(name) || /\bcla\b/i.test(name);
const licenseLabel = (license: string) => license === "CC0-1.0" ? "公開利用可・CC0" : license === "PDM-1.0" ? "公開利用可・PDM" : license;
const licenseUrl = (license: string) => license === "CC0-1.0" ? "https://creativecommons.org/publicdomain/zero/1.0/" : license === "PDM-1.0" ? "https://creativecommons.org/publicdomain/mark/1.0/" : "https://creativecommons.org/share-your-work/cclicenses/";
export function ScoreCatalog({ busy, onLoad }: { busy: boolean; onLoad: (file: File) => Promise<void> }) {
  const [scores, setScores] = useState<CatalogScore[]>([]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [clarinetOnly, setClarinetOnly] = useState(false);
  const [limit, setLimit] = useState(10);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { let cancelled = false; void fetch("/repertoire/ensemble/catalog.json").then((response) => { if (!response.ok) throw new Error(); return response.json(); }).then((data: CatalogScore[]) => { if (!cancelled) setScores(data); }).catch(() => { if (!cancelled) setError("楽譜一覧を読み込めませんでした。"); }); return () => { cancelled = true; }; }, []);
  const filtered = scores.filter((score) => (!category || score.category === category) && (!clarinetOnly || score.parts.some(isClarinetPart)) && `${score.title} ${score.composer} ${score.parts.join(" ")}`.toLowerCase().includes(query.toLowerCase())).sort((a, b) => Number(b.featured) - Number(a.featured));
  const clarinetCount = scores.filter((score) => score.parts.some(isClarinetPart)).length;
  const priorityRoadmap = [
    ["ベートーヴェン交響曲第5番 第1楽章", "収録済み"],
    ["ベートーヴェン交響曲第6番《田園》第1楽章", "第1楽章を収録済み・全曲を検証中"],
    ["ベートーヴェン交響曲第7番", "全曲MusicXMLを検証中"],
    ["モーツァルト クラリネット五重奏曲 K.581", "5パートを浄書・校正中"],
    ["ブラームス クラリネットソナタ Op.120-2", "ローカルMIDI変換版あり・公開用浄書中"],
  ];
  const verifiedWindScores = scores.filter((score) => score.category === "wind" && ["CC0-1.0", "PDM-1.0"].includes(score.scoreLicense)).map((score) => [score.title, "収録済み・権利確認済み"] as const);
  const windCandidates = [
    ["ホルスト：吹奏楽のための第1組曲", "公開版の編曲者・全パート校合待ち"],
    ["ホルスト：吹奏楽のための第2組曲", "MusicXML全曲版の取得待ち"],
    ["スーザ：ワシントン・ポスト", "吹奏楽版の利用条件を確認中"],
    ["スーザ：星条旗よ永遠なれ", "吹奏楽版の利用条件を確認中"],
    ["フチーク：軍隊の子供たち", "公開初版の全パート確認待ち"],
    ["フチーク：ファンファーレ・クレンゲ", "公開初版の全パート確認待ち"],
    ["アルフォード：ホーリー・ルード", "公開版の編成確認待ち"],
    ["アルフォード：消えた軍隊", "公開版の編成確認待ち"],
    ["ホルスト：第1組曲《シャコンヌ》", "PDMX公開版の編曲者・権利確認待ち"],
    ["ヘンデル：水上の音楽", "PDMX公開版の編成確認待ち"],
    ["クラーク：ウィリアム王の行進曲", "PDMX公開版の編成確認待ち"],
  ] as const;
  const permissionQueue = [
    ["Alfred Reed：アルメニアン・ダンス Part I", "出版社・権利者のMusicXML利用許諾待ち"],
    ["Alfred Reed：エル・カミーノ・レアル", "出版社・権利者のMusicXML利用許諾待ち"],
    ["Alfred Reed：春の猟犬", "出版社・権利者のMusicXML利用許諾待ち"],
    ["Alfred Reed：A Festival Prelude", "出版社・権利者のMusicXML利用許諾待ち"],
    ["吹奏楽コンクール課題曲（各年度）", "作曲者・編曲者・指定版ごとの許諾確認待ち"],
  ] as const;
  return <section className="concert-panel" aria-label="MusicXMLライブラリ">
    <h3>好きな楽器で、オーケストラの中へ</h3>
    <p><a href="/repertoire/ensemble/ConvoCerto-MusicXML.zip" download>MusicXML一式をZIPでダウンロード</a></p>
    <p>MusicXML {scores.length}譜・クラリネット席 {clarinetCount}譜・公開利用可能な管楽／金管 {verifiedWindScores.length}譜。総譜のパートを選んで共奏できます。★は優先収録曲です。</p>
    <div className="concert-controls"><input aria-label="収録楽譜を検索" placeholder="曲名・作曲家・楽器名" value={query} onChange={(event) => { setQuery(event.target.value); setLimit(10); }} /><select aria-label="楽譜の編成" value={category} onChange={(event) => { setCategory(event.target.value); setLimit(10); }}><option value="orchestra">管弦楽編成</option><option value="wind">管楽・金管合奏</option><option value="chamber">室内楽・伴奏付き</option><option value="solo">独奏</option><option value="">すべて</option></select><label><input aria-label="クラリネット席ありのみ" type="checkbox" checked={clarinetOnly} onChange={(event) => { setClarinetOnly(event.target.checked); setLimit(10); }} /> クラリネット席あり</label><span>{filtered.length}譜</span></div>
    <details className="concert-roadmap"><summary>優先曲の収録状況</summary><ul>{priorityRoadmap.map(([title, status]) => <li key={title}><strong>{title}</strong><span>{status}</span></li>)}</ul></details>
    <details className="concert-roadmap"><summary>公開利用可能な管楽・金管合奏 {verifiedWindScores.length}曲</summary><ul>{verifiedWindScores.map(([title, status]) => <li key={title}><strong>{title}</strong><span>{status}</span></li>)}</ul></details>
    <details className="concert-roadmap"><summary>吹奏楽の追加候補 {windCandidates.length}曲</summary><ul>{windCandidates.map(([title, status]) => <li key={title}><strong>{title}</strong><span>{status}</span></li>)}</ul><p className="concert-muted">候補は権利と版の確認が終わるまで配布カタログに追加しません。許諾済みのMusicXMLは持ち込みから演奏できます。</p></details>
    <details className="concert-roadmap"><summary>許諾待ちの人気吹奏楽作品 {permissionQueue.length}件</summary><ul>{permissionQueue.map(([title, status]) => <li key={title}><strong>{title}</strong><span>{status}</span></li>)}</ul><p className="concert-muted">許諾範囲はアプリ内表示、伴奏生成、移調・編集、商用配布を分けて確認します。</p></details>
    {error && <p role="alert">{error}</p>}
    <div className="catalog-grid">{filtered.slice(0, limit).map((score) => <article className="catalog-score" key={score.id}>
      <h4>{score.featured ? "★ " : ""}{score.title}</h4>
      <p>{score.parts.length}パート · {score.measures}小節 · <a aria-label="利用条件" href={licenseUrl(score.scoreLicense)} target="_blank" rel="noreferrer">{licenseLabel(score.scoreLicense)}</a></p>
      <p aria-label="クラリネット席の有無">{score.parts.some(isClarinetPart) ? "クラリネット席あり" : "クラリネット席なし"}</p>
      <details><summary>編成と出典</summary><p>{score.parts.join(" / ")}</p><p>{score.editionStatus}</p><a href={score.scoreSource} target="_blank" rel="noreferrer">出典を見る</a></details>
      <button disabled={busy || loading} onClick={async () => { setLoading(true); setError(""); try { const response = await fetch(`/repertoire/ensemble/${score.id}.musicxml`); if (!response.ok) throw new Error("楽譜を取得できませんでした。"); await onLoad(new File([await response.text()], `${score.id}.musicxml`)); } catch (error) { setError(String(error)); } finally { setLoading(false); } }}>この総譜で演奏 · {score.title}</button>
      <a href={`/repertoire/ensemble/${score.id}.musicxml`} download>MusicXMLをダウンロード</a>
    </article>)}</div>
    {filtered.length > limit && <button onClick={() => setLimit(limit + 10)}>さらに10譜表示</button>}
    <p className="concert-muted"><a href="/repertoire/ensemble/sources.json">各ファイルのライセンス表示・出典・照合記録</a>。CC0表示と内部の権利表示の矛盾がない版を選定しています。<a href="/repertoire/ensemble/pdmx-wind-candidates.json" target="_blank" rel="noreferrer">追加候補の調査レポート（権利未確定）</a></p>
    <p className="concert-muted">優先収集：ベートーヴェン交響曲第5・6・7番。5番第1楽章と6番《田園》第1楽章は収録済み、全曲総譜の検証を進めています。<a href="https://imslp.org/wiki/Symphony_No.5%2C_Op.67_(Beethoven%2C_Ludwig_van)" target="_blank" rel="noreferrer">原曲の楽譜情報</a></p>
  </section>;
}
