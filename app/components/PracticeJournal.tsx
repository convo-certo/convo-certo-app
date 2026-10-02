import { useEffect, useMemo, useRef, useState } from "react";
import { listPracticeJournal, removePracticeJournalEntry, type PracticeJournalEntry } from "~/lib/practice-journal";
import type { LibraryScore } from "~/lib/score-library";
import { useLocale } from "~/lib/locale-context";
import { performanceName, readPerformanceSeatName } from "~/lib/performance-seats";

function duration(seconds: number, english: boolean): string {
  if (seconds < 60) return english ? `${Math.floor(seconds)} sec` : `${Math.floor(seconds)}秒`;
  if (seconds < 3600) return english ? `${Math.floor(seconds / 60)} min` : `${Math.floor(seconds / 60)}分`;
  return english ? `${Math.floor(seconds / 3600)} hr ${Math.floor(seconds % 3600 / 60)} min` : `${Math.floor(seconds / 3600)}時間${Math.floor(seconds % 3600 / 60)}分`;
}

export function PracticeJournal({ onResume, refreshKey = 0, busy = false }: {
  onResume: (practice: LibraryScore) => void | Promise<void>;
  refreshKey?: number;
  busy?: boolean;
}) {
  const { locale, text } = useLocale();
  const [entries, setEntries] = useState<PracticeJournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<"" | "load" | "open" | "remove">("");
  const [retry, setRetry] = useState(0);
  const [opening, setOpening] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [pendingRemoval, setPendingRemoval] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  const [removedTitle, setRemovedTitle] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  const readVersion = useRef(0);
  const seatNames = useMemo(() => new Map(entries.map(entry => [entry.id, readPerformanceSeatName(entry.practice.xml, entry.practice.session!.seatId, entry.seatName)])), [entries]);
  useEffect(() => {
    let active = true;
    const version = ++readVersion.current;
    setLoading(true);
    void listPracticeJournal().then(result => {
      if (active && version === readVersion.current) { setEntries(result); setError(""); }
    }).catch(() => {
      if (active && version === readVersion.current) setError("load");
    }).finally(() => { if (active && version === readVersion.current) setLoading(false); });
    return () => { active = false; };
  }, [refreshKey, retry]);

  const resume = async (practice: LibraryScore) => {
    setOpening(true); setError(""); setPendingRemoval(null);
    try { await onResume(practice); }
    catch { setError("open"); }
    finally { setOpening(false); }
  };

  const remove = async (entry: PracticeJournalEntry) => {
    readVersion.current++;
    setLoading(false); setRemoving(true); setError(""); setRemovedTitle("");
    try {
      await removePracticeJournalEntry(entry.id);
      setEntries(previous => previous.filter(item => item.id !== entry.id));
      setPendingRemoval(null); setRemovedTitle(entry.practice.title);
      heading.current?.focus();
    } catch { setError("remove"); }
    finally { setRemoving(false); }
  };

  return <section className="practice-journal" aria-label={text("最近の練習", "Recent practice")} aria-busy={loading || opening || removing}>
    <div className="practice-journal-heading"><h2 ref={heading} tabIndex={-1}>{text("練習の続きから", "Pick up where you left off")}</h2><span>{text("この端末に保存", "Saved on this device")}</span></div>
    {error && <div className="practice-journal-error"><p role="alert">{error === "load" ? text("練習履歴を読み込めませんでした。", "Couldn't load your practice history.") : error === "remove" ? text("練習履歴を削除できませんでした。もう一度お試しください。", "Couldn't remove this practice history. Please try again.") : text("練習を開けませんでした。もう一度お試しください。", "Couldn't open this practice. Please try again.")}</p><button onClick={() => setRetry(value => value + 1)} disabled={loading || removing}>{text("再読み込み", "Try again")}</button></div>}
    {removedTitle && <p role="status">{text(`「${removedTitle}」の履歴を削除しました。`, `Removed practice history for “${removedTitle}”.`)}</p>}
    {!error && !entries.length && !removedTitle && <p className="practice-journal-empty" role="status">{loading ? text("練習履歴を読み込み中…", "Loading your practice…") : text("演奏すると、楽譜・テンポ・練習区間がここに残ります。", "After you play, return here to your score, tempo and passage.")}</p>}
    {!!entries.length && <div className="practice-journal-grid">{entries.slice(0, expanded ? 12 : 3).map(entry => {
      const session = entry.practice.session!;
      const seatName = performanceName(seatNames.get(entry.id) ?? { name: entry.seatName }, locale);
      return <div className="practice-journal-entry" key={entry.id}><button className="practice-journal-card" disabled={busy || opening || removing || loading} onClick={() => void resume(entry.practice)} aria-label={text(`${entry.practice.title}、${seatName}の練習を再開`, `Resume ${entry.practice.title}, ${seatName}`)}>
        <span className="practice-journal-date">{new Intl.DateTimeFormat(locale === "ja" ? "ja-JP" : "en", { month: "short", day: "numeric" }).format(new Date(entry.lastPlayedAt))}<span aria-hidden="true">↗</span></span>
        <strong>{entry.practice.title}</strong>
        <span className="practice-journal-passage">{seatName} · ♩ {Math.round(session.tempo)} · {session.loopEnabled ? text(`${session.startMeasure}–${session.loopEnd}小節`, `Bars ${session.startMeasure}–${session.loopEnd}`) : text(`${entry.resumeMeasure}小節から`, `From bar ${entry.resumeMeasure}`)}</span>
        <span className="practice-journal-stats">{text(`${entry.practiceDates.length}日 · ${entry.sessionCount}回 · 演奏 ${duration(entry.totalPlayedSeconds, false)}`, `${entry.practiceDates.length} ${entry.practiceDates.length === 1 ? "day" : "days"} · ${entry.sessionCount} ${entry.sessionCount === 1 ? "session" : "sessions"} · ${duration(entry.totalPlayedSeconds, true)}`)}</span>
      </button>
      {pendingRemoval === entry.id ? <div className="practice-journal-confirm">
        <p>{text("この担当の履歴と再開用データを削除します。マイ楽譜の保存データは残ります。", "Remove this part’s history and resume data? Scores saved in your library will stay.")}</p>
        <button disabled={busy || opening || removing} onClick={() => void remove(entry)}>{removing ? text("削除中…", "Removing…") : text("履歴を削除", "Remove history")}</button>
        <button disabled={removing} onClick={() => setPendingRemoval(null)}>{text("キャンセル", "Cancel")}</button>
      </div> : <button className="practice-journal-remove" disabled={busy || opening || removing || loading} aria-label={text(`${entry.practice.title}、${seatName}を履歴から削除`, `Remove ${entry.practice.title}, ${seatName} from history`)} onClick={() => { setPendingRemoval(entry.id); setRemovedTitle(""); }}>{text("履歴から削除", "Remove from history")}</button>}
      </div>;
    })}</div>}
    {opening && <p role="status">{text("練習を開いています…", "Opening your practice…")}</p>}
    {entries.length > 3 && <button className="practice-journal-more" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>{expanded ? text("最近の3曲を表示", "Show recent 3") : text(`ほかの練習を見る（${entries.length - 3}）`, `More practice (${entries.length - 3})`)}</button>}
  </section>;
}
