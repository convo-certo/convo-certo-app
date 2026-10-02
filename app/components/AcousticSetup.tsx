import { useEffect, useRef, useState } from "react";
import { instrumentTranspositions } from "~/lib/instrument-transposition";
import { midiToNoteName } from "~/lib/midi-manager";
import { MICROPHONE_MIN_FREQUENCY, MICROPHONE_MAX_FREQUENCY, type PitchReading } from "~/lib/microphone-input";
import { useLocale } from "~/lib/locale-context";

export function AcousticSetup({ instrumentKey, onInstrument, disabled, micStatus, onMic, reading, level, inputLabel, expectedPitch, active, device, devices, deviceNotice, onDevice, onRefresh, tuning = 440 }: {
  instrumentKey: number; onInstrument: (key: number) => void; disabled: boolean;
  micStatus: "off" | "starting" | "on"; onMic: () => void;
  reading: PitchReading | null; level: number; inputLabel: string; expectedPitch?: number; active: boolean;
  device: string; devices: { id: string; label: string }[]; deviceNotice: string;
  onDevice: (id: string) => void; onRefresh: () => void; tuning?: number;
}) {
  const { text } = useLocale();
  const [confirmed, setConfirmed] = useState(false);
  const matchedSince = useRef<number | null>(null);
  const frequency = expectedPitch == null ? null : tuning * 2 ** ((expectedPitch - 69) / 12);
  const supported = frequency != null && frequency >= MICROPHONE_MIN_FREQUENCY && frequency <= MICROPHONE_MAX_FREQUENCY && Number.isInteger(expectedPitch);
  useEffect(() => { setConfirmed(false); matchedSince.current = null; }, [expectedPitch, instrumentKey, micStatus, device, tuning]);
  useEffect(() => {
    if (micStatus !== "on" || active || !supported || !reading || reading.confidence < 0.85 || reading.midi !== expectedPitch) {
      matchedSince.current = null;
      return;
    }
    const now = performance.now();
    matchedSince.current ??= now;
    if (now - matchedSince.current >= 250) setConfirmed(true);
  }, [reading, micStatus, active, expectedPitch, supported]);
  const target = expectedPitch == null ? null : midiToNoteName(expectedPitch - instrumentKey);
  return <section className="acoustic-setup" aria-label={text("生楽器の準備", "Set up your instrument")}>
    <label className="acoustic-instrument">{text("手元の楽器", "Your instrument")}<select aria-label={text("演奏する楽器", "Your instrument")} value={instrumentKey} disabled={disabled || active} onChange={event => onInstrument(Number(event.target.value))}>
      {instrumentTranspositions.map(item => <option key={item.semitones} value={item.semitones}>{text(item.label, item.labelEn)}</option>)}
      {!instrumentTranspositions.some(item => item.semitones === instrumentKey) && <option value={instrumentKey}>{text(`譜面指定（${instrumentKey}半音）`, `As written (${instrumentKey} semitones)`)}</option>}
    </select></label>
    <p>{text("譜面の音をそのまま演奏できるよう、伴奏の高さを合わせます。", "The accompaniment shifts to match your instrument and the written notes.")}</p>
    <div className="acoustic-connect"><button className={micStatus === "off" ? "concert-primary" : ""} disabled={disabled} aria-pressed={micStatus === "on"} onClick={onMic}>{micStatus === "on" ? text("マイクを停止", "Turn mic off") : micStatus === "starting" ? text("マイク準備をキャンセル", "Cancel mic setup") : text("マイクで演奏する", "Use microphone")}</button><span>{text("伴奏を拾わないよう、ヘッドホンを使ってください。", "Use headphones so the mic hears you, not the accompaniment.")}</span></div>
    <p className="acoustic-scope">{text("管・弦・鍵盤の単音に対応。和音・無音程打楽器のマイク追従は未対応です。", "Follows single notes from wind, string and keyboard instruments. Mic following does not support chords or unpitched percussion.")}</p>
    {micStatus === "starting" && <p role="status">{text("表示された確認で、マイクの使用を許可してください。", "Allow microphone access when prompted.")}</p>}
    {micStatus === "on" && <section className="acoustic-check" aria-label={text("一音チェック", "Check one note")} data-confirmed={confirmed}>
      <div className="acoustic-check-title"><strong role="status" aria-atomic="true">{active ? text("演奏の音を確認中", "Listening to your playing") : confirmed ? text("最初の音を確認できました", "First note confirmed") : text("一音鳴らしてみましょう", "Play one note")}</strong><span>{active ? "" : target ? text(`譜面の最初の音：${target}`, `First written note: ${target}`) : text("このパートには音符がありません", "This part has no notes")}</span></div>
      <meter aria-label={text("届いている音の大きさ", "Microphone input level")} min={0} max={1} value={Math.min(1, level * 5)} />
      <p aria-live="off">{!supported && !active ? target ? text("この音はマイク追従の対応範囲外です。一定テンポで練習できます。", "This note is outside the mic range. You can practise at a fixed tempo.") : text("音符のあるパートを選んでください。", "Choose a part with notes.") : reading ? text(`届いている音：${midiToNoteName(reading.midi - instrumentKey)}`, `Hearing: ${midiToNoteName(reading.midi - instrumentKey)}`) + (!active && target && reading.midi !== expectedPitch ? text(` · ${target}を鳴らしてみましょう`, ` · Try ${target}`) : "") : level >= 0.008 ? text("音は届いています。一音を少し長めに鳴らしてください。", "Sound is reaching the mic. Hold one note a little longer.") : confirmed ? text("準備できました。「このパートで練習」へ進めます。", "Ready. Choose “Practise this part” to continue.") : text("音を待っています。一音鳴らしてください。", "Waiting for sound. Play one note.")}</p>
      <small>{text("使用中：", "Microphone: ")}{inputLabel}</small>
    </section>}
    <details><summary>{text("別のマイクを選ぶ", "Choose another microphone")}</summary><label>{text("使用するマイク", "Microphone")}<select aria-label={text("準備で使用するマイク", "Setup microphone")} value={device} disabled={micStatus !== "off"} onChange={event => onDevice(event.target.value)}><option value="">{text("システム既定のマイク", "System default")}</option>{devices.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}{device && !devices.some(item => item.id === device) && <option value={device}>{text("選択中のマイク（一覧にありません）", "Selected microphone (unavailable)")}</option>}</select></label><button onClick={onRefresh}>{text("マイク一覧を更新", "Refresh microphones")}</button>{micStatus !== "off" && <p>{text("変更するには、先にマイクを停止してください。", "Turn the mic off before changing it.")}</p>}{deviceNotice && <p>{deviceNotice}</p>}</details>
  </section>;
}
