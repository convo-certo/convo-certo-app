import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { detectPitch, MicrophoneInput } from "./microphone-input";

describe("continuous microphone capture", () => {
  it("preserves overlapping audio windows and sample times across variable render blocks", () => {
    const frames: { samples: Float32Array; time: number }[] = [];
    let Processor: any;
    const scope = {
      sampleRate: 48000, currentFrame: 0, Float32Array,
      AudioWorkletProcessor: class { port = { postMessage: (data: typeof frames[number]) => frames.push(data) }; },
      registerProcessor: (_name: string, value: any) => { Processor = value; },
    };
    runInNewContext(readFileSync("public/audio/microphone-capture.js", "utf8"), scope);
    const processor = new Processor();
    const sizes = [128, 256, 64, 160];
    for (let block = 0; scope.currentFrame < 7200; block++) {
      const size = Math.min(sizes[block % sizes.length], 7200 - scope.currentFrame);
      const samples = Float32Array.from({ length: size }, (_, i) => scope.currentFrame + i);
      expect(processor.process([[samples]])).toBe(true);
      scope.currentFrame += size;
    }
    expect(frames.map((frame) => frame.time)).toEqual([0.1, 0.125, 0.15]);
    frames.forEach((frame, i) => {
      expect(Array.from(frame.samples)).toEqual(Array.from({ length: 4096 }, (_, j) => 4800 + i * 1200 - 4096 + j));
    });
  });

  it.each([44100, 48000])("detects short same-pitch gaps independently of capture phase at %s Hz", (rate) => {
    for (const offset of [0, 5, 10, 15, 20]) {
      const microphone = new MicrophoneInput();
      const onsets: number[] = [];
      microphone.onNote = (message) => { if (message.type === "noteon") onsets.push(message.note); };
      let Processor: any;
      const scope = {
        sampleRate: rate, currentFrame: 0, Float32Array,
        AudioWorkletProcessor: class {
          port = { postMessage: (data: { samples: Float32Array; time: number; quietGap: boolean }) => {
            microphone.processReading(detectPitch(data.samples, rate), data.time * 1000, data.quietGap);
          } };
        },
        registerProcessor: (_name: string, value: any) => { Processor = value; },
      };
      runInNewContext(readFileSync("public/audio/microphone-capture.js", "utf8"), scope);
      const processor = new Processor();
      for (; scope.currentFrame < rate * 1.7; scope.currentFrame += 128) {
        const samples = Float32Array.from({ length: 128 }, (_, i) => {
          const ms = (scope.currentFrame + i) * 1000 / rate - offset;
          if (ms < 0 || ms % 300 >= 260) return 0;
          const phase = 2 * Math.PI * 440 * ms / 1000;
          return 0.2 * Math.sin(phase) + 0.08 * Math.sin(phase * 3);
        });
        processor.process([[samples]]);
      }
      expect(onsets, `offset ${offset}ms`).toEqual([69, 69, 69, 69, 69, 69]);
    }
  });

  it.each([44100, 48000])("recognizes the first sustained synthetic bass, midrange and high note within 150ms at %s Hz", (rate) => {
    for (const [frequency, midi] of [[41.203, 28], [65.406, 36], [440, 69], [2093.005, 96]]) {
      const microphone = new MicrophoneInput();
      const onsets: { note: number; timestamp: number }[] = [];
      microphone.onNote = (message) => { if (message.type === "noteon") onsets.push(message); };
      let Processor: any;
      const scope = {
        sampleRate: rate, currentFrame: 0, Float32Array,
        AudioWorkletProcessor: class {
          port = { postMessage: (data: { samples: Float32Array; time: number; quietGap: boolean }) => {
            microphone.processReading(detectPitch(data.samples, rate), data.time * 1000, data.quietGap);
          } };
        },
        registerProcessor: (_name: string, value: any) => { Processor = value; },
      };
      runInNewContext(readFileSync("public/audio/microphone-capture.js", "utf8"), scope);
      const processor = new Processor();
      for (; scope.currentFrame < rate * 0.25; scope.currentFrame += 128) {
        const samples = Float32Array.from({ length: 128 }, (_, i) => {
          const phase = 2 * Math.PI * frequency * (scope.currentFrame + i) / rate;
          return 0.2 * Math.sin(phase) + 0.08 * Math.sin(phase * 3);
        });
        processor.process([[samples]]);
      }
      expect(onsets, `${frequency} Hz`).toHaveLength(1);
      expect(onsets[0].note, `${frequency} Hz`).toBe(midi);
      expect(onsets[0].timestamp, `${frequency} Hz`).toBeLessThanOrEqual(150);
    }
  });
});
