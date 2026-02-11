/**
 * ScoreDisplay - Renders MusicXML using OpenSheetMusicDisplay (OSMD)
 * with note-level cursor tracking synchronised to the playback engine's
 * current beat position.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { MeasureAnnotation } from "~/lib/types";
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
}

interface FractionLike {
  RealValue: number;
}

interface IteratorLike {
  currentTimeStamp: FractionLike;
  CurrentMeasureIndex: number;
  EndReached: boolean;
}

interface BoundingBoxLike {
  absolutePosition: { x: number; y: number };
  size: { width: number; height: number };
}

interface StaffEntryLike {
  stave?: { x: number; width: number };
  boundingBox?: BoundingBoxLike;
}

interface OSMDInstance {
  load(xml: string): Promise<void>;
  render(): void;
  rules: { RenderRehearsalMarks: boolean };
  cursor: {
    show(): void;
    hide(): void;
    reset(): void;
    next(): void;
    update(): void;
    iterator: IteratorLike;
    cursorElement: HTMLElement;
    Hidden: boolean;
  };
  graphic: {
    measureList: Array<Array<StaffEntryLike | undefined>>;
  };
  sheet: {
    sourceMeasures: unknown[];
  };
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
}: ScoreDisplayProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const osmdRef = useRef<OSMDInstance | null>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const [loaded, setLoaded] = useState(false);
  const animFrameRef = useRef(0);
  const lastCursorBeatRef = useRef(-1);

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
        followCursor: false,
        cursorsOptions: [
          {
            type: 0,
            color: "#1976d2",
            alpha: 0.5,
            follow: false,
          },
        ],
      }) as unknown as OSMDInstance;

      osmd.rules.RenderRehearsalMarks = false;
      await osmd.load(musicXML);
      osmd.render();

      if (osmd.cursor) {
        osmd.cursor.show();
        osmd.cursor.reset();
      }

      osmdRef.current = osmd;
      lastCursorBeatRef.current = -1;
      setLoaded(true);
    } catch (err) {
      console.error("[ScoreDisplay] OSMD error:", err);
    }
  }, [musicXML]);

  useEffect(() => {
    setLoaded(false);
    initOSMD();
  }, [initOSMD]);

  // Advance OSMD cursor to match currentBeat — note-level tracking
  useEffect(() => {
    const osmd = osmdRef.current;
    if (!osmd?.cursor || !loaded) return;

    const isActive = engineState === "playing" || engineState === "listening";

    if (!isActive) {
      if (engineState === "idle") {
        osmd.cursor.reset();
        lastCursorBeatRef.current = -1;
      }
      return;
    }

    const targetBeat = currentBeat;
    const cursorBeat = osmd.cursor.iterator.currentTimeStamp.RealValue;

    if (targetBeat < cursorBeat) {
      osmd.cursor.reset();
      lastCursorBeatRef.current = -1;
    }

    const maxSteps = 500;
    let step = 0;
    while (
      !osmd.cursor.iterator.EndReached &&
      osmd.cursor.iterator.currentTimeStamp.RealValue < targetBeat &&
      step < maxSteps
    ) {
      osmd.cursor.next();
      step++;
    }

    lastCursorBeatRef.current = osmd.cursor.iterator.currentTimeStamp.RealValue;
  }, [currentBeat, loaded, engineState]);

  // Auto-scroll to keep OSMD cursor visible
  useEffect(() => {
    const container = scrollContainerRef.current;
    const osmd = osmdRef.current;
    if (!container || !osmd?.cursor?.cursorElement || !loaded) return;

    if (engineState !== "playing" && engineState !== "listening") return;

    const rafId = requestAnimationFrame(() => {
      const cursor = osmd.cursor.cursorElement;
      const cursorRect = cursor.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();

      const cursorRelativeTop = cursorRect.top - containerRect.top;
      const visibleHeight = containerRect.height;

      if (cursorRelativeTop < 40 || cursorRelativeTop > visibleHeight - 80) {
        const targetScroll =
          container.scrollTop + cursorRelativeTop - visibleHeight / 3;
        container.scrollTo({ top: targetScroll, behavior: "smooth" });
      }
    });

    return () => cancelAnimationFrame(rafId);
  }, [currentBeat, loaded, engineState]);

  // Draw overlay: dim past measures, highlight current, beat progress line
  useEffect(() => {
    if (!loaded) return;

    const draw = () => {
      const canvas = overlayRef.current;
      const container = containerRef.current;
      const osmd = osmdRef.current;
      if (!canvas || !container || !osmd) return;

      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const targetW = Math.round(rect.width * dpr);
      const targetH = Math.round(rect.height * dpr);
      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
        canvas.style.width = `${rect.width}px`;
        canvas.style.height = `${rect.height}px`;
      }

      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, rect.width, rect.height);

      const isActive = engineState === "playing" || engineState === "listening";
      if (!isActive) return;

      const svgEl = container.querySelector("svg");
      const scrollContainer = scrollContainerRef.current;
      if (!svgEl || !scrollContainer) return;

      const scrollRect = scrollContainer.getBoundingClientRect();
      const svgRect = svgEl.getBoundingClientRect();
      const offsetX = svgRect.left - scrollRect.left + scrollContainer.scrollLeft;
      const offsetY = svgRect.top - scrollRect.top + scrollContainer.scrollTop;

      const measureList = osmd.graphic?.measureList;
      if (!measureList) return;

      const unitSize = 10;

      for (let mIdx = 0; mIdx < measureList.length; mIdx++) {
        const staffEntries = measureList[mIdx];
        if (!staffEntries) continue;

        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        let found = false;

        for (const entry of staffEntries) {
          if (!entry?.boundingBox) continue;
          const bb = entry.boundingBox;
          const ex = bb.absolutePosition.x * unitSize;
          const ey = bb.absolutePosition.y * unitSize;
          const ew = bb.size.width * unitSize;
          const eh = bb.size.height * unitSize;
          minX = Math.min(minX, ex);
          minY = Math.min(minY, ey);
          maxX = Math.max(maxX, ex + ew);
          maxY = Math.max(maxY, ey + eh);
          found = true;
        }

        if (!found) continue;

        const x = minX + offsetX;
        const y = minY + offsetY;
        const w = maxX - minX;
        const h = maxY - minY;

        const measureNum = measureNumbers[mIdx] ?? mIdx + 1;

        if (measureNum < currentMeasure) {
          ctx.fillStyle = "rgba(200, 200, 200, 0.3)";
          ctx.fillRect(x, y, w, h);
        } else if (measureNum === currentMeasure) {
          ctx.fillStyle = "rgba(33, 150, 243, 0.08)";
          ctx.fillRect(x, y, w, h);

          ctx.strokeStyle = "rgba(33, 150, 243, 0.4)";
          ctx.lineWidth = 2;
          ctx.strokeRect(x, y, w, h);

          const beatInMeasure = currentBeat % beatsPerMeasure;
          const progress = beatInMeasure / beatsPerMeasure;
          const lineX = x + w * progress;

          ctx.strokeStyle = "#1976d2";
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(lineX, y);
          ctx.lineTo(lineX, y + h);
          ctx.stroke();

          ctx.fillStyle = "#1976d2";
          ctx.beginPath();
          ctx.arc(lineX, y, 4, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.arc(lineX, y + h, 4, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    };

    draw();
    animFrameRef.current = requestAnimationFrame(function loop() {
      draw();
      animFrameRef.current = requestAnimationFrame(loop);
    });

    return () => {
      cancelAnimationFrame(animFrameRef.current);
    };
  }, [loaded, currentMeasure, currentBeat, beatsPerMeasure, engineState, measureNumbers]);

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
        ref={scrollContainerRef}
        style={{
          position: "relative",
          maxHeight: "55vh",
          overflow: "auto",
          background: "#fff",
          borderRadius: isActive ? "0 0 8px 8px" : 8,
          scrollBehavior: "smooth",
        }}
      >
        <div ref={containerRef} style={{ width: "100%", minHeight: 200, padding: 16 }} />
        <canvas
          ref={overlayRef}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            pointerEvents: "none",
            zIndex: 10,
          }}
        />
      </div>

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
