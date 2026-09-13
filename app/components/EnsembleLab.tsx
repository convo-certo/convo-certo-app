import { useEffect, useMemo, useRef, useState } from "react";
import type { PracticeEnsemble } from "~/lib/practice-session";
import type { ConcertEngine, ConcertState } from "~/lib/concert-engine";
import { defaultEnsembleTuning, readEnsembleTuning, tuningFields, type EnsembleTuning } from "~/lib/ensemble-tuning";
import { artistReferences, profileFromTake, readReferenceProfile, type ReferenceProfile } from "~/lib/reference-profile";
import { replayTake, scoreKey, summarizeTake, TakeRecorder, type RehearsalTake } from "~/lib/rehearsal-takes";
import { readRehearsalTake, takeFileLimit } from "~/lib/rehearsal-take-file";
import type { MeasureAnnotation, ParsedScore } from "~/lib/types";

export function EnsembleLab({ engine, score, annotations, state, disabled, seatId, initialEnsemble }: {
  engine: ConcertEngine; score: ParsedScore; annotations: MeasureAnnotation[];
  state: ConcertState; disabled: boolean; seatId: string; initialEnsemble?: PracticeEnsemble;
}) {
  const [settings, setSettings] = useState<EnsembleTuning>({ ...defaultEnsembleTuning });
  const [reference, setReference] = useState<ReferenceProfile | null>(null);
  const [leader, setLeader] = useState("player");
  const [recording, setRecording] = useState(false);
  const [takes, setTakes] = useState<RehearsalTake[]>([]);
  const [comparison, setComparison] = useState<{ a: ReturnType<typeof summarizeTake>; b: ReturnType<typeof summarizeTake> } | null>(null);
  const [message, setMessage] = useState("");
  const importRevision = useRef(0);
  const [importing, setImporting] = useState(false);
  const recorder = useRef<TakeRecorder | null>(null);
  const key = useMemo(() => scoreKey(score), [score]);
  const storage = `ensemble-tuning:${key}:${seatId}`;
  const active = state.status === "playing" || state.status === "waiting";

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
    try { localStorage.setItem(storage, JSON.stringify(checked)); } catch { setMessage("このブラウザに設定を保存できませんでした。"); }
  };

  const record = () => {
    if (recording) { engine.stop(); return; }
    if (engine.getLoop()) { setMessage("比較用テイクではループをOFFにしてください。開始小節から10分まで記録できます。"); return; }
    recorder.current = new TakeRecorder(score, seatId, engine, annotations);
    setRecording(true);
    setMessage("音符入力と応答を記録中。録音ファイルは作りません。");
    engine.start();
  };

  const compare = (take: RehearsalTake) => {
    try {
      const a = replayTake(score, take, take.tuning);
      const b = replayTake(score, take, settings);
      setComparison({ a: summarizeTake(a), b: summarizeTake(b) });
      setMessage("同じ音符入力で、元の設定Aと現在の設定Bをシミュレーションしました。録音の聴き比べではありません。");
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
  };

  return <section className="concert-panel" aria-label="共奏のチューニング">
    <p className="concert-eyebrow">LISTEN. RESPOND. PLAY TOGETHER.</p>
    <h3>共奏を、あなたの席に合わせる</h3>
    <div className="concert-controls">
      <label>合奏の主導者<select aria-label="合奏の主導者" value={leader} disabled={recording || disabled} onChange={(event) => { setLeader(event.target.value); engine.setLeader(event.target.value); try { localStorage.setItem(storage + ":leader", event.target.value); } catch {} }}>
        <option value="player">あなたが主導する</option>
        <option value="conductor">指揮者・全体の拍に合わせる</option>
        {score.parts.filter((part) => !part.isSolo).map((part) => <option key={part.id} value={part.id}>{part.name}に合わせる</option>)}
      </select></label>
      <span>現在: {state.leader === "player" ? "あなた" : state.leader === "conductor" ? "指揮者・全体の拍" : score.parts.find((part) => part.id === state.leader)?.name ?? "あなた"}</span>
    </div>
    <p className="concert-muted">主導者を選ぶと、伴奏の合わせ方が変わります。</p>
    <details className="advanced-settings" open>
      <summary>追従・表現の詳細</summary>
      <label>楽譜への追従方式<select aria-label="楽譜への追従方式" value={settings.follower ?? "nearest"} disabled={active || recording || disabled} onChange={(event) => update({ ...settings, follower: event.target.value as EnsembleTuning["follower"] })}>
      <option value="nearest">標準</option><option value="sequence">音の並びを追う（実験）</option>
      </select></label>
      <p className="concert-muted">速いパッセージや長い息継ぎの後を試す実験方式です。大きく戻るときは楽譜を押します。</p>
      <div className="concert-controls">
      {(Object.keys(tuningFields) as (keyof typeof tuningFields)[]).map((field) => <label key={field}>{tuningFields[field].label} {settings[field].toFixed(field === "inputDelayMs" ? 0 : 2)}
        <input aria-label={`共奏 ${tuningFields[field].label}`} type="range" {...tuningFields[field]} value={settings[field]} disabled={recording || disabled} onChange={(event) => update({ ...settings, [field]: Number(event.target.value) })} />
      </label>)}
      </div>
      <p className="concert-muted">設定は譜面・移調・席ごとにこのブラウザへ保存します。</p>
      <button disabled={recording || disabled} onClick={() => update({ ...defaultEnsembleTuning })}>初期値に戻す</button>
    </details>
    <div className="concert-controls">
      <button disabled={disabled || (active && !recording) || state.status === "finished"} onClick={record}>{recording ? "テイクを終了" : "テイクを記録して演奏"}</button>
    </div>
    <label>保存したテイクを開く<input aria-label="保存したテイクを開く" type="file" accept=".json" disabled={active || recording || importing || disabled} onChange={async event => {
      const input = event.currentTarget;
      const file = input.files?.[0];
      if (!file) return;
      const revision = ++importRevision.current;
      setImporting(true);
      try {
        if (file.size > takeFileLimit) throw new Error("テイクは16MB以下のファイルを選んでください。");
        const text = await file.text();
        if (revision !== importRevision.current) return;
        if (["playing", "waiting"].includes(engine.getState().status) || recorder.current) throw new Error("演奏を停止してからテイクを開いてください。");
        const take = readRehearsalTake(text, score, seatId);
        setTakes(items => [take, ...items.filter(item => item.id !== take.id)].slice(0, 8));
        setComparison(null);
        setMessage(take.scoreContext ? "テイクと感想を開きました。同じ入力でA/B比較できます。現在の演奏設定は保っています。" : "旧形式のテイクと感想を開きました。楽譜の演奏条件を確認できないため、比較・表現の作成には新しく記録してください。");
      } catch (error) {
        if (revision === importRevision.current) setMessage(error instanceof Error ? error.message : String(error));
      } finally {
        input.value = "";
        if (revision === importRevision.current) setImporting(false);
      }
    }} /></label>
    {message && <p role="status">{message}</p>}
    {takes.length > 0 && <p className="concert-muted">テイクと感想はこの画面を閉じると消えます。残したいテイクは「テイクの記録を保存」でファイルに保存してください。保存したファイルは、同じ譜面・移調・担当で「保存したテイクを開く」から戻せます。表示は最新8件までです。自動送信はしません。位置一致はシステムの判定で、演奏の正確さの採点ではありません。</p>}
    {takes.map((take, index) => {
      const summary = summarizeTake(take);
      return <div className="concert-panel" key={take.id}>
        <strong>テイク {takes.length - index}</strong> · {take.duration.toFixed(1)}秒 · 入力 {summary.notes}音 · 位置一致 {summary.matches}回
        <div className="concert-controls">
          <label>吹いてみた感想<select aria-label={`テイク ${takes.length - index} の感想`} value={take.feedback} onChange={(event) => setTakes((items) => items.map((item) => item.id === take.id ? { ...item, feedback: event.target.value } : item))}>
            <option value="">選択する</option><option>自然に合わせられた</option><option>伴奏が急いだ</option><option>伴奏が待ちすぎた</option><option>表情が強すぎた</option><option>入力を見失った</option>
          </select></label>
          <button disabled={active || disabled || !take.scoreContext || take.changedSetup || take.duration > 600} onClick={() => compare(take)}>同じ入力でA/B比較</button>
          <button disabled={active || disabled} onClick={() => update(take.tuning)}>このテイクの設定に戻す</button>
          <button disabled={active || disabled || !take.scoreContext} onClick={() => {
            try { const profile = profileFromTake(score, take); engine.setReference(profile); setReference(profile); setMessage("照合できた音からテンポ・強弱・切り方の曲線を作りました。次の共奏に反映します。"); }
            catch (error) { setMessage(String(error)); }
          }}>このテイクの表現で共奏する</button>
          <button onClick={() => {
            const url = URL.createObjectURL(new Blob([JSON.stringify(take, null, 2)], { type: "application/json" }));
            const link = document.createElement("a"); link.href = url; link.download = `convo-take-${take.id}.json`; link.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
          }}>テイクの記録を保存</button>
        </div>
        <details>
          <summary>次の練習のためにメモを残す（任意）</summary>
          <div className="concert-controls">
            <label>次の練習でも使いたいですか<select aria-label={`テイク ${takes.length - index} の再利用意向`} value={take.experience?.reuse ?? ""} onChange={(event) => setTakes(items => items.map(item => item.id === take.id ? { ...item, experience: { notes: item.experience?.notes ?? "", reuse: event.target.value as NonNullable<RehearsalTake["experience"]>["reuse"] } } : item))}>
              <option value="">未回答</option><option value="yes">使いたい</option><option value="unsure">まだ分からない</option><option value="no">今のままでは使わない</option>
            </select></label>
            <label>良かったところ・困ったところ<textarea aria-label={`テイク ${takes.length - index} の練習メモ`} rows={3} maxLength={2000} placeholder="例：8小節目の息継ぎで伴奏が先に進んだ。次は入りを待つ設定で試したい。" value={take.experience?.notes ?? ""} onChange={(event) => setTakes(items => items.map(item => item.id === take.id ? { ...item, experience: { reuse: item.experience?.reuse ?? "", notes: event.target.value } } : item))} /></label>
          </div>
        </details>
        {!take.scoreContext && <p>旧形式のテイクです。感想や入力は確認できますが、楽譜の演奏条件がないため比較・表現の作成はできません。</p>}
        {take.changedSetup && <p>演奏中に位置や設定が変わったため、このテイクはA/B比較できません。</p>}
      </div>;
    })}
    <details>
      <summary>参考演奏と表現プロファイル</summary>
      <p>あなたのテイクから作った表現を保存・読み込みできます。人物名だけから個性を生成する機能ではありません。</p>
      <label>表現プロファイルを読み込む<input aria-label="表現プロファイルを読み込む" type="file" accept=".json" disabled={active || disabled} onChange={async (event) => {
        const file = event.target.files?.[0]; if (!file) return;
        try { if (file.size > 4_000_000) throw new Error("4MB以下のプロファイルを選んでください。"); const profile = readReferenceProfile(await file.text()); engine.setReference(profile); setReference(profile); }
        catch (error) { setMessage(String(error)); }
        event.target.value = "";
      }} /></label>
      {reference && <div className="concert-controls"><span>{reference.title} · {reference.points.length}点 · 元テイク {reference.source.takeId.slice(0, 8)}</span>
        <button disabled={active} onClick={() => { engine.setReference(null); setReference(null); }}>参考表現を外す</button>
        <button onClick={() => { const url = URL.createObjectURL(new Blob([JSON.stringify(reference, null, 2)], { type: "application/json" })); const link = document.createElement("a"); link.href = url; link.download = "convo-expression.json"; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }}>表現プロファイルを保存</button>
      </div>}
      <h4>見つかった公式の参考演奏</h4>
      {artistReferences.map((item) => <p key={item.url}><a href={item.url} target="_blank" rel="noreferrer">{item.title} · {item.work}</a><br /><small>{item.status}</small></p>)}
    </details>
    {comparison && <table><caption>同一入力の応答比較（自然さの評価は演奏者が行います）</caption><thead><tr><th>設定</th><th>平均テンポ</th><th>到達位置</th><th>位置一致</th></tr></thead><tbody>{(["a", "b"] as const).map((variant) => <tr key={variant}><th>{variant.toUpperCase()}</th><td>{comparison[variant].averageTempo.toFixed(1)} BPM</td><td>{comparison[variant].lastBeat.toFixed(2)}拍</td><td>{comparison[variant].matches}回</td></tr>)}</tbody></table>}
  </section>;
}
