import type { MidiNoteMessage } from "./types";

export interface PitchReading { frequency: number; midi: number; cents: number; confidence: number; level: number }
export const MICROPHONE_MIN_FREQUENCY = 40;
export const MICROPHONE_MAX_FREQUENCY = 2400;

function signalLevel(samples: Float32Array): number {
  let power = 0;
  for (const sample of samples) power += sample * sample;
  const level = Math.sqrt(power / samples.length);
  return Number.isFinite(level) ? level : 0;
}

export function detectPitch(samples: Float32Array, sampleRate: number, tuning = 440): PitchReading | null {
  return detectPitchAtLevel(samples, sampleRate, tuning, signalLevel(samples));
}

function detectPitchAtLevel(samples: Float32Array, sampleRate: number, tuning: number, level: number): PitchReading | null {
  if (level < 0.008) return null;
  const size = Math.floor(samples.length / 2);
  const minLag = Math.max(2, Math.floor(sampleRate / MICROPHONE_MAX_FREQUENCY));
  const maxLag = Math.min(size - 1, Math.ceil(sampleRate / MICROPHONE_MIN_FREQUENCY));
  const normalized = new Float32Array(maxLag + 1);
  let cumulative = 0;
  let selected = 0;
  for (let lag = 1; lag <= maxLag; lag++) {
    let difference = 0;
    for (let i = 0; i < size; i += 2) {
      const delta = samples[i] - samples[i + lag];
      difference += delta * delta;
    }
    cumulative += difference;
    normalized[lag] = cumulative ? difference * lag / cumulative : 1;
    if (lag > minLag && normalized[lag - 1] < 0.15 && normalized[lag] > normalized[lag - 1]) {
      selected = lag - 1;
      break;
    }
  }
  if (!selected) return null;
  const left = normalized[selected - 1];
  const center = normalized[selected];
  const right = normalized[selected + 1];
  const denominator = left - 2 * center + right;
  const offset = denominator ? (left - right) / (2 * denominator) : 0;
  const frequency = sampleRate / (selected + offset);
  const pitch = 69 + 12 * Math.log2(frequency / tuning);
  const midi = Math.round(pitch);
  return { frequency, midi, cents: (pitch - midi) * 100, confidence: 1 - center, level };
}

export class MicrophoneInput {
  private context: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private generation = 0;
  private detach: (() => void) | null = null;
  private activeNote: number | null = null;
  private candidate: number | null = null;
  private stableFrames = 0;
  private lastSignal = 0;
  private lastOnset = 0;
  private lastLevel = 0;
  private gapFrames = 0;
  private reattackPending = false;
  onInterrupted: () => void = () => {};
  tuning = 440;
  onNote: (message: MidiNoteMessage) => void = () => {};
  onReading: (reading: PitchReading | null) => void = () => {};
  onLevel: (level: number) => void = () => {};

  getInputLabel(): string { return this.stream?.getAudioTracks()[0]?.label ?? ""; }

  async start(deviceId = ""): Promise<void> {
    this.stop();
    const generation = this.generation;
    if (!navigator.mediaDevices?.getUserMedia) throw new DOMException("このブラウザではマイクを使えません。Chromeで開いてください。", "NotSupportedError");
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { ...(deviceId ? { deviceId: { exact: deviceId } } : {}), echoCancellation: false, noiseSuppression: false, autoGainControl: false }, video: false });
    if (generation !== this.generation) { stream.getTracks().forEach((track) => track.stop()); return; }
    this.stream = stream;
    try {
      const context = new AudioContext({ latencyHint: "interactive" });
      this.context = context;
      await context.resume();
      if (generation !== this.generation) return;
      const tracks = stream.getAudioTracks();
      if (!tracks.length || tracks.some(track => track.readyState === "ended")) throw new Error("マイクが切断されました。");
      const interrupted = () => {
        if (generation !== this.generation) return;
        this.stop();
        this.onInterrupted();
      };
      const stateChanged = () => { if (context.state !== "running") interrupted(); };
      tracks.forEach(track => track.addEventListener("ended", interrupted));
      context.addEventListener("statechange", stateChanged);
      this.detach = () => {
        tracks.forEach(track => track.removeEventListener("ended", interrupted));
        context.removeEventListener("statechange", stateChanged);
      };
      if (!context.audioWorklet) throw new DOMException("この環境ではマイクの連続解析を使えません。", "NotSupportedError");
      await context.audioWorklet.addModule("/audio/microphone-capture.js");
      if (generation !== this.generation) return;
      const capture = new AudioWorkletNode(context, "convocerto-microphone-capture", { channelCount: 1, channelCountMode: "explicit", outputChannelCount: [1] });
      const source = context.createMediaStreamSource(stream);
      const origin = performance.now() - context.currentTime * 1000;
      capture.port.onmessage = ({ data }: MessageEvent<{ samples: Float32Array; time: number; quietGap: boolean }>) => {
        if (generation !== this.generation || !Number.isFinite(data.time) || !(data.samples instanceof Float32Array)) return;
        const level = signalLevel(data.samples);
        this.onLevel(level);
        this.processReading(detectPitchAtLevel(data.samples, context.sampleRate, this.tuning, level), origin + data.time * 1000, data.quietGap === true);
      };
      capture.addEventListener("processorerror", interrupted);
      const detach = this.detach;
      this.detach = () => {
        detach?.();
        capture.port.onmessage = null;
        capture.port.close();
        capture.removeEventListener("processorerror", interrupted);
        source.disconnect(); capture.disconnect();
      };
      source.connect(capture);
      capture.connect(context.destination);
    } catch (error) { if (generation === this.generation) this.stop(); throw error; }
  }

  processReading(reading: PitchReading | null, timestamp: number, quietGap = false): void {
    if (quietGap) {
      if (this.activeNote != null) this.reattackPending = true;
      reading = null;
    }
    this.onReading(reading);
    if (!reading) {
      this.gapFrames++;
      this.candidate = null;
      this.stableFrames = 0;
      if (this.activeNote != null && timestamp - this.lastSignal > 80) {
        this.onNote({ type: "noteoff", note: this.activeNote, velocity: 0, timestamp });
        this.activeNote = null;
        this.reattackPending = false;
      }
      this.lastLevel = 0;
      return;
    }
    if (this.gapFrames >= 2 && this.activeNote === reading.midi) this.reattackPending = true;
    this.gapFrames = 0;
    this.lastSignal = timestamp;
    this.stableFrames = this.candidate === reading.midi ? this.stableFrames + 1 : 1;
    this.candidate = reading.midi;
    const reattack = (this.reattackPending && timestamp - this.lastOnset >= 80)
      || (this.lastLevel > 0 && reading.level > this.lastLevel * 1.8 && timestamp - this.lastOnset > 160);
    this.lastLevel = reading.level;
    if (this.stableFrames < 2 || (this.activeNote === reading.midi && !reattack)) return;
    if (this.activeNote != null) this.onNote({ type: "noteoff", note: this.activeNote, velocity: 0, timestamp });
    this.activeNote = reading.midi;
    this.reattackPending = false;
    this.lastOnset = timestamp;
    this.onNote({ type: "noteon", note: reading.midi, velocity: Math.max(30, Math.min(127, Math.round(reading.level * 400))), timestamp });
  }

  stop(): void {
    this.generation++;
    this.detach?.();
    this.detach = null;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    void this.context?.close().catch(() => {});
    this.context = null;
    this.activeNote = null;
    this.candidate = null;
    this.stableFrames = 0;
    this.gapFrames = 0;
    this.reattackPending = false;
    this.lastSignal = 0;
    this.lastOnset = 0;
    this.lastLevel = 0;
    this.onReading(null);
    this.onLevel(0);
  }
}
