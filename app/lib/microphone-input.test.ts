import { describe, expect, it, vi } from "vitest";
import { detectPitch, MicrophoneInput } from "./microphone-input";
import type { MidiNoteMessage } from "./types";

function tone(frequency: number, sampleRate = 48000): Float32Array {
  return Float32Array.from({ length: 2048 }, (_, i) => 0.2 * Math.sin(2 * Math.PI * frequency * i / sampleRate) + 0.08 * Math.sin(6 * Math.PI * frequency * i / sampleRate));
}

describe("clarinet microphone input", () => {
  it("does not stop a replacement input when an earlier module load rejects late", async () => {
    let rejectFirst!: (error: Error) => void;
    let contexts = 0;
    const tracks: (EventTarget & { readyState: string; stop: () => void })[] = [];
    class Context extends EventTarget {
      state = "running"; currentTime = 0; sampleRate = 48000; destination = {};
      audioWorklet = { addModule: () => ++contexts === 1 ? new Promise<void>((_, reject) => { rejectFirst = reject; }) : Promise.resolve() };
      resume() { return Promise.resolve(); }
      close() { this.state = "closed"; return Promise.resolve(); }
      createMediaStreamSource() { return { connect() {}, disconnect() {} }; }
    }
    class Capture extends EventTarget {
      port = { onmessage: null, close() {} }; connect() {} disconnect() {}
    }
    vi.stubGlobal("AudioContext", Context); vi.stubGlobal("AudioWorkletNode", Capture);
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia: async () => {
      const track = Object.assign(new EventTarget(), { readyState: "live", stop() { this.readyState = "ended"; } });
      tracks.push(track);
      return { getAudioTracks: () => [track], getTracks: () => [track] };
    } } });
    const microphone = new MicrophoneInput();
    try {
      const first = microphone.start();
      await vi.waitFor(() => expect(rejectFirst).toBeDefined());
      await microphone.start();
      rejectFirst(new Error("old module failed"));
      await expect(first).rejects.toThrow("old module failed");
      expect(tracks.map((track) => track.readyState)).toEqual(["ended", "live"]);
    } finally { microphone.stop(); vi.unstubAllGlobals(); }
  });

  it.each([146.83, 220, 440, 880, 1174.66])("detects a harmonic tone at %s Hz", (frequency) => {
    const reading = detectPitch(tone(frequency), 48000);
    expect(reading).not.toBeNull();
    expect(Math.abs(1200 * Math.log2(reading!.frequency / frequency))).toBeLessThan(8);
    expect(reading!.confidence).toBeGreaterThan(0.9);
  });
  it("does not treat silence as a note", () => { expect(detectPitch(new Float32Array(2048), 48000)).toBeNull(); });
  it("supports orchestra tuning", () => { expect(detectPitch(tone(442), 48000, 442)?.cents).toBeCloseTo(0, 0); });
  it("emits one onset for a sustained note and another after a breath", () => {
    const mic = new MicrophoneInput(); const note = vi.fn(); mic.onNote = note;
    const reading = detectPitch(tone(440), 48000)!;
    for (let t = 0; t < 500; t += 25) mic.processReading(reading, t);
    expect(note.mock.calls.filter(([n]) => n.type === "noteon")).toHaveLength(1);
    mic.processReading(null, 600);
    mic.processReading(reading, 700); mic.processReading(reading, 725);
    expect(note.mock.calls.filter(([n]) => n.type === "noteon")).toHaveLength(2);
    expect(note.mock.calls.filter(([n]) => n.type === "noteoff")).toHaveLength(1);
  });

  it("recognizes a repeated pitch after a short two-frame gap", () => {
    const mic = new MicrophoneInput(); const note = vi.fn(); mic.onNote = note;
    const reading = detectPitch(tone(440), 48000)!;
    for (let t = 0; t <= 200; t += 25) mic.processReading(reading, t);
    mic.processReading(null, 225); mic.processReading(null, 250);
    mic.processReading(reading, 275); mic.processReading(reading, 300);
    expect(note.mock.calls.map(([message]) => [message.type, message.note, message.timestamp])).toEqual([
      ["noteon", 69, 25], ["noteoff", 69, 300], ["noteon", 69, 300],
    ]);
    for (let t = 325; t <= 500; t += 25) mic.processReading(reading, t);
    expect(note).toHaveBeenCalledTimes(3);
  });

  it("does not turn a single missing pitch frame into a repeated note", () => {
    const mic = new MicrophoneInput(); const note = vi.fn(); mic.onNote = note;
    const reading = detectPitch(tone(440), 48000)!;
    for (let t = 0; t <= 500; t += 25) mic.processReading(t === 225 ? null : reading, t);
    expect(note.mock.calls.map(([message]) => message.type)).toEqual(["noteon"]);
  });

  it("resets gap evidence on stop before another microphone session", () => {
    const mic = new MicrophoneInput(); const note = vi.fn(); mic.onNote = note;
    const reading = detectPitch(tone(440), 48000)!;
    mic.processReading(reading, 0); mic.processReading(reading, 25);
    mic.processReading(null, 50); mic.processReading(null, 75);
    mic.processReading(reading, 100);
    mic.stop(); note.mockClear();
    for (let t = 125; t <= 300; t += 25) mic.processReading(reading, t);
    expect(note.mock.calls.map(([message]) => message.type)).toEqual(["noteon"]);
  });

  it.each([44100, 48000])("tracks repeated harmonic audio with 40ms gaps at %s Hz sample rate", (sampleRate) => {
    const mic = new MicrophoneInput(); const events: MidiNoteMessage[] = []; mic.onNote = (message) => events.push(message);
    for (let timestamp = 0; timestamp < 1600; timestamp += 25) {
      const samples = Float32Array.from({ length: 2048 }, (_, i) => {
        const ms = timestamp - (2047 - i) * 1000 / sampleRate;
        if (ms < 0 || ms % 300 >= 260) return 0;
        const phase = 2 * Math.PI * 440 * ms / 1000;
        return 0.2 * Math.sin(phase) + 0.08 * Math.sin(phase * 3);
      });
      mic.processReading(detectPitch(samples, sampleRate), timestamp);
    }
    const onsets = events.filter((message) => message.type === "noteon");
    expect(onsets.map((message) => message.note)).toEqual([69, 69, 69, 69, 69, 69]);
    onsets.forEach((message, i) => expect(message.timestamp - i * 300).toBeLessThanOrEqual(100));
  });
});
