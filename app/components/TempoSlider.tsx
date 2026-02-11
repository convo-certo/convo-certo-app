import { t } from "~/lib/i18n";
import type { Locale } from "~/lib/i18n";

interface TempoSliderProps {
  tempo: number;
  baseTempo: number;
  onTempoChange: (tempo: number) => void;
  locale?: Locale;
}

export function TempoSlider({
  tempo,
  baseTempo,
  onTempoChange,
  locale = "ja",
}: TempoSliderProps) {
  const minTempo = Math.max(10, Math.round(baseTempo * 0.25));
  const maxTempo = Math.round(baseTempo * 4.0);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "8px 0",
      }}
    >
      <span style={{ fontSize: 13, fontWeight: 500, color: "#555", whiteSpace: "nowrap" }}>
        {t(locale, "manualTempo")}:
      </span>
      <input
        type="range"
        min={minTempo}
        max={maxTempo}
        value={Math.round(tempo)}
        onChange={(e) => onTempoChange(parseInt(e.target.value))}
        style={{ flex: 1, cursor: "pointer" }}
      />
      <span
        style={{
          fontSize: 14,
          fontWeight: 700,
          color: "#1a237e",
          minWidth: 72,
          textAlign: "right",
        }}
      >
        {Math.round(tempo)} BPM
      </span>
    </div>
  );
}
