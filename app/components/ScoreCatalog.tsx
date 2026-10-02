import { useEffect, useRef, useState } from "react";
import { useLocale } from "~/lib/locale-context";
import { catalogFileSize, catalogGroups, catalogInstruments, catalogPartInstrument, catalogScoreInstruments, fetchCatalogScore, filterCatalog, orderCatalog, parseScoreCatalog, type CatalogInstrumentId, type CatalogScore } from "~/lib/score-catalog";
import "./score-catalog.css";

export function ScoreCatalog({ busy, onLoad }: { busy: boolean; onLoad: (file: File, preferredInstrument?: CatalogInstrumentId) => Promise<void> }) {
  const { text } = useLocale();
  const [requested, setRequested] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [scores, setScores] = useState<CatalogScore[] | null>(null);
  const [catalogError, setCatalogError] = useState(false);
  const [query, setQuery] = useState("");
  const [instrument, setInstrument] = useState("");
  const [limit, setLimit] = useState(8);
  const [opening, setOpening] = useState<CatalogScore | null>(null);
  const [failedScore, setFailedScore] = useState<CatalogScore | null>(null);
  const scoreRequest = useRef<AbortController | null>(null);
  const handedOff = useRef(false);
  const openingNotice = useRef<HTMLParagraphElement | null>(null);
  const failureNotice = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!requested) return;
    const controller = new AbortController();
    setCatalogError(false);
    void fetch("/repertoire/library/catalog.json", { signal: controller.signal })
      .then(response => { if (!response.ok) throw new Error("Catalogue unavailable"); return response.json(); })
      .then(data => { if (!controller.signal.aborted) setScores(orderCatalog(parseScoreCatalog(data))); })
      .catch(() => { if (!controller.signal.aborted) setCatalogError(true); });
    return () => controller.abort();
  }, [requested, attempt]);

  useEffect(() => () => scoreRequest.current?.abort(), []);
  useEffect(() => {
    if (!busy || handedOff.current || !scoreRequest.current) return;
    scoreRequest.current.abort();
    scoreRequest.current = null;
    setOpening(null);
  }, [busy]);
  useEffect(() => {
    if (failedScore) { failureNotice.current?.focus({ preventScroll: true }); failureNotice.current?.scrollIntoView({ block: "nearest" }); }
    else if (opening) openingNotice.current?.scrollIntoView({ block: "nearest" });
  }, [opening, failedScore]);

  const openScore = async (score: CatalogScore) => {
    if (busy || scoreRequest.current) return;
    const preferredInstrument = catalogScoreInstruments(score).find(item => item.id === instrument)?.id;
    const controller = new AbortController();
    scoreRequest.current = controller;
    handedOff.current = false;
    setOpening(score); setFailedScore(null);
    try {
      const file = await fetchCatalogScore(score, controller.signal);
      if (!controller.signal.aborted) { handedOff.current = true; await onLoad(file, preferredInstrument); }
    } catch {
      if (!controller.signal.aborted) setFailedScore(score);
    } finally {
      if (!controller.signal.aborted) setOpening(null);
      if (scoreRequest.current === controller) scoreRequest.current = null;
    }
  };

  const filtered = filterCatalog(scores ?? [], query, instrument);
  const available = new Set((scores ?? []).flatMap(score => catalogScoreInstruments(score).map(item => item.id)));
  const disabled = busy || opening !== null;
  const loading = requested && scores === null && !catalogError;

  return <details className="repertoire-drawer score-catalog" onToggle={event => {
    if (event.target === event.currentTarget && event.currentTarget.open) setRequested(true);
  }}>
    <summary><span>{text("曲を探す", "Browse scores")}</span><span className="score-catalog-summary-note">{text("自分の楽器・好きな編成から", "Find your instrument in the ensemble")}</span></summary>
    {requested && <section className="score-catalog-content" aria-label={text("収録楽譜", "Score library")} aria-busy={loading}>
      <div className="score-catalog-intro"><h3>{text("次は、どの曲を合わせますか。", "What would you like to rehearse?")}</h3><p>{text("自分の楽器を含む楽譜を探し、開いて担当パートを選べます。抜粋・編曲も含みます。", "Find a score with your instrument, then open it and choose your part. Includes excerpts and arrangements.")}</p></div>
      {loading && <p role="status" className="score-catalog-notice">{text("楽譜の一覧を読み込んでいます…", "Loading the score library…")}</p>}
      {catalogError && <div role="alert" className="score-catalog-notice score-catalog-error"><p>{text("楽譜の一覧を読み込めませんでした。", "Couldn't load the score library.")}</p><button disabled={disabled} onClick={() => setAttempt(value => value + 1)}>{text("一覧を再読み込み", "Retry loading scores")}</button></div>}
      {scores && <>
        <div className="score-catalog-filters">
          <label><span>{text("曲を検索", "Search scores")}</span><input type="search" aria-label={text("曲を検索", "Search scores")} placeholder={text("曲名・作曲家・楽器名", "Title, composer or instrument")} value={query} onChange={event => { setQuery(event.target.value); setLimit(8); }} /></label>
          <label><span>{text("楽器", "Instrument")}</span><select aria-label={text("楽器", "Instrument")} value={instrument} onChange={event => { setInstrument(event.target.value); setLimit(8); }}>
            <option value="">{text("すべての楽器", "All instruments")}</option>
            {catalogGroups.filter(group => catalogInstruments.some(item => item.group === group.id && available.has(item.id))).map(group => <optgroup key={group.id} label={text(group.ja, group.en)}>
              {group.id !== "voice" && group.id !== "percussion" && <option value={`group:${group.id}`}>{text(`${group.ja}すべて`, `All ${group.en.toLowerCase()}`)}</option>}
              {catalogInstruments.filter(item => item.group === group.id && available.has(item.id)).map(item => <option key={item.id} value={item.id}>{text(item.ja, item.en)}</option>)}
            </optgroup>)}
          </select></label>
        </div>
        <div className="score-catalog-results"><p role="status">{text(`${filtered.length}譜`, `${filtered.length} scores`)}</p>{(query || instrument) && <button onClick={() => { setQuery(""); setInstrument(""); setLimit(8); }}>{text("条件をクリア", "Clear filters")}</button>}</div>
        {opening && <p ref={openingNotice} role="status" className="score-catalog-notice">{text(`「${opening.title}」を開いています。大きな楽譜は少し時間がかかります…`, `Opening “${opening.title}”. Larger scores may take a moment…`)}</p>}
        {failedScore && <div ref={failureNotice} tabIndex={-1} role="alert" className="score-catalog-notice score-catalog-error"><p>{text(`「${failedScore.title}」を開けませんでした。もう一度お試しください。`, `Couldn't open “${failedScore.title}”. Please try again.`)}</p><button disabled={disabled} onClick={() => void openScore(failedScore)}>{text("この曲を再試行", "Retry this score")}</button></div>}
        {filtered.length === 0 && <div className="score-catalog-empty"><p>{text("条件に合う楽譜が見つかりませんでした。", "No scores match these filters.")}</p><p>{text("楽器や検索語を変えるか、自分のMusicXMLを開いてみてください。", "Try another instrument or search term, or open your own MusicXML.")}</p></div>}
        <div className="score-catalog-grid">{filtered.slice(0, limit).map(score => {
          const instruments = catalogScoreInstruments(score);
          const instrumentNames = instruments.map(item => text(item.ja, item.en));
          const large = score.measures >= 250 || score.parts.length >= 20;
          return <article className="score-catalog-card" key={score.id} data-score-id={score.id}>
            <div className="score-catalog-card-top"><span>{score.scope === "solo" ? text("独奏譜・独立伴奏なし", "Solo score · No separate accompaniment") : score.scope === "excerpt" ? text("抜粋", "Excerpt") : text("アンサンブル", "Ensemble")}</span><span>{catalogFileSize(score.bytes)}</span></div>
            <h4>{score.title}</h4>
            <p className="score-catalog-composer">{score.composer}</p>
            <p className="score-catalog-measures">{text(`${score.measures}小節 · ${score.parts.length}パート`, `${score.measures} bars · ${score.parts.length} ${score.parts.length === 1 ? "part" : "parts"}`)}</p>
            {score.scope === "solo" && <p className="score-catalog-solo">{text("お手本の試聴に。声部が分かれた楽譜は、一部を選んで練習できます。", "Listen to the whole score, or choose a voice to play where the notation separates them.")}</p>}
            <p className="score-catalog-instruments">{instrumentNames.length ? instrumentNames.join(" / ") : text("楽器名は楽譜を開いて確認できます", "Open the score to check the instruments")}</p>
            {large && <p className="score-catalog-large">{text("長い曲・大編成のため、準備に時間がかかることがあります。", "A longer or larger score; opening may take a moment.")}</p>}
            <details className="score-catalog-source"><summary>{text("パートと出典", "Parts & source")}</summary><ul>{score.parts.map((part, index) => {
              const kind = catalogPartInstrument(part);
              const label = catalogInstruments.find(item => item.id === kind);
              return <li key={index}>{part.name.trim() || (label ? text(label.ja, label.en) : text(`パート${index + 1}`, `Part ${index + 1}`))}</li>;
            })}</ul><a href={score.scoreSource} target="_blank" rel="noreferrer">{text("楽譜の出典", "Score source")} ↗</a><span> · {score.scoreLicense === "CC0-1.0" ? "CC0" : "Public Domain Mark"}</span></details>
            <button className="score-catalog-open" disabled={disabled} aria-label={text(`「${score.title}」を開く`, `Open ${score.title}`)} onClick={() => void openScore(score)}>{opening?.id === score.id ? text("準備しています…", "Opening…") : text("この楽譜を開く", "Open score")}<span aria-hidden="true">↗</span></button>
          </article>;
        })}</div>
        {filtered.length > limit && <button className="score-catalog-more" onClick={() => setLimit(value => value + 8)}>{text(`さらに${Math.min(8, filtered.length - limit)}譜を表示`, `Show ${Math.min(8, filtered.length - limit)} more scores`)}</button>}
        <p className="score-catalog-footer">{text("楽譜の版ごとに編成や収録範囲が異なります。", "Instrumentation and included movements vary by edition.")} <a href="/credits.html">{text("楽譜・音源の出典", "Score & sound credits")}</a></p>
      </>}
    </section>}
  </details>;
}
