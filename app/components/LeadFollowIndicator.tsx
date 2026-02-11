/**
 * LeadFollowIndicator - Visual display of current Lead/Follow state
 */

import type { AccompanimentState } from "~/lib/types";
import { t } from "~/lib/i18n";
import type { Locale } from "~/lib/i18n";

interface LeadFollowIndicatorProps {
  state: AccompanimentState;
  locale?: Locale;
}

export function LeadFollowIndicator({
  state,
  locale = "ja",
}: LeadFollowIndicatorProps) {
  const { currentRole, leadFollowRatio, engineState, tempo, currentMeasure } =
    state;
  const isLead = currentRole.mode === "lead";

  const stateConfig: Record<string, { key: "stateIdle" | "stateWaiting" | "stateListening" | "statePlaying"; color: string }> = {
    idle: { key: "stateIdle", color: "#9e9e9e" },
    waiting: { key: "stateWaiting", color: "#ff9800" },
    listening: { key: "stateListening", color: "#2196f3" },
    playing: { key: "statePlaying", color: "#4caf50" },
  };

  const { key: stateKey, color: stateColor } =
    stateConfig[engineState] ?? stateConfig.idle;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 12,
        padding: 16,
        background: "#fafafa",
        borderRadius: 8,
        border: "1px solid #e0e0e0",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div
          style={{
            width: 12,
            height: 12,
            borderRadius: "50%",
            background: stateColor,
            animation:
              engineState === "waiting" || engineState === "listening"
                ? "pulse 1.5s ease-in-out infinite"
                : "none",
          }}
        />
        <span style={{ fontWeight: 600, color: stateColor }}>
          {t(locale, stateKey)}
        </span>
      </div>

      <div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginBottom: 4,
            fontSize: 13,
            fontWeight: 500,
          }}
        >
          <span style={{ color: isLead ? "#1565c0" : "#666" }}>
            {t(locale, "aiLead")}
          </span>
          <span style={{ color: !isLead ? "#c62828" : "#666" }}>
            {t(locale, "followUser")}
          </span>
        </div>
        <div
          style={{
            position: "relative",
            height: 8,
            background: "#e0e0e0",
            borderRadius: 4,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              height: "100%",
              width: `${leadFollowRatio * 100}%`,
              background: `linear-gradient(90deg, #1565c0, #42a5f5)`,
              borderRadius: 4,
              transition: "width 0.3s ease",
            }}
          />
        </div>
        <div
          style={{
            textAlign: "center",
            fontSize: 12,
            color: "#666",
            marginTop: 4,
          }}
        >
          {currentRole.mode}:{currentRole.strength} (
          {Math.round(leadFollowRatio * 100)}%)
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 8,
          fontSize: 13,
        }}
      >
        <div style={{ textAlign: "center" }}>
          <div style={{ color: "#666" }}>{t(locale, "tempo")}</div>
          <div style={{ fontWeight: 700, fontSize: 18 }}>
            {Math.round(tempo)}
          </div>
          <div style={{ color: "#999", fontSize: 11 }}>BPM</div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ color: "#666" }}>{t(locale, "measure")}</div>
          <div style={{ fontWeight: 700, fontSize: 18 }}>
            {currentMeasure}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}
