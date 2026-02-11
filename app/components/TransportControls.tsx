/**
 * TransportControls - Play/Stop/Rehearsal controls for the accompaniment
 */

import type { EngineState } from "~/lib/types";
import { t } from "~/lib/i18n";
import type { Locale } from "~/lib/i18n";

interface TransportControlsProps {
  engineState: EngineState;
  onStart: () => void;
  onStop: () => void;
  onToggleRehearsal: () => void;
  isRehearsalMode: boolean;
  hasScore: boolean;
  locale?: Locale;
}

export function TransportControls({
  engineState,
  onStart,
  onStop,
  onToggleRehearsal,
  isRehearsalMode,
  hasScore,
  locale = "ja",
}: TransportControlsProps) {
  const isPlaying =
    engineState === "playing" ||
    engineState === "waiting" ||
    engineState === "listening";

  const stateKey = {
    idle: "stateIdle",
    waiting: "stateWaiting",
    listening: "stateListening",
    playing: "statePlaying",
  } as const;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "12px 16px",
        background: "#fff",
        borderRadius: 8,
        border: "1px solid #e0e0e0",
      }}
    >
      <button
        onClick={isPlaying ? onStop : onStart}
        disabled={!hasScore}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 48,
          height: 48,
          borderRadius: "50%",
          border: hasScore ? "none" : "2px solid #ccc",
          background: !hasScore
            ? "#f5f5f5"
            : isPlaying
              ? "#f44336"
              : "#4caf50",
          color: !hasScore ? "#999" : "#fff",
          cursor: hasScore ? "pointer" : "not-allowed",
          fontSize: 20,
          transition: "all 0.2s ease",
        }}
      >
        {isPlaying ? "\u25A0" : "\u25B6"}
      </button>

      <button
        onClick={onToggleRehearsal}
        disabled={!hasScore}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "8px 16px",
          borderRadius: 20,
          border: !hasScore
            ? "1px solid #e0e0e0"
            : isRehearsalMode
              ? "2px solid #ff9800"
              : "1px solid #bdbdbd",
          background: !hasScore
            ? "#f5f5f5"
            : isRehearsalMode
              ? "#fff3e0"
              : "#fff",
          color: !hasScore ? "#bbb" : isRehearsalMode ? "#e65100" : "#555",
          cursor: hasScore ? "pointer" : "not-allowed",
          fontWeight: isRehearsalMode ? 600 : 400,
          fontSize: 14,
          transition: "all 0.2s ease",
        }}
      >
        <span>{isRehearsalMode ? t(locale, "rehearsalOn") : t(locale, "rehearsal")}</span>
      </button>

      <div style={{ marginLeft: "auto", fontSize: 13, color: "#666" }}>
        {t(locale, stateKey[engineState])}
      </div>
    </div>
  );
}
