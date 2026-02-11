/**
 * VoiceCommandPanel - Speech recognition UI for rehearsal mode
 * Uses the Web Speech API for voice input.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  parseRehearsalCommand,
  getCommandExamples,
} from "~/lib/rehearsal-nlp";
import type { RehearsalCommand } from "~/lib/types";
import { t } from "~/lib/i18n";
import type { Locale } from "~/lib/i18n";

interface VoiceCommandPanelProps {
  isActive: boolean;
  onCommand: (command: RehearsalCommand) => void;
  language: Locale;
}

export function VoiceCommandPanel({
  isActive,
  onCommand,
  language,
}: VoiceCommandPanelProps) {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [lastCommand, setLastCommand] = useState<RehearsalCommand | null>(
    null
  );
  const [commandHistory, setCommandHistory] = useState<RehearsalCommand[]>([]);
  const [textInput, setTextInput] = useState("");
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  const startListening = useCallback(() => {
    const SpeechRecognition =
      window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn("[VoiceCommandPanel] SpeechRecognition not supported");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = language === "ja" ? "ja-JP" : "en-US";

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let finalTranscript = "";
      let interimTranscript = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalTranscript += result[0].transcript;
        } else {
          interimTranscript += result[0].transcript;
        }
      }

      setTranscript(interimTranscript || finalTranscript);

      if (finalTranscript) {
        const command = parseRehearsalCommand(finalTranscript);
        if (command) {
          setLastCommand(command);
          setCommandHistory((prev) => [...prev.slice(-9), command]);
          onCommand(command);
        }
      }
    };

    recognition.onerror = (event) => {
      console.warn("[VoiceCommandPanel] Recognition error:", event.error);
      if (event.error !== "no-speech") {
        setIsListening(false);
      }
    };

    recognition.onend = () => {
      if (isActive && isListening) {
        // Restart if still active
        recognition.start();
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  }, [language, isActive, isListening, onCommand]);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setIsListening(false);
    setTranscript("");
  }, []);

  useEffect(() => {
    if (isActive && !isListening) {
      startListening();
    } else if (!isActive && isListening) {
      stopListening();
    }
    return () => {
      recognitionRef.current?.stop();
    };
  }, [isActive]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleTextSubmit = () => {
    if (!textInput.trim()) return;
    const command = parseRehearsalCommand(textInput.trim());
    if (command) {
      setLastCommand(command);
      setCommandHistory((prev) => [...prev.slice(-9), command]);
      onCommand(command);
    }
    setTextInput("");
  };

  const examples = getCommandExamples();

  return (
    <div
      style={{
        padding: 16,
        background: "#fff",
        borderRadius: 8,
        border: "1px solid #e0e0e0",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 12,
        }}
      >
        <h3 style={{ margin: 0, fontSize: 16 }}>{t(language, "rehearsalCommands")}</h3>
        {isActive && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 12,
              color: isListening ? "#4caf50" : "#999",
            }}
          >
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: isListening ? "#4caf50" : "#ccc",
                animation: isListening
                  ? "pulse 1.5s ease-in-out infinite"
                  : "none",
              }}
            />
            {isListening ? t(language, "listening") : t(language, "inactive")}
          </div>
        )}
      </div>

      {/* Live transcript */}
      {transcript && (
        <div
          style={{
            padding: 8,
            background: "#e8f5e9",
            borderRadius: 4,
            marginBottom: 8,
            fontSize: 14,
            fontStyle: "italic",
          }}
        >
          {transcript}
        </div>
      )}

      {/* Text input fallback */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <input
          type="text"
          value={textInput}
          onChange={(e) => setTextInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleTextSubmit()}
          placeholder={t(language, "commandInputPlaceholder")}
          style={{
            flex: 1,
            padding: "8px 12px",
            borderRadius: 4,
            border: "1px solid #ccc",
            fontSize: 14,
          }}
        />
        <button
          onClick={handleTextSubmit}
          style={{
            padding: "8px 16px",
            borderRadius: 4,
            border: "none",
            background: "#1976d2",
            color: "#fff",
            cursor: "pointer",
            fontSize: 14,
          }}
        >
          {t(language, "send")}
        </button>
      </div>

      {/* Last command */}
      {lastCommand && (
        <div
          style={{
            padding: 8,
            background: "#e3f2fd",
            borderRadius: 4,
            marginBottom: 8,
            fontSize: 13,
          }}
        >
          <strong>{t(language, "lastCommand")}:</strong> {lastCommand.rawText} →{" "}
          <code>{lastCommand.type}</code>
          {lastCommand.measureNumber && ` (m.${lastCommand.measureNumber})`}
        </div>
      )}

      {/* Command history */}
      {commandHistory.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div
            style={{
              fontSize: 12,
              color: "#666",
              marginBottom: 4,
            }}
          >
            {t(language, "history")}
          </div>
          <div
            style={{
              maxHeight: 120,
              overflowY: "auto",
              fontSize: 12,
            }}
          >
            {commandHistory.map((cmd, i) => (
              <div
                key={i}
                style={{
                  padding: "2px 0",
                  color: "#555",
                  borderBottom: "1px solid #f0f0f0",
                }}
              >
                {cmd.rawText}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Examples */}
      <details style={{ fontSize: 12, color: "#888" }}>
        <summary style={{ cursor: "pointer" }}>{t(language, "commandExamples")}</summary>
        <div style={{ padding: "8px 0" }}>
          {(language === "ja" ? examples.ja : examples.en).map(
            (ex, i) => (
              <div key={i} style={{ padding: "2px 0" }}>
                &bull; {ex}
              </div>
            )
          )}
        </div>
      </details>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}
