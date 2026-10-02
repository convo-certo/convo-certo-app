import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { ConcertEngine } from "~/lib/concert-engine";
import { OrchestraAudio } from "~/lib/orchestra-audio";
import { parseMusicXML } from "~/lib/musicxml-parser";
import { firstPlayerExcerpt } from "~/lib/practice-excerpt";
import { useLocale } from "~/lib/locale-context";

export function ScoreAudition() {
  const { text } = useLocale();
  const player = useRef<{ audio: OrchestraAudio; engine: ConcertEngine; cancel: () => void } | null>(null);
  const [mode, setMode] = useState<"all" | "backing" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<"" | "score" | "part" | "audio" | "interrupted">("");
  const [progress, setProgress] = useState(0);
  useEffect(() => () => { player.current?.cancel(); player.current = null; }, []);

  const stop = () => {
    player.current?.cancel(); player.current = null;
    setMode(null); setBusy(false); setProgress(0);
  };
  const play = async (selected: "all" | "backing") => {
    stop(); setError(""); setBusy(true); setMode(selected);
    const audio = new OrchestraAudio();
    const engine = new ConcertEngine(() => audio.currentTime);
    const controller = new AbortController();
    let cancelled = false;
    const instance = { audio, engine, cancel: () => { cancelled = true; controller.abort(); engine.dispose(); audio.dispose(); } };
    player.current = instance;
    audio.onAvailabilityChanged = state => {
      if (!cancelled && state === "suspended" && engine.getState().status === "playing") {
        stop(); setError("interrupted");
      }
    };
    try {
      const response = await fetch("/repertoire/ensemble/mozart-k622-2.musicxml", { signal: controller.signal });
      if (!response.ok) { stop(); setError("score"); return; }
      const score = parseMusicXML(await response.text());
      if (cancelled) return;
      const excerpt = firstPlayerExcerpt(score);
      if (!excerpt) { stop(); setError("part"); return; }
      const start = score.measureStartBeats[excerpt.first - 1];
      const end = score.measureStartBeats[excerpt.last] ?? score.totalBeats;
      await audio.prepare(score.parts);
      if (cancelled) return;
      audio.setSoloAudible(selected === "all");
      engine.load(score); engine.setAnnotations([]);
      engine.setPracticeOptions({ mode: "listen", countInBars: 0, click: false });
      engine.onNote = (note, time, duration, notated) => {
        if (note.startBeat < end) audio.play(note, time, Math.min(duration, (end - note.startBeat) * 60 / engine.getState().tempo), notated);
      };
      engine.onSilence = () => audio.stop();
      engine.onState = state => {
        if (cancelled) return;
        setProgress(Math.max(0, Math.min(100, (state.beat - start) / (end - start) * 100)));
        if (state.beat >= end || state.status === "finished") stop();
      };
      engine.seek(start); engine.start(); setBusy(false);
    } catch {
      if (cancelled) return;
      stop(); setError("audio");
    }
  };

  const errorMessage = error === "score" ? text("試聴用の楽譜を読み込めませんでした。", "Couldn't load the preview score.") : error === "part" ? text("試聴するパートが見つかりませんでした。", "Couldn't find a part to preview.") : error === "interrupted" ? text("音声が中断されました。もう一度再生してください。", "Audio was interrupted. Press play to try again.") : text("音声を再生できませんでした。もう一度お試しください。", "Couldn't play audio. Please try again.");

  return <aside className="score-preview audition" aria-label={text("実際の演奏を聴く", "Hear the accompaniment")}>
    <div className="preview-heading"><span>LISTEN FIRST</span><span>{text("MusicXMLから実際に再生", "Played from MusicXML")}</span></div>
    <div className="preview-paper">
      <span className="preview-file">W. A. MOZART · K.622</span>
      <h3>{text("クラリネット協奏曲", "Clarinet Concerto")}</h3><p>{text("第2楽章 Adagio · 独奏の入りから4小節", "II. Adagio · 4 bars from the solo entrance")}</p>
      <svg className="audition-staves" viewBox="0 0 360 70" aria-hidden="true">{[12, 24, 36, 48, 60].map(y => <path key={y} d={`M0 ${y}H360`} stroke="#c6d2c3"/>)}{[40, 130, 220, 310].map((x, i) => <g key={x}><ellipse cx={x} cy={48 - i % 2 * 12} rx="7" ry="5" fill={i === 0 || i === 3 ? "#fffdf5" : "#315744"} stroke="#315744" strokeWidth="2"/><path d={`M${x + 6} ${48 - i % 2 * 12}v-30`} stroke="#315744" strokeWidth="2"/></g>)}</svg>
      <div className="audition-buttons">
        <button aria-pressed={mode === "all"} disabled={busy} onClick={() => mode === "all" ? stop() : void play("all")}><span aria-hidden="true">{mode === "all" ? "■" : "▶"}</span><span><strong>{text("全パートを聴く", "Hear all parts")}</strong><small>{text("クラリネット ＋ オーケストラ", "Clarinet + orchestra")}</small></span></button>
        <button aria-pressed={mode === "backing"} disabled={busy} onClick={() => mode === "backing" ? stop() : void play("backing")}><span aria-hidden="true">{mode === "backing" ? "■" : "▶"}</span><span><strong>{text("伴奏だけを聴く", "Hear accompaniment")}</strong><small>{text("クラリネットを抜いた同じ4小節", "Same 4 bars, with the clarinet removed")}</small></span></button>
      </div>
      <progress aria-label={text("試聴の再生位置", "Preview progress")} value={progress} max="100"/>
      <div className="audition-status"><span role="status">{busy ? text("音源を準備しています…", "Preparing sounds…") : mode ? text("再生中", "Playing") : text("ボタンを押すと音が出ます", "Press play to hear it")}</span>{mode && <button onClick={stop}>■ {text("停止", "Stop")}</button>}</div>
      {error && <p role="alert">{errorMessage}</p>}
    </div>
    <p className="audition-note">{text("アプリの音源で、楽譜から再生しています。", "This is the app playing the score with sampled instruments.")}<br/>{text("自分の総譜でも、担当を抜いて練習できます。", "Bring your own full score and leave your part to you.")}</p>
    <Link className="welcome-secondary" to="/perform?catalog=1">{text("収録曲からこの曲を選ぶ", "Find this in starter scores")} →</Link>
  </aside>;
}
