import { useEffect, useRef, useState } from "react";
import { parseRehearsalCommand, getCommandExamples } from "~/lib/rehearsal-nlp";
import type { RehearsalCommand } from "~/lib/types";
import type { Locale } from "~/lib/i18n";

export function VoiceCommandPanel({ isActive, onCommand, language }: { isActive: boolean; onCommand: (command: RehearsalCommand) => void; language: Locale }) {
  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);
  const [feedback, setFeedback] = useState("");
  const recognition = useRef<SpeechRecognition | null>(null);
  const commandRef = useRef(onCommand);
  commandRef.current = onCommand;
  const apply = (value: string) => {
    const command = parseRehearsalCommand(value);
    if (!command) { setFeedback("コマンドを読み取れませんでした。下の例を参考に入力してください。"); return; }
    commandRef.current(command);
    setFeedback(`指示: ${value}`);
    setText("");
  };
  useEffect(() => {
    if (!isActive) recognition.current?.abort();
    return () => { if (recognition.current) { recognition.current.onend = null; recognition.current.abort(); recognition.current = null; } };
  }, [isActive]);

  const toggleVoice = () => {
    if (recognition.current) { recognition.current.stop(); return; }
    const Constructor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Constructor) { setFeedback("音声認識に対応していません。文字で指示できます。"); return; }
    const instance = new Constructor();
    instance.lang = language === "ja" ? "ja-JP" : "en-US";
    instance.continuous = false;
    instance.interimResults = false;
    instance.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) apply(event.results[i][0].transcript);
      }
    };
    instance.onerror = () => setFeedback("音声を認識できませんでした。文字でも指示できます。");
    instance.onend = () => { recognition.current = null; setListening(false); };
    recognition.current = instance;
    try { instance.start(); setListening(true); }
    catch { recognition.current = null; setListening(false); setFeedback("音声入力を開始できませんでした。"); }
  };

  return <div style={{ padding: 16, border: "1px solid #dbe3dd", borderRadius: 8 }}>
    <h3 style={{ fontSize: 16 }}>リハーサルコマンド</h3>
    <form onSubmit={(event) => { event.preventDefault(); apply(text); }} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <input aria-label="リハーサルの指示" value={text} onChange={(event) => setText(event.target.value)} placeholder="9〜12小節は歌うように" style={{ flex: 1, minWidth: 160, padding: 8, border: "1px solid #cbd7cf", borderRadius: 6 }} />
      <button type="submit">反映</button>
      <button type="button" onClick={toggleVoice}>{listening ? "音声入力を停止" : "声で指示する"}</button>
    </form>
    {feedback && <p role="status">{feedback}</p>}
    <p style={{ fontSize: 12, color: "#708078", marginTop: 12 }}>{getCommandExamples()[language].slice(0, 6).join(" / ")}</p>
  </div>;
}
