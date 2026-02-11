/**
 * PoseDetectorView - Camera feed with MediaPipe pose overlay
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { PoseAnalyzer } from "~/lib/pose-analyzer";
import type { MotionCue } from "~/lib/types";
import { eventBus } from "~/lib/event-bus";
import { t } from "~/lib/i18n";
import type { Locale } from "~/lib/i18n";

interface PoseDetectorViewProps {
  isActive: boolean;
  locale?: Locale;
}

export function PoseDetectorView({ isActive, locale = "ja" }: PoseDetectorViewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const analyzerRef = useRef<PoseAnalyzer | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [lastCue, setLastCue] = useState<MotionCue | null>(null);
  const [error, setError] = useState<string | null>(null);

  const initAnalyzer = useCallback(async () => {
    if (!videoRef.current) return;

    try {
      const analyzer = new PoseAnalyzer();
      await analyzer.init(videoRef.current);
      const stream = await analyzer.startCamera();
      if (stream) {
        analyzerRef.current = analyzer;
        setIsReady(true);
      } else {
        setError("Camera access denied");
      }
    } catch (err) {
      setError(
        `Failed to initialize pose detection: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }, []);

  useEffect(() => {
    if (isActive) {
      initAnalyzer();
    }
    return () => {
      analyzerRef.current?.dispose();
      analyzerRef.current = null;
      setIsReady(false);
    };
  }, [isActive, initAnalyzer]);

  useEffect(() => {
    if (isActive && isReady) {
      analyzerRef.current?.start();
    } else {
      analyzerRef.current?.stop();
    }
  }, [isActive, isReady]);

  // Listen for motion cues to display
  useEffect(() => {
    const unsub = eventBus.on("motion_cue", (e) => {
      setLastCue(e.data);
    });
    return unsub;
  }, []);

  const cueColors: Record<string, string> = {
    breath: "#4caf50",
    nod: "#2196f3",
    sway: "#9c27b0",
    preparation: "#ff9800",
  };

  return (
    <div
      style={{
        position: "relative",
        borderRadius: 8,
        overflow: "hidden",
        background: "#000",
        aspectRatio: "4/3",
      }}
    >
      <video
        ref={videoRef}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          transform: "scaleX(-1)",
        }}
        playsInline
        muted
      />

      {!isActive && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(0,0,0,0.7)",
            color: "#fff",
            fontSize: 14,
          }}
        >
          {t(locale, "cameraInactive")}
        </div>
      )}

      {error && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(0,0,0,0.7)",
            color: "#ef5350",
            fontSize: 13,
            padding: 16,
            textAlign: "center",
          }}
        >
          {error}
        </div>
      )}

      {/* Motion cue indicator */}
      {lastCue && isActive && (
        <div
          style={{
            position: "absolute",
            top: 8,
            right: 8,
            padding: "4px 10px",
            borderRadius: 12,
            background: cueColors[lastCue.type] ?? "#666",
            color: "#fff",
            fontSize: 12,
            fontWeight: 600,
            opacity: 0.9,
          }}
        >
          {lastCue.type} ({Math.round(lastCue.confidence * 100)}%)
        </div>
      )}

      {/* Ready indicator */}
      {isActive && isReady && (
        <div
          style={{
            position: "absolute",
            bottom: 8,
            left: 8,
            display: "flex",
            alignItems: "center",
            gap: 4,
            fontSize: 11,
            color: "#4caf50",
          }}
        >
          <div
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: "#4caf50",
            }}
          />
          {t(locale, "poseDetectionActive")}
        </div>
      )}
    </div>
  );
}
