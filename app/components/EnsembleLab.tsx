import { useEffect, useMemo, useRef, useState } from "react";
import type { PracticeEnsemble } from "~/lib/practice-session";
import type { ConcertEngine, ConcertState } from "~/lib/concert-engine";
import { defaultEnsembleTuning, readEnsembleTuning, tuningFields, type EnsembleTuning } from "~/lib/ensemble-tuning";
import { artistReferences, profileFromTake, readReferenceProfile, type ReferenceProfile } from "~/lib/reference-profile";
import { replayTake, scoreKey, summarizeTake, TakeRecorder, type RehearsalTake } from "~/lib/rehearsal-takes";
import { readRehearsalTake, takeFileLimit } from "~/lib/rehearsal-take-file";
import type { MeasureAnnotation, ParsedScore } from "~/lib/types";
import { useLocale } from "~/lib/locale-context";
import { performanceName } from "~/lib/performance-seats";

const tuningLabelsEn: Record<keyof typeof tuningFields, string> = {
  followAmount: "Follow my timing",
  responseSeconds: "Response smoothing (s)",
  expressionAmount: "Expression amount",
  dynamicsAmount: "Dynamics response",
  articulationAmount: "Articulation response",
  inputDelayMs: "Input delay correction (ms)",
  sectionBlend: "Blend with other players",
};

const errorsEn: Record<string, string> = {
  "テイクは16MB以下のファイルを選んでください。": "Choose a take file of 16 MB or less.",
  "演奏を停止してからテイクを開いてください。": "Stop playback before opening a take.",
  "保存時と同じ譜面・移調・担当を選んでからテイクを開いてください。": "Open the same score, transposition and part used for this take.",
  "テイクの記録が不正です。元のファイルを選び直してください。": "This take file is invalid. Choose the original exported file.",
  "同じ譜面・移調・席のテイクを選んでください。": "Choose a take with the same score, transposition and part.",
  "途中で設定や位置を変えたテイクです。設定を固定して録り直してください。": "The position or settings changed during this take. Record another take without changing them.",
  "比較するテイクは10分以内にしてください。": "Use takes of 10 minutes or less for comparison.",
  "この旧形式テイクには楽譜の演奏条件が記録されていません。比較・表現の作成には新しく記録してください。": "This older take does not include its score settings. Record a new take to compare responses or create an expression profile.",
  "テイクと楽譜の演奏条件が違います。保存時のテンポ・強弱・拍子・担当を含む譜面を開いてください。": "The take uses different score settings. Open the score with its original tempo, dynamics, meter and part.",
  "設定を固定したテイクから表現を作ってください。": "Create a profile from a take recorded without changing settings.",
  "奏者の席が選択されていません。": "Choose your part first.",
  "確かに照合できた音が4音以上あるテイクを使ってください。": "Use a take with at least four clearly matched notes.",
  "連続したフレーズを記録してください。": "Record a continuous phrase to create an expression profile.",
  "4MB以下のプロファイルを選んでください。": "Choose a profile file of 4 MB or less.",
  "対応する表現プロファイルではありません。": "This is not a supported expression profile.",
  "表現曲線の値が不正です。": "This profile contains invalid expression values. Choose the original exported file.",
  "同じ作品・楽章の表現を選んでください。": "Choose an expression profile for the same work and movement.",
};

export function EnsembleLab({ engine, score, annotations, state, disabled, seatId, initialEnsemble }: {
  engine: ConcertEngine; score: ParsedScore; annotations: MeasureAnnotation[];
  state: ConcertState; disabled: boolean; seatId: string; initialEnsemble?: PracticeEnsemble;
}) {
  const { locale, text } = useLocale();
  const [settings, setSettings] = useState<EnsembleTuning>({ ...defaultEnsembleTuning });
  const [reference, setReference] = useState<ReferenceProfile | null>(null);
  const [leader, setLeader] = useState("player");
  const [recording, setRecording] = useState(false);
  const [takes, setTakes] = useState<RehearsalTake[]>([]);
  const [comparison, setComparison] = useState<{ a: ReturnType<typeof summarizeTake>; b: ReturnType<typeof summarizeTake> } | null>(null);
  const [message, setMessage] = useState<{ ja: string; en: string } | null>(null);
  const notify = (ja: string, en: string) => setMessage({ ja, en });
  const reportError = (error: unknown, fallback: string) => {
    const ja = error instanceof Error ? error.message : String(error);
    notify(ja, errorsEn[ja] ?? fallback);
  };
  const importRevision = useRef(0);
  const [importing, setImporting] = useState(false);
  const recorder = useRef<TakeRecorder | null>(null);
  const key = useMemo(() => scoreKey(score), [score]);
  const storage = `ensemble-tuning:${key}:${seatId}`;
  const active = state.status === "playing" || state.status === "waiting";
  const leaderPart = score.parts.find(part => part.id === state.leader);

  useEffect(() => {
    importRevision.current++;
    setImporting(false);
    let value = { ...defaultEnsembleTuning };
    try { const saved = localStorage.getItem(storage); if (saved) value = readEnsembleTuning(JSON.parse(saved)); } catch {}
    if (initialEnsemble) value = readEnsembleTuning(initialEnsemble.tuning);
    setSettings(value);
    engine.setTuning(value);
    setTakes([]);
    setComparison(null);
    const restoredReference = initialEnsemble?.reference ?? null;
    engine.setReference(restoredReference);
    setReference(restoredReference);
    let nextLeader = engine.getState().leader ?? "player";
    try { nextLeader = localStorage.getItem(storage + ":leader") ?? nextLeader; } catch {}
    if (initialEnsemble) nextLeader = initialEnsemble.leader;
    try { engine.setLeader(nextLeader); }
    catch { nextLeader = "conductor"; engine.setLeader(nextLeader); }
    setLeader(nextLeader);
  }, [storage, engine, score, initialEnsemble]);

  useEffect(() => engine.observe((event) => {
    const current = recorder.current;
    if (!current) return;
    current.record(event);
    if ((event.type === "state" && ["idle", "finished"].includes(event.state.status)) || current.take.duration >= 600 || current.take.inputs.length >= 20000) {
      recorder.current = null;
      setRecording(false);
      setTakes((previous) => [current.finish(), ...previous].slice(0, 8));
    }
  }), [engine]);

  useEffect(() => () => { recorder.current = null; importRevision.current++; }, []);

  const update = (value: EnsembleTuning) => {
    const checked = readEnsembleTuning(value);
    setSettings(checked);
    engine.setTuning(checked);
    try { localStorage.setItem(storage, JSON.stringify(checked)); } catch { notify("このブラウザに設定を保存できませんでした。", "Settings could not be saved in this browser."); }
  };

  const record = () => {
    if (recording) { engine.stop(); return; }
    if (engine.getLoop()) { notify("比較用テイクではループをOFFにしてください。開始小節から10分まで記録できます。", "Turn looping off before recording a comparison take. You can record up to 10 minutes from the starting bar."); return; }
    recorder.current = new TakeRecorder(score, seatId, engine, annotations);
    setRecording(true);
    notify("音符入力と応答を記録中。録音ファイルは作りません。", "Recording note input and accompaniment responses. No audio file is recorded.");
    engine.start();
  };

  const compare = (take: RehearsalTake) => {
    try {
      const a = replayTake(score, take, take.tuning);
      const b = replayTake(score, take, settings);
      setComparison({ a: summarizeTake(a), b: summarizeTake(b) });
      notify("同じ音符入力で、元の設定Aと現在の設定Bをシミュレーションしました。録音の聴き比べではありません。", "Simulated the same note input with original settings A and current settings B. This compares responses, not audio recordings.");
    } catch (error) { reportError(error, "This take could not be compared. Record a new take with the current score and part."); }
  };

  return <details className="concert-panel studio-settings" aria-label={text("共奏のチューニング", "Ensemble tuning")}><summary>{text("演奏記録・表現モデル（実験）", "Takes & expression profiles (experimental)")}</summary>
    <p className="concert-eyebrow">LISTEN. RESPOND. PLAY TOGETHER.</p>
    <h3>{text("共奏を、あなたの席に合わせる", "Shape how the ensemble responds")}</h3>
    <div className="concert-controls">
      <label>{text("合奏の主導者", "Who leads")}<select aria-label={text("合奏の主導者", "Who leads")} value={leader} disabled={recording || disabled} onChange={(event) => { setLeader(event.target.value); engine.setLeader(event.target.value); try { localStorage.setItem(storage + ":leader", event.target.value); } catch {} }}>
        <option value="player">{text("あなたが主導する", "I lead")}</option>
        <option value="conductor">{text("指揮者・全体の拍に合わせる", "Follow the ensemble beat")}</option>
        {score.parts.filter((part) => !part.isSolo).map((part) => <option key={part.id} value={part.id}>{text(`${performanceName(part, locale)}に合わせる`, `Follow ${performanceName(part, locale)}`)}</option>)}
      </select></label>
      <span>{text("現在", "Now")}: {state.leader === "player" ? text("あなた", "You") : state.leader === "conductor" ? text("指揮者・全体の拍", "Ensemble beat") : leaderPart ? performanceName(leaderPart, locale) : text("あなた", "You")}</span>
    </div>
    <p className="concert-muted">{text("主導者を選ぶと、伴奏の合わせ方が変わります。", "Choose whose timing guides the accompaniment.")}</p>
    <details className="advanced-settings">
      <summary>{text("追従・表現の詳細", "Following & expression settings")}</summary>
      <label>{text("楽譜への追従方式", "Score following")}<select aria-label={text("楽譜への追従方式", "Score following")} value={settings.follower ?? "nearest"} disabled={active || recording || disabled} onChange={(event) => update({ ...settings, follower: event.target.value as EnsembleTuning["follower"] })}>
      <option value="nearest">{text("標準", "Standard")}</option><option value="sequence">{text("音の並びを追う（実験）", "Follow note sequences (experimental)")}</option>
      </select></label>
      <p className="concert-muted">{text("速いパッセージや長い息継ぎの後を試す実験方式です。大きく戻るときは楽譜を押します。", "An experimental option for fast passages or returning after a long pause. Select a note on the score for larger jumps.")}</p>
      <div className="concert-controls">
      {(Object.keys(tuningFields) as (keyof typeof tuningFields)[]).map((field) => <label key={field}>{text(tuningFields[field].label, tuningLabelsEn[field])} {settings[field].toFixed(field === "inputDelayMs" ? 0 : 2)}
        <input aria-label={text(`共奏 ${tuningFields[field].label}`, `Ensemble ${tuningLabelsEn[field]}`)} type="range" {...tuningFields[field]} value={settings[field]} disabled={recording || disabled} onChange={(event) => update({ ...settings, [field]: Number(event.target.value) })} />
      </label>)}
      </div>
      <p className="concert-muted">{text("設定は譜面・移調・席ごとにこのブラウザへ保存します。", "Settings are saved in this browser for each score, transposition and part.")}</p>
      <button disabled={recording || disabled} onClick={() => update({ ...defaultEnsembleTuning })}>{text("初期値に戻す", "Reset defaults")}</button>
    </details>
    <div className="concert-controls">
      <button disabled={disabled || (active && !recording) || state.status === "finished"} onClick={record}>{recording ? text("テイクを終了", "Finish take") : text("テイクを記録して演奏", "Play and record a take")}</button>
    </div>
    <label>{text("保存したテイクを開く", "Open a saved take")}<input aria-label={text("保存したテイクを開く", "Open a saved take")} type="file" accept=".json" disabled={active || recording || importing || disabled} onChange={async event => {
      const input = event.currentTarget;
      const file = input.files?.[0];
      if (!file) return;
      const revision = ++importRevision.current;
      setImporting(true);
      try {
        if (file.size > takeFileLimit) throw new Error("テイクは16MB以下のファイルを選んでください。");
        const contents = await file.text();
        if (revision !== importRevision.current) return;
        if (["playing", "waiting"].includes(engine.getState().status) || recorder.current) throw new Error("演奏を停止してからテイクを開いてください。");
        const take = readRehearsalTake(contents, score, seatId);
        setTakes(items => [take, ...items.filter(item => item.id !== take.id)].slice(0, 8));
        setComparison(null);
        if (take.scoreContext) notify("テイクと感想を開きました。同じ入力でA/B比較できます。現在の演奏設定は保っています。", "Take and feedback opened. Compare settings using the same input; your current performance settings are unchanged.");
        else notify("旧形式のテイクと感想を開きました。楽譜の演奏条件を確認できないため、比較・表現の作成には新しく記録してください。", "Older take and feedback opened. Record a new take to compare responses or create an expression profile, because its score settings cannot be verified.");
      } catch (error) {
        if (revision === importRevision.current) reportError(error, "This take could not be opened. Choose an exported take for the current score and part.");
      } finally {
        input.value = "";
        if (revision === importRevision.current) setImporting(false);
      }
    }} /></label>
    {message && <p role="status">{text(message.ja, message.en)}</p>}
    {takes.length > 0 && <p className="concert-muted">{text("テイクと感想はこの画面を閉じると消えます。残したいテイクは「テイクの記録を保存」でファイルに保存してください。保存したファイルは、同じ譜面・移調・担当で「保存したテイクを開く」から戻せます。表示は最新8件までです。自動送信はしません。位置一致はシステムの判定で、演奏の正確さの採点ではありません。", "Takes and feedback disappear when you leave this screen. Save a take file to reopen it with the same score, transposition and part. The latest eight takes are shown; nothing is sent automatically. Position matches describe the system's tracking, not a performance grade.")}</p>}
    {takes.map((take, index) => {
      const summary = summarizeTake(take);
      return <div className="concert-panel" key={take.id}>
        <strong>{text(`テイク ${takes.length - index}`, `Take ${takes.length - index}`)}</strong> · {text(`${take.duration.toFixed(1)}秒 · 入力 ${summary.notes}音 · 位置一致 ${summary.matches}回`, `${take.duration.toFixed(1)} s · ${summary.notes} input notes · ${summary.matches} position matches`)}
        <div className="concert-controls">
          <label>{text("吹いてみた感想", "How did it feel?")}<select aria-label={text(`テイク ${takes.length - index} の感想`, `Feedback for take ${takes.length - index}`)} value={take.feedback} onChange={(event) => setTakes((items) => items.map((item) => item.id === take.id ? { ...item, feedback: event.target.value } : item))}>
            <option value="">{text("選択する", "Choose feedback")}</option>
            <option value="自然に合わせられた">{text("自然に合わせられた", "It felt natural")}</option>
            <option value="伴奏が急いだ">{text("伴奏が急いだ", "The accompaniment rushed")}</option>
            <option value="伴奏が待ちすぎた">{text("伴奏が待ちすぎた", "The accompaniment waited too long")}</option>
            <option value="表情が強すぎた">{text("表情が強すぎた", "The expression was too strong")}</option>
            <option value="入力を見失った">{text("入力を見失った", "It lost track of my playing")}</option>
          </select></label>
          <button disabled={active || disabled || !take.scoreContext || take.changedSetup || take.duration > 600} onClick={() => compare(take)}>{text("同じ入力でA/B比較", "Compare A/B with the same input")}</button>
          <button disabled={active || disabled} onClick={() => update(take.tuning)}>{text("このテイクの設定に戻す", "Restore this take's settings")}</button>
          <button disabled={active || disabled || !take.scoreContext} onClick={() => {
            try { const profile = profileFromTake(score, take); engine.setReference(profile); setReference(profile); notify("照合できた音からテンポ・強弱・切り方の曲線を作りました。次の共奏に反映します。", "Tempo, dynamics and articulation curves were created from matched notes. They will shape the next performance."); }
            catch (error) { reportError(error, "An expression profile could not be created. Record a new take with the current score and part."); }
          }}>{text("このテイクの表現で共奏する", "Use this take's expression")}</button>
          <button onClick={() => {
            const url = URL.createObjectURL(new Blob([JSON.stringify(take, null, 2)], { type: "application/json" }));
            const link = document.createElement("a"); link.href = url; link.download = `convo-take-${take.id}.json`; link.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
          }}>{text("テイクの記録を保存", "Save take file")}</button>
        </div>
        <details>
          <summary>{text("次の練習のためにメモを残す（任意）", "Notes for next time (optional)")}</summary>
          <div className="concert-controls">
            <label>{text("次の練習でも使いたいですか", "Would you use it next time?")}<select aria-label={text(`テイク ${takes.length - index} の再利用意向`, `Use again after take ${takes.length - index}`)} value={take.experience?.reuse ?? ""} onChange={(event) => setTakes(items => items.map(item => item.id === take.id ? { ...item, experience: { notes: item.experience?.notes ?? "", reuse: event.target.value as NonNullable<RehearsalTake["experience"]>["reuse"] } } : item))}>
              <option value="">{text("未回答", "No answer")}</option><option value="yes">{text("使いたい", "Yes")}</option><option value="unsure">{text("まだ分からない", "Not sure yet")}</option><option value="no">{text("今のままでは使わない", "Not as it is")}</option>
            </select></label>
            <label>{text("良かったところ・困ったところ", "What worked, and what was difficult?")}<textarea aria-label={text(`テイク ${takes.length - index} の練習メモ`, `Practice notes for take ${takes.length - index}`)} rows={3} maxLength={2000} placeholder={text("例：8小節目の息継ぎで伴奏が先に進んだ。次は入りを待つ設定で試したい。", "Example: The accompaniment moved ahead during my breath at bar 8. Next time, try waiting for my entry.")} value={take.experience?.notes ?? ""} onChange={(event) => setTakes(items => items.map(item => item.id === take.id ? { ...item, experience: { reuse: item.experience?.reuse ?? "", notes: event.target.value } } : item))} /></label>
          </div>
        </details>
        {!take.scoreContext && <p>{text("旧形式のテイクです。感想や入力は確認できますが、楽譜の演奏条件がないため比較・表現の作成はできません。", "This older take includes feedback and input, but lacks the score settings needed for comparisons and expression profiles.")}</p>}
        {take.changedSetup && <p>{text("演奏中に位置や設定が変わったため、このテイクはA/B比較できません。", "This take cannot be compared because the position or settings changed during the performance.")}</p>}
      </div>;
    })}
    <details>
      <summary>{text("参考演奏と表現プロファイル", "Reference performances & expression profiles")}</summary>
      <p>{text("あなたのテイクから作った表現を保存・読み込みできます。人物名だけから個性を生成する機能ではありません。", "Save and open expression profiles made from your takes. A performer's name alone cannot generate their style.")}</p>
      <label>{text("表現プロファイルを読み込む", "Open expression profile")}<input aria-label={text("表現プロファイルを読み込む", "Open expression profile")} type="file" accept=".json" disabled={active || disabled} onChange={async (event) => {
        const file = event.target.files?.[0]; if (!file) return;
        try { if (file.size > 4_000_000) throw new Error("4MB以下のプロファイルを選んでください。"); const profile = readReferenceProfile(await file.text()); engine.setReference(profile); setReference(profile); }
        catch (error) { reportError(error, "This expression profile could not be opened. Choose an exported profile for the same work and movement."); }
        event.target.value = "";
      }} /></label>
      {reference && <div className="concert-controls"><span>{reference.title} · {text(`${reference.points.length}点 · 元テイク ${reference.source.takeId.slice(0, 8)}`, `${reference.points.length} points · Source take ${reference.source.takeId.slice(0, 8)}`)}</span>
        <button disabled={active} onClick={() => { engine.setReference(null); setReference(null); }}>{text("参考表現を外す", "Remove expression profile")}</button>
        <button onClick={() => { const url = URL.createObjectURL(new Blob([JSON.stringify(reference, null, 2)], { type: "application/json" })); const link = document.createElement("a"); link.href = url; link.download = "convo-expression.json"; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }}>{text("表現プロファイルを保存", "Save expression profile")}</button>
      </div>}
      <h4>{text("見つかった公式の参考演奏", "Official reference performances")}</h4>
      {artistReferences.map((item) => <p key={item.url}><a href={item.url} target="_blank" rel="noreferrer">{item.title} · {item.work}</a><br /><small>{text(item.status, "Official performance information. Reuse and analysis permissions have not been checked. Not used in expression profiles.")}</small></p>)}
    </details>
    {comparison && <table><caption>{text("同一入力の応答比較（自然さの評価は演奏者が行います）", "Response to the same input — you judge how natural it feels")}</caption><thead><tr><th>{text("設定", "Settings")}</th><th>{text("平均テンポ", "Average tempo")}</th><th>{text("到達位置", "Final position")}</th><th>{text("位置一致", "Position matches")}</th></tr></thead><tbody>{(["a", "b"] as const).map((variant) => <tr key={variant}><th>{variant.toUpperCase()}</th><td>{comparison[variant].averageTempo.toFixed(1)} BPM</td><td>{text(`${comparison[variant].lastBeat.toFixed(2)}拍`, `Beat ${comparison[variant].lastBeat.toFixed(2)}`)}</td><td>{text(`${comparison[variant].matches}回`, `${comparison[variant].matches}`)}</td></tr>)}</tbody></table>}
  </details>;
}
