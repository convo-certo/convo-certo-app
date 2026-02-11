/**
 * Pose Analyzer
 *
 * Uses MediaPipe Pose Landmarker to detect body motion from the webcam.
 * Analyzes breathing patterns (shoulder rise/fall), head nods, and
 * preparatory gestures to generate MotionCue events.
 */

import type { MotionCue, PoseFrame, PoseKeypoint } from "./types";
import { eventBus } from "./event-bus";

// MediaPipe landmark indices for upper body
const NOSE = 0;
const LEFT_SHOULDER = 11;
const RIGHT_SHOULDER = 12;
const LEFT_ELBOW = 13;
const RIGHT_ELBOW = 14;

const BREATH_THRESHOLD = 0.008;
const NOD_THRESHOLD = 0.015;
const SMOOTHING_WINDOW = 5;

export class PoseAnalyzer {
  private poseLandmarker: unknown = null;
  private video: HTMLVideoElement | null = null;
  private isRunning = false;
  private animationFrameId: number | null = null;

  private frameHistory: PoseFrame[] = [];
  private shoulderYHistory: number[] = [];
  private noseYHistory: number[] = [];

  async init(videoElement: HTMLVideoElement): Promise<void> {
    this.video = videoElement;

    try {
      const vision = await import("@mediapipe/tasks-vision");
      const { PoseLandmarker, FilesetResolver } = vision;

      const filesetResolver = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
      );

      this.poseLandmarker = await PoseLandmarker.createFromOptions(
        filesetResolver,
        {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
            delegate: "GPU",
          },
          runningMode: "VIDEO",
          numPoses: 1,
        }
      );
    } catch (err) {
      console.warn("[PoseAnalyzer] MediaPipe initialization failed:", err);
    }
  }

  async startCamera(): Promise<MediaStream | null> {
    if (!this.video) return null;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: 640, height: 480 },
      });
      this.video.srcObject = stream;
      await this.video.play();
      return stream;
    } catch (err) {
      console.warn("[PoseAnalyzer] Camera access failed:", err);
      return null;
    }
  }

  start(): void {
    if (!this.poseLandmarker || !this.video) return;
    this.isRunning = true;
    this.detectFrame();
  }

  stop(): void {
    this.isRunning = false;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  dispose(): void {
    this.stop();
    if (this.video?.srcObject) {
      const tracks = (this.video.srcObject as MediaStream).getTracks();
      tracks.forEach((t) => t.stop());
      this.video.srcObject = null;
    }
  }

  private detectFrame(): void {
    if (!this.isRunning || !this.poseLandmarker || !this.video) return;

    const landmarker = this.poseLandmarker as {
      detectForVideo: (
        video: HTMLVideoElement,
        timestamp: number
      ) => { landmarks: Array<Array<{ x: number; y: number; z: number; visibility: number }>> };
    };

    if (this.video.readyState >= 2) {
      const result = landmarker.detectForVideo(
        this.video,
        performance.now()
      );

      if (result.landmarks && result.landmarks.length > 0) {
        const landmarks = result.landmarks[0];
        const frame: PoseFrame = {
          timestamp: performance.now(),
          landmarks: landmarks.map(
            (lm): PoseKeypoint => ({
              x: lm.x,
              y: lm.y,
              z: lm.z,
              visibility: lm.visibility ?? 0,
            })
          ),
        };

        this.processFrame(frame);
      }
    }

    this.animationFrameId = requestAnimationFrame(() => this.detectFrame());
  }

  private processFrame(frame: PoseFrame): void {
    this.frameHistory.push(frame);
    if (this.frameHistory.length > 30) {
      this.frameHistory.shift();
    }

    const landmarks = frame.landmarks;
    if (landmarks.length < 15) return;

    // Track shoulder Y position (breathing indicator)
    const avgShoulderY =
      (landmarks[LEFT_SHOULDER].y + landmarks[RIGHT_SHOULDER].y) / 2;
    this.shoulderYHistory.push(avgShoulderY);
    if (this.shoulderYHistory.length > SMOOTHING_WINDOW * 2) {
      this.shoulderYHistory.shift();
    }

    // Track nose Y position (nod detection)
    const noseY = landmarks[NOSE].y;
    this.noseYHistory.push(noseY);
    if (this.noseYHistory.length > SMOOTHING_WINDOW * 2) {
      this.noseYHistory.shift();
    }

    // Detect breath
    this.detectBreath();

    // Detect nod
    this.detectNod();

    // Detect preparation gesture (large upward motion)
    this.detectPreparation(landmarks);
  }

  private detectBreath(): void {
    if (this.shoulderYHistory.length < SMOOTHING_WINDOW * 2) return;

    const recent = this.shoulderYHistory.slice(-SMOOTHING_WINDOW);
    const previous = this.shoulderYHistory.slice(
      -SMOOTHING_WINDOW * 2,
      -SMOOTHING_WINDOW
    );

    const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
    const previousAvg =
      previous.reduce((a, b) => a + b, 0) / previous.length;
    const delta = previousAvg - recentAvg; // Shoulders rise = inhale (y decreases)

    if (Math.abs(delta) > BREATH_THRESHOLD) {
      const cue: MotionCue = {
        type: "breath",
        timestamp: performance.now(),
        confidence: Math.min(1, Math.abs(delta) / (BREATH_THRESHOLD * 3)),
      };
      eventBus.emit({ type: "motion_cue", data: cue });
    }
  }

  private detectNod(): void {
    if (this.noseYHistory.length < SMOOTHING_WINDOW * 2) return;

    const recent = this.noseYHistory.slice(-SMOOTHING_WINDOW);
    const previous = this.noseYHistory.slice(
      -SMOOTHING_WINDOW * 2,
      -SMOOTHING_WINDOW
    );

    const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
    const previousAvg =
      previous.reduce((a, b) => a + b, 0) / previous.length;
    const delta = recentAvg - previousAvg;

    if (delta > NOD_THRESHOLD) {
      const cue: MotionCue = {
        type: "nod",
        timestamp: performance.now(),
        confidence: Math.min(1, delta / (NOD_THRESHOLD * 3)),
      };
      eventBus.emit({ type: "motion_cue", data: cue });
    }
  }

  private detectPreparation(landmarks: PoseKeypoint[]): void {
    // Check if elbows are raised (preparation gesture for wind instruments)
    const leftElbowY = landmarks[LEFT_ELBOW]?.y ?? 0;
    const rightElbowY = landmarks[RIGHT_ELBOW]?.y ?? 0;
    const leftShoulderY = landmarks[LEFT_SHOULDER]?.y ?? 0;
    const rightShoulderY = landmarks[RIGHT_SHOULDER]?.y ?? 0;

    const leftRaise = leftShoulderY - leftElbowY;
    const rightRaise = rightShoulderY - rightElbowY;

    if (leftRaise > 0.05 || rightRaise > 0.05) {
      const cue: MotionCue = {
        type: "preparation",
        timestamp: performance.now(),
        confidence: Math.min(
          1,
          Math.max(leftRaise, rightRaise) / 0.15
        ),
      };
      eventBus.emit({ type: "motion_cue", data: cue });
    }
  }
}
