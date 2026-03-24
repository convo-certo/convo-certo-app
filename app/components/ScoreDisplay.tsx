/**
 * ScoreDisplay - Renders MusicXML using OpenSheetMusicDisplay (OSMD)
 * with dual-cursor tracking: a note-level cursor (Standard) and a
 * measure-level highlight (CurrentArea), both synchronised to the
 * playback engine's current beat position.
 *
 * Uses OSMD's built-in followCursor for automatic scrolling.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { MeasureAnnotation, TempoEvent } from "~/lib/types";
import type { Locale } from "~/lib/i18n";

interface ScoreDisplayProps {
  musicXML: string | null;
  currentMeasure: number;
  currentBeat: number;
  beatsPerMeasure: number;
  totalMeasures: number;
  engineState: "idle" | "waiting" | "listening" | "playing";
  measures: MeasureAnnotation[];
  measureNumbers: number[];
  locale?: Locale;
  onTempoMapReady?: (events: TempoEvent[]) => void;
}

interface FractionLike {
  RealValue: number;
}

interface IteratorLike {
  currentTimeStamp: FractionLike;
  CurrentMeasureIndex: number;
  EndReached: boolean;
}

interface CursorLike {
  show(): void;
  hide(): void;
  reset(): void;
  next(): void;
  previous(): void;
  update(): void;
  iterator: IteratorLike;
  cursorElement: HTMLElement;
  Hidden: boolean;
}

interface OSMDInstance {
  load(xml: string): Promise<void>;
  render(): void;
  rules: { RenderRehearsalMarks: boolean };
  cursors: CursorLike[];
  cursor: CursorLike;
  FollowCursor: boolean;
  graphic: {
    measureList: Array<unknown>;
  };
  sheet: {
    sourceMeasures: unknown[];
    TimestampSortedTempoExpressionsList?: Array<{
      AbsoluteTimestamp: { RealValue: number };
      InstantaneousTempo?: {
        TempoInBpm: number;
      };
      ContinuousTempo?: {
        AbsoluteStartTimestamp: { RealValue: number };
        AbsoluteEndTimestamp: { RealValue: number };
        StartTempo: number;
        EndTempo: number;
      };
    }>;
  };
}

const CURSOR_NOTE = 0;
const CURSOR_MEASURE = 1;

function realValueToBeats(rv: number): number {
  return rv * 4;
}

function beatsToRealValue(beats: number): number {
  return beats / 4;
}

export function ScoreDisplay({
  musicXML,
  currentMeasure,
  currentBeat,
  beatsPerMeasure,
  totalMeasures,
  engineState,
  measures,
  measureNumbers,
  onTempoMapReady,
}: ScoreDisplayProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const osmdRef = useRef<OSMDInstance | null>(null);
  const [loaded, setLoaded] = useState(false);
  const lastCursorBeatRef = useRef(-1);
  const rafRef = useRef(0);

  const initOSMD = useCallback(async () => {
    if (!containerRef.current || !musicXML) return;

    try {
      const { OpenSheetMusicDisplay } = await import(
        "opensheetmusicdisplay"
      );

      const osmd = new OpenSheetMusicDisplay(containerRef.current, {
        autoResize: true,
        backend: "svg",
        drawTitle: true,
        drawSubtitle: false,
        drawComposer: true,
        drawCredits: false,
        drawPartNames: true,
        drawMeasureNumbers: true,
        coloringMode: 0,
        followCursor: true,
        cursorsOptions: [
          {
            type: 0, // Standard — thin line at note position
            color: "#1976d2",
            alpha: 0.7,
            follow: true,
          },
          {
            type: 3, // CurrentArea — highlights entire measure
            color: "#1976d2",
            alpha: 0.12,
            follow: false,
          },
        ],
      }) as unknown as OSMDInstance;

      osmd.rules.RenderRehearsalMarks = false;
      await osmd.load(musicXML);
      osmd.render();

      const noteCursor = osmd.cursors[CURSOR_NOTE];
      const measureCursor = osmd.cursors[CURSOR_MEASURE];

      if (noteCursor) {
        noteCursor.show();
        noteCursor.reset();
      }
      if (measureCursor) {
        measureCursor.show();
        measureCursor.reset();
      }

      osmdRef.current = osmd;
      lastCursorBeatRef.current = -1;

      if (onTempoMapReady && osmd.sheet?.TimestampSortedTempoExpressionsList) {
        const tempoEvents: TempoEvent[] = [];
        for (const mte of osmd.sheet.TimestampSortedTempoExpressionsList) {
          const beatPos = realValueToBeats(mte.AbsoluteTimestamp.RealValue);

          if (mte.ContinuousTempo) {
            const ct = mte.ContinuousTempo;
            tempoEvents.push({
              beatPosition: realValueToBeats(ct.AbsoluteStartTimestamp.RealValue),
              bpm: ct.StartTempo,
              type: "continuous",
              endBeatPosition: realValueToBeats(ct.AbsoluteEndTimestamp.RealValue),
              endBpm: ct.EndTempo,
            });
          } else if (mte.InstantaneousTempo) {
            tempoEvents.push({
              beatPosition: beatPos,
              bpm: mte.InstantaneousTempo.TempoInBpm,
              type: "instant",
            });
          }
        }
        onTempoMapReady(tempoEvents);
      }

      setLoaded(true);
    } catch (err) {
      console.error("[ScoreDisplay] OSMD error:", err);
    }
  }, [musicXML, onTempoMapReady]);

  useEffect(() => {
    setLoaded(false);
    initOSMD();
  }, [initOSMD]);

  // Advance both OSMD cursors to match currentBeat
  useEffect(() => {
    const osmd = osmdRef.current;
    if (!osmd || !loaded) return;

    const noteCursor = osmd.cursors[CURSOR_NOTE];
    const measureCursor = osmd.cursors[CURSOR_MEASURE];
    if (!noteCursor || !measureCursor) return;

    const isActive = engineState === "playing" || engineState === "listening";

    if (!isActive) {
      if (engineState === "idle") {
        noteCursor.reset();
        measureCursor.reset();
        lastCursorBeatRef.current = -1;
      }
      return;
    }

    const targetBeat = currentBeat;
    const cursorBeat = realValueToBeats(
      noteCursor.iterator.currentTimeStamp.RealValue
    );

    if (targetBeat < cursorBeat) {
      noteCursor.reset();
      measureCursor.reset();
      lastCursorBeatRef.current = -1;
    }

    const maxSteps = 500;
    let step = 0;
    while (
      !noteCursor.iterator.EndReached &&
      realValueToBeats(noteCursor.iterator.currentTimeStamp.RealValue) < targetBeat &&
      step < maxSteps
    ) {
      noteCursor.next();
      step++;
    }

    step = 0;
    while (
      !measureCursor.iterator.EndReached &&
      realValueToBeats(measureCursor.iterator.currentTimeStamp.RealValue) < targetBeat &&
      step < maxSteps
    ) {
      measureCursor.next();
      step++;
    }

    lastCursorBeatRef.current = realValueToBeats(
      noteCursor.iterator.currentTimeStamp.RealValue
    );
  }, [currentBeat, loaded, engineState]);

  // Clean up rAF on unmount
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const beatInMeasure = Math.floor(currentBeat % beatsPerMeasure) + 1;
  const isActive = engineState === "playing" || engineState === "listening";

  return (
    <div style={{ position: "relative" }}>
      {isActive && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 16,
            padding: "8px 16px",
            background: "#e3f2fd",
            borderRadius: "8px 8px 0 0",
            color: "#1565c0",
            fontSize: 14,
            fontWeight: 600,
            borderBottom: "2px solid #1976d2",
          }}
        >
          <span>
            {currentMeasure} / {totalMeasures}
          </span>
          <div style={{ display: "flex", gap: 4 }}>
            {Array.from({ length: beatsPerMeasure }, (_, i) => (
              <div
                key={i}
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: "50%",
                  background:
                    i + 1 === beatInMeasure ? "#1976d2" : "#90caf9",
                  transition: "background 0.05s",
                }}
              />
            ))}
          </div>
          <span style={{ fontSize: 12, color: "#1976d2" }}>
            {Math.round(currentBeat * 10) / 10} beat
          </span>
        </div>
      )}

      <div
        ref={containerRef}
        style={{
          maxHeight: "60vh",
          overflow: "auto",
          background: "#fff",
          borderRadius: isActive ? "0 0 8px 8px" : 8,
          padding: 16,
          scrollBehavior: "smooth",
        }}
      />

      {measures.length > 0 && (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 4,
            padding: "8px 0",
            fontSize: 12,
          }}
        >
          {measures.map((m) => (
            <span
              key={m.measureNumber}
              style={{
                padding: "2px 8px",
                borderRadius: 4,
                background:
                  m.measureNumber === currentMeasure
                    ? "#fff9c4"
                    : m.role?.mode === "lead"
                      ? "#e3f2fd"
                      : "#fce4ec",
                color:
                  m.measureNumber === currentMeasure
                    ? "#f57f17"
                    : m.role?.mode === "lead"
                      ? "#1565c0"
                      : "#c62828",
                border: `1px solid ${
                  m.measureNumber === currentMeasure
                    ? "#ffb300"
                    : m.role?.mode === "lead"
                      ? "#90caf9"
                      : "#ef9a9a"
                }`,
                fontWeight: m.measureNumber === currentMeasure ? 700 : 400,
                transition: "all 0.2s ease",
              }}
            >
              m.{m.measureNumber}:{" "}
              {m.role
                ? `${m.role.mode}:${m.role.strength}`
                : m.wait
                  ? `${m.wait.type}${m.wait.duration ? `:${m.wait.duration}s` : ""}`
                  : ""}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
