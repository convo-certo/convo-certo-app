import { useCallback, useRef } from "react";

interface ProgressBarProps {
  currentBeat: number;
  totalBeats: number;
  measureStartBeats: number[];
  isPlaying: boolean;
  countingIn: boolean;
  loopStartBeat?: number | null;
  loopEndBeat?: number | null;
  onSeek: (beat: number) => void;
}

export function ProgressBar({
  currentBeat,
  totalBeats,
  measureStartBeats,
  isPlaying,
  countingIn,
  loopStartBeat,
  loopEndBeat,
  onSeek,
}: ProgressBarProps) {
  const barRef = useRef<HTMLDivElement>(null);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const bar = barRef.current;
      if (!bar || totalBeats <= 0) return;
      const rect = bar.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      onSeek(ratio * totalBeats);
    },
    [totalBeats, onSeek]
  );

  const progress = totalBeats > 0 ? (currentBeat / totalBeats) * 100 : 0;

  return (
    <div
      ref={barRef}
      onClick={handleClick}
      role="slider"
      tabIndex={0}
      aria-label="再生位置"
      aria-valuemin={0}
      aria-valuemax={totalBeats}
      aria-valuenow={currentBeat}
      aria-valuetext={`${Math.round(progress)}%`}
      onKeyDown={(event) => {
        let beat: number;
        if (event.key === "ArrowRight") beat = currentBeat + 1;
        else if (event.key === "ArrowLeft") beat = currentBeat - 1;
        else if (event.key === "Home") beat = 0;
        else if (event.key === "End") beat = totalBeats;
        else return;
        event.preventDefault();
        onSeek(Math.max(0, Math.min(totalBeats, beat)));
      }}
      style={{
        position: "relative",
        height: 28,
        background: "#f0f0f0",
        borderRadius: 6,
        cursor: "pointer",
        overflow: "hidden",
        userSelect: "none",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          height: "100%",
          width: `${progress}%`,
          background: countingIn
            ? "linear-gradient(90deg, #ff9800, #ffb74d)"
            : isPlaying
              ? "linear-gradient(90deg, #1976d2, #42a5f5)"
              : "#90caf9",
          borderRadius: 6,
          transition: isPlaying ? "none" : "width 0.15s ease",
        }}
      />

      {loopStartBeat != null && loopEndBeat != null && totalBeats > 0 && (
        <div
          style={{
            position: "absolute",
            left: `${(loopStartBeat / totalBeats) * 100}%`,
            width: `${((loopEndBeat - loopStartBeat) / totalBeats) * 100}%`,
            top: 0,
            bottom: 0,
            background: "rgba(255, 152, 0, 0.15)",
            borderLeft: "2px solid #ff9800",
            borderRight: "2px solid #ff9800",
            pointerEvents: "none",
          }}
        />
      )}

      {measureStartBeats.map((beat, i) => {
        if (i === 0 || totalBeats <= 0) return null;
        const pos = (beat / totalBeats) * 100;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: `${pos}%`,
              top: 0,
              bottom: 0,
              width: 1,
              background: "rgba(0,0,0,0.08)",
            }}
          />
        );
      })}

      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 11,
          fontWeight: 600,
          color: progress > 50 ? "#fff" : "#666",
          pointerEvents: "none",
        }}
      >
        {countingIn
          ? "カウントイン中…"
          : `${Math.round(progress)}%`}
      </div>
    </div>
  );
}
