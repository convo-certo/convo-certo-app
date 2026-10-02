import { useEffect, useId, useRef, useState } from "react";
import { parseRehearsalCommand, getCommandExamples } from "~/lib/rehearsal-nlp";
import { useLocale } from "~/lib/locale-context";
import type { RehearsalCommand } from "~/lib/types";
import type { Locale } from "~/lib/i18n";

type CommandFeedback =
  | { code: "applied"; command: string }
  | { code: "unrecognized" | "unsupported" | "recognition-failed" | "start-failed" };

export function VoiceCommandPanel({ isActive, onCommand, language }: { isActive: boolean; onCommand: (command: RehearsalCommand) => void; language: Locale }) {
  const { locale, text: localize } = useLocale();
  const privacyNoteId = useId();
  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);
  const [feedback, setFeedback] = useState<CommandFeedback | null>(null);
  const feedbackMessages = {
    unrecognized: localize("コマンドを読み取れませんでした。下の例を参考に入力してください。", "Could not understand the command. Try one of the examples below."),
    unsupported: localize("音声認識に対応していません。文字で指示できます。", "Speech recognition is unavailable. You can type a command."),
    "recognition-failed": localize("音声を認識できませんでした。文字でも指示できます。", "Could not recognise your voice. You can type a command."),
    "start-failed": localize("音声入力を開始できませんでした。", "Could not start voice input."),
  };
  const feedbackMessage = feedback && (feedback.code === "applied"
    ? localize(`指示: ${feedback.command}`, `Command: ${feedback.command}`)
    : feedbackMessages[feedback.code]);
  const commandExamples = getCommandExamples()[language];
  const recognition = useRef<SpeechRecognition | null>(null);
  const commandRef = useRef(onCommand);
  commandRef.current = onCommand;
  const apply = (value: string) => {
    const command = parseRehearsalCommand(value);
    if (!command) { setFeedback({ code: "unrecognized" }); return; }
    commandRef.current(command);
    setFeedback({ code: "applied", command: value });
    setText("");
  };
  useEffect(() => {
    if (!isActive) recognition.current?.abort();
    return () => { if (recognition.current) { recognition.current.onend = null; recognition.current.abort(); recognition.current = null; } };
  }, [isActive]);

  const toggleVoice = () => {
    if (recognition.current) { recognition.current.stop(); return; }
    const Constructor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Constructor) { setFeedback({ code: "unsupported" }); return; }
    const instance = new Constructor();
    instance.lang = language === "ja" ? "ja-JP" : "en-US";
    instance.continuous = false;
    instance.interimResults = false;
    instance.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) apply(event.results[i][0].transcript);
      }
    };
    instance.onerror = () => setFeedback({ code: "recognition-failed" });
    instance.onend = () => { recognition.current = null; setListening(false); };
    recognition.current = instance;
    try { instance.start(); setListening(true); }
    catch { recognition.current = null; setListening(false); setFeedback({ code: "start-failed" }); }
  };

  return <div style={{ padding: 16, border: "1px solid #dbe3dd", borderRadius: 8 }}>
    <h3 style={{ fontSize: 16 }}>{localize("リハーサルコマンド", language === "ja" ? "Rehearsal commands (Japanese)" : "Rehearsal commands (English)")}</h3>
    <p id={privacyNoteId} style={{ fontSize: 14 }}>
      {localize("声の指示は、ブラウザ提供元のサーバーで認識される場合があります。文字でも指示できます。", "Spoken commands may send audio to your browser provider for recognition. You can type instead.")}{" "}
      <a href={`/privacy.html#${locale}`} target="_blank" rel="noopener noreferrer">{localize("データの扱い", "Privacy")}</a>
    </p>
    <form onSubmit={(event) => { event.preventDefault(); apply(text); }} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <input aria-label={localize("リハーサルの指示", language === "ja" ? "Rehearsal instruction (Japanese)" : "Rehearsal instruction (English)")} lang={language} value={text} onChange={(event) => setText(event.target.value)} placeholder={commandExamples[0]} style={{ flex: 1, minWidth: 160, padding: 8, border: "1px solid #cbd7cf", borderRadius: 6 }} />
      <button type="submit">{localize("反映", "Apply")}</button>
      <button type="button" aria-describedby={privacyNoteId} onClick={toggleVoice}>{listening ? localize("音声入力を停止", "Stop voice input") : localize("声で指示する", language === "ja" ? "Speak in Japanese" : "Speak in English")}</button>
    </form>
    {feedbackMessage && <p role="status">{feedbackMessage}</p>}
    <p lang={language} style={{ fontSize: 12, color: "#708078", marginTop: 12 }}>{commandExamples.slice(0, 6).join(" / ")}</p>
  </div>;
}
