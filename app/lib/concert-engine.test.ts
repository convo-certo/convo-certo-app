import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConcertEngine } from "./concert-engine";
import { defaultEnsembleTuning } from "./ensemble-tuning";
import type { ParsedScore } from "./types";

function fixture(): ParsedScore {
  const notes = Array.from({ length: 16 }, (_, i) => ({ pitch: 60 + i % 8, startBeat: i, durationBeats: 0.8, velocity: 80, partIndex: 0 }));
  return { title: "Duet", tempo: 120, timeSignature: { beats: 4, beatType: 4 }, timeSignatureChanges: [], totalMeasures: 4, totalBeats: 16, measureNumbers: [1, 2, 3, 4], playbackOrder: [0, 1, 2, 3], measureStartBeats: [0, 4, 8, 12], measures: [], parts: [{ id: "solo", name: "Clarinet", isSolo: true, notes }, { id: "piano", name: "Piano", isSolo: false, notes: notes.map((n) => ({ ...n, partIndex: 1, pitch: n.pitch - 12 })) }] };
}

describe("concert accompaniment", () => {
  let engine: ConcertEngine;
  let now: number;
  let output: ReturnType<typeof vi.fn<ConcertEngine["onNote"]>>;
  beforeEach(() => {
    vi.useFakeTimers(); now = 0;
    engine = new ConcertEngine(() => now);
    engine.load(fixture());
    output = vi.fn<ConcertEngine["onNote"]>();
    engine.onNote = output;
  });
  afterEach(() => { engine.dispose(); vi.useRealTimers(); });
  const advance = (seconds: number) => {
    for (let i = 0; i < Math.round(seconds / 0.025); i++) { now += 0.025; vi.advanceTimersByTime(25); }
  };

  it("plays the orchestra while excluding the performer's entire part", () => {
    engine.start(); advance(1);
    expect(output.mock.calls.length).toBeGreaterThan(1);
    expect(output.mock.calls.every(([note]) => note.partIndex === 1)).toBe(true);
    expect(output.mock.calls[0][0].startBeat).toBe(0);
  });

  it("restarts active accompaniment with a complete count-in and silences the old passage", () => {
    const silence = vi.fn(); engine.onSilence = silence;
    engine.start(); advance(3);
    engine.setPracticeOptions({ mode: "accompany", countInBars: 1, click: false });
    engine.restartFrom(4);
    expect(silence).toHaveBeenCalled();
    expect(engine.getState()).toMatchObject({ status: "playing", beat: 4, countInRemaining: 4, matchedBeat: null });
    output.mockClear();
    advance(1.8);
    expect(output).not.toHaveBeenCalled();
    expect(engine.getState().beat).toBe(4);
    engine.restartFrom(4);
    advance(1.8);
    expect(output).not.toHaveBeenCalled();
    advance(0.3);
    expect(output.mock.calls[0][0].startBeat).toBe(4);
    expect(output.mock.calls.every(([note]) => note.partIndex === 1)).toBe(true);
    expect(engine.getState().countInRemaining).toBe(0);
  });

  it("adds a one-bar count-in when a score position is chosen", () => {
    engine.restartFrom(4, 1);
    expect(engine.getState()).toMatchObject({ status: "playing", beat: 4, countInRemaining: 4 });
    advance(1.8);
    expect(output).not.toHaveBeenCalled();
    advance(0.3);
    expect(output).toHaveBeenCalled();
    expect(engine.getState().countInRemaining).toBe(0);
  });

  it("does not interrupt playback for an invalid restart position", () => {
    engine.start(); advance(0.5);
    const before = engine.getState();
    engine.restartFrom(NaN);
    expect(engine.getState()).toEqual(before);
  });

  it("stops at a middle-measure cue and never queues accompaniment beyond it", () => {
    engine.setAnnotations([{ measureNumber: 2, wait: { type: "listen" } }]);
    engine.start(); advance(2.5);
    expect(engine.getState()).toMatchObject({ status: "waiting", beat: 4, measure: 2 });
    expect(output.mock.calls.every(([note]) => note.startBeat < 4)).toBe(true);
    engine.processNote({ type: "noteoff", note: 64, velocity: 0, timestamp: 2500 });
    expect(engine.getState().status).toBe("waiting");
    engine.processNote({ type: "noteon", note: 64, velocity: 90, timestamp: 2550 });
    advance(0.1);
    expect(engine.getState().status).toBe("playing");
    expect(output.mock.calls.some(([note]) => note.startBeat === 4)).toBe(true);
  });

  it("does not release a cue on an unrelated pitch", () => {
    engine.setAnnotations([{ measureNumber: 1, wait: { type: "listen" } }]);
    engine.start();
    engine.processNote({ type: "noteon", note: 100, velocity: 80, timestamp: 100 });
    expect(engine.getState().status).toBe("waiting");
  });

  it("releases a listen cue on the first correct note after an extended breath", () => {
    engine.setTuning({ ...defaultEnsembleTuning, follower: "sequence" });
    engine.setAnnotations([{ measureNumber: 2, wait: { type: "listen" } }]);
    engine.start();
    for (let i = 0; i < 4; i++) {
      engine.processNote({ type: "noteon", note: 60 + i, velocity: 80, timestamp: now * 1000 });
      advance(0.5);
    }
    advance(2.2);
    expect(engine.getState().status).toBe("waiting");
    expect(output.mock.calls.every(([note]) => note.startBeat < 4)).toBe(true);
    engine.processNote({ type: "noteon", note: 99, velocity: 80, timestamp: now * 1000 });
    expect(engine.getState().status).toBe("waiting");
    advance(0.1);
    engine.processNote({ type: "noteon", note: 64, velocity: 80, timestamp: now * 1000 });
    expect(engine.getState()).toMatchObject({ status: "playing", matchedBeat: 4 });
    advance(0.1);
    expect(output.mock.calls.some(([note]) => note.startBeat === 4)).toBe(true);
    expect(engine.getState().tempo).toBeCloseTo(120);
  });

  it("honors timed waits and cancels them on stop", () => {
    engine.setAnnotations([{ measureNumber: 1, wait: { type: "wait", duration: 1 } }]);
    engine.start(); advance(0.5);
    expect(output).not.toHaveBeenCalled();
    engine.stop(); advance(1);
    expect(engine.getState().status).toBe("idle");
    expect(output).not.toHaveBeenCalled();
    engine.start(); advance(1.1);
    expect(output).toHaveBeenCalled();
  });

  it("switches roles at the annotated measure", () => {
    engine.setAnnotations([{ measureNumber: 2, role: { mode: "lead", strength: "strong", factor: 0.9 } }]);
    engine.start(); advance(2.1);
    expect(engine.getState().mode).toBe("lead");
  });

  it("adapts tempo to a slower performer without outputting the solo", () => {
    engine.start();
    for (let i = 0; i < 5; i++) {
      engine.processNote({ type: "noteon", note: 60 + i, velocity: 90, timestamp: i * 750 + 1 });
      advance(0.75);
    }
    expect(engine.getState().tempo).toBeLessThan(100);
    expect(engine.getState().matchedBeat).toBe(4);
  });

  it("keeps the chosen tempo in lead mode", () => {
    engine.setMode("lead"); engine.start();
    for (let i = 0; i < 4; i++) {
      engine.processNote({ type: "noteon", note: 60 + i, velocity: 90, timestamp: i * 750 + 1 });
      advance(0.75);
    }
    expect(engine.getState().tempo).toBe(120);
  });

  it("seeks while idle and starts from the selected position", () => {
    engine.seek(8); engine.start();
    expect(output.mock.calls[0][0].startBeat).toBe(8);
    expect(engine.getState().measure).toBe(3);
  });

  it("silences scheduled voices on stop and seek", () => {
    const silence = vi.fn(); engine.onSilence = silence;
    engine.start(); engine.seek(8); engine.stop();
    expect(silence).toHaveBeenCalledTimes(2);
  });

  it("loops without playing beyond the selected passage", () => {
    engine.setLoop(0, 4); engine.start(); advance(4.5);
    expect(output.mock.calls.filter(([note]) => note.startBeat === 0).length).toBeGreaterThanOrEqual(3);
    expect(output.mock.calls.every(([note]) => note.startBeat < 4)).toBe(true);
  });

  it("does not restart after disposal", () => {
    engine.start(); engine.dispose(); output.mockClear(); advance(4);
    expect(output).not.toHaveBeenCalled();
  });
  it("renders a settling phrase with progressively lower tempo and velocity", () => {
    engine.setMode("lead");
    engine.setAnnotations([{ measureNumber: 1, expression: { preset: "settling", amount: 1, endMeasure: 2 } }]);
    engine.start();
    const first = output.mock.calls[0][0].velocity;
    advance(3);
    expect(engine.getState().tempo).toBeLessThan(110);
    expect(engine.getState().expression).toBe("語尾を収める");
    expect(output.mock.calls.at(-1)![0].velocity).toBeLessThan(first);
    expect(fixture().parts[1].notes[0].velocity).toBe(80);
  });

  it("changes sounding articulation while retaining written note lengths", () => {
    engine.setAnnotations([{ measureNumber: 1, expression: { preset: "light", amount: 1 } }]);
    engine.start();
    expect(output.mock.calls[0][2]).toBeCloseTo(0.24);
    expect(output.mock.calls[0][0].durationBeats).toBe(0.8);
  });

  it("responds smoothly to rubato and respects strong lead versus strong follow", () => {
    const perform = (mode: "lead" | "follow", factor: number) => {
      engine.load(fixture());
      engine.setAnnotations([{ measureNumber: 1, role: { mode, strength: "strong", factor } }]);
      engine.start();
      for (let i = 0; i < 5; i++) {
        const before = engine.getState().tempo;
        engine.processNote({ type: "noteon", note: 60 + i, velocity: 80, timestamp: i * 650 });
        expect(engine.getState().tempo).toBe(before);
        advance(0.65);
      }
      return engine.getState().tempo;
    };
    const lead = perform("lead", 0.9);
    const follow = perform("follow", 0.1);
    expect(follow).toBeLessThan(lead - 5);
    expect(follow).toBeGreaterThan(90);
  });

  it.each([
    { channel: 1, timestamp: 200 },
    { channel: 0, timestamp: 50 },
    { channel: 0, timestamp: NaN },
    { channel: 0, timestamp: Infinity },
  ])("ignores unrelated releases and still learns the valid release: %j", (release) => {
    engine.setAnnotations([{ measureNumber: 1, role: { mode: "follow", strength: "strong", factor: 0.1 } }]);
    engine.start();
    engine.processNote({ type: "noteon", note: 60, velocity: 80, timestamp: 100, channel: 0 });
    engine.processNote({ type: "noteoff", note: 60, velocity: 0, ...release });
    advance(0.45);
    expect(output.mock.calls.at(-1)![2]).toBeCloseTo(0.4);
    engine.processNote({ type: "noteoff", note: 60, velocity: 0, timestamp: 250, channel: 0 });
    advance(0.5);
    expect(output.mock.calls.at(-1)![2]).toBeLessThan(0.4);
  });

  it("follows relative dynamic growth and note release, then clears it on seek", () => {
    engine.setAnnotations([{ measureNumber: 1, role: { mode: "follow", strength: "strong", factor: 0.1 } }]);
    engine.start();
    engine.processNote({ type: "noteon", note: 60, velocity: 60, timestamp: 0 });
    advance(0.15);
    engine.processNote({ type: "noteoff", note: 60, velocity: 0, timestamp: 150 });
    advance(0.35);
    engine.processNote({ type: "noteon", note: 61, velocity: 100, timestamp: 500 });
    advance(0.5);
    const last = output.mock.calls.at(-1)!;
    expect(last[0].velocity).toBeGreaterThan(80);
    expect(last[2]).toBeLessThan(0.4);
    engine.seek(0);
    output.mockClear();
    advance(0.025);
    expect(output.mock.calls[0][0].velocity).toBe(80);
    expect(output.mock.calls[0][2]).toBeCloseTo(0.4);
    expect(output).toHaveBeenCalledTimes(1);
  });

  it("waits silently for every correct pitch, rejecting wrong notes", () => {
    engine.setPracticeOptions({ mode: "wait", countInBars: 0, click: false });
    engine.start(); advance(2);
    expect(engine.getState()).toMatchObject({ status: "waiting", beat: 0 });
    engine.processNote({ type: "noteon", note: 99, velocity: 80, timestamp: 2000 });
    expect(engine.getState()).toMatchObject({ beat: 0, inputFeedback: "unmatched" });
    engine.processNote({ type: "noteon", note: 60, velocity: 80, timestamp: 2100 });
    expect(engine.getState()).toMatchObject({ status: "waiting", beat: 1 });
    engine.seek(8);
    expect(engine.getState()).toMatchObject({ status: "waiting", beat: 8 });
    expect(output).not.toHaveBeenCalled();
  });

  it("includes the player in listening mode without following input", () => {
    engine.setPracticeOptions({ mode: "listen", countInBars: 0, click: false });
    engine.start(); advance(1);
    expect(new Set(output.mock.calls.map(([note]) => note.partIndex))).toEqual(new Set([0, 1]));
    engine.processNote({ type: "noteon", note: 60, velocity: 80, timestamp: 1000 });
    expect(engine.getState().matchedBeat).toBeNull();
  });

  it("counts in before notes and continues metronome clicks on the beat", () => {
    const clicks = vi.fn(); engine.onClick = clicks;
    engine.setPracticeOptions({ mode: "accompany", countInBars: 1, click: true });
    engine.start(); advance(1.9);
    expect(clicks).toHaveBeenCalledTimes(4);
    expect(output).not.toHaveBeenCalled();
    expect(engine.getState().beat).toBe(0);
    advance(0.2);
    expect(output).toHaveBeenCalled();
    expect(output.mock.calls[0][1]).toBeGreaterThanOrEqual(2);
    expect(clicks.mock.calls[0][1]).toBe(true);
    expect(clicks.mock.calls[1][1]).toBe(false);
    engine.stop(); const count = clicks.mock.calls.length; advance(2);
    expect(clicks).toHaveBeenCalledTimes(count);
  });

});
