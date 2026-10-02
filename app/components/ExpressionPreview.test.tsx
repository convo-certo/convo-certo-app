import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ParsedScore } from "~/lib/types";
import { defaultEnsembleTuning } from "~/lib/ensemble-tuning";
import type { OrchestraSpace, PracticeEnsemble } from "~/lib/practice-session";
import { ExpressionPreview } from "./ExpressionPreview";
import { LOCALE_STORAGE_KEY, LocaleProvider } from "~/lib/locale-context";

const mocks = vi.hoisted(() => {
  Object.assign(window, { __vite_plugin_react_preamble_installed__: true });
  return { audio: [] as any[], engines: [] as any[], ready: [] as (() => void)[] };
});

vi.mock("~/lib/orchestra-audio", () => ({
  instrumentForPart: (part: { name: string }) => part.name === "Violin" ? "violin" : "acoustic_grand_piano",
  OrchestraAudio: class {
    currentTime = 0;
    onAvailabilityChanged = () => {};
    prepare = vi.fn(() => new Promise<void>(resolve => { mocks.ready.push(resolve); }));
    resume = vi.fn(async () => {});
    setSoloAudible = vi.fn();
    setTuning = vi.fn();
    setVolume = vi.fn();
    setPartVolume = vi.fn();
    configureSpace = vi.fn();
    play = vi.fn();
    stop = vi.fn();
    dispose = vi.fn();
    constructor() { mocks.audio.push(this); }
  },
}));

vi.mock("~/lib/concert-engine", () => ({
  ConcertEngine: class {
    onState = () => {};
    onNote = () => {};
    onSilence = () => {};
    load = vi.fn();
    setTempo = vi.fn();
    setTuning = vi.fn();
    setReference = vi.fn();
    setLeader = vi.fn();
    setPracticeOptions = vi.fn();
    setAnnotations = vi.fn();
    getState = vi.fn(() => ({ tempo: 120 }));
    seek = vi.fn();
    start = vi.fn();
    cue = vi.fn();
    stop = vi.fn(() => this.onSilence());
    dispose = vi.fn();
    constructor() { mocks.engines.push(this); }
  },
}));

const score: ParsedScore = {
  title: "Audition", tempo: 120, timeSignature: { beats: 4, beatType: 4 },
  parts: [
    { id: "backing", name: "Piano", isSolo: false, notes: [{ pitch: 60, velocity: 80, startBeat: 0, durationBeats: 4, partIndex: 0 }] },
    { id: "violin", name: "Violin", isSolo: false, notes: [{ pitch: 67, velocity: 80, startBeat: 0, durationBeats: 4, partIndex: 1 }] },
  ],
  measures: [], totalMeasures: 2, totalBeats: 8,
  playbackOrder: [0, 1], measureNumbers: [1, 2], measureStartBeats: [0, 4], timeSignatureChanges: [],
};

describe("expression audition lifecycle", () => {
  let container: HTMLDivElement;
  let root: Root;
  let mounted: boolean;
  const annotations = [{ measureNumber: 1, memo: "Keep this", expression: { preset: "tender" as const, amount: 0.6, endMeasure: 1 } }];
  const onBeforePlay = vi.fn();
  const onApply = vi.fn();

  beforeEach(() => {
    localStorage.setItem(LOCALE_STORAGE_KEY, "ja");
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    mocks.audio.length = 0; mocks.engines.length = 0; mocks.ready.length = 0;
    onBeforePlay.mockClear(); onApply.mockClear();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    mounted = true;
  });

  afterEach(async () => {
    if (mounted) await act(async () => root.unmount());
    container.remove();
    localStorage.removeItem(LOCALE_STORAGE_KEY);
  });

  const render = async (disabled = false, options: { tempo?: number; mutedParts?: number[]; tuningHz?: number; volume?: number; ensemble?: PracticeEnsemble; space?: OrchestraSpace } = {}) => {
    await act(async () => root.render(<LocaleProvider><ExpressionPreview score={score} measure={1} annotations={annotations} disabled={disabled} onBeforePlay={onBeforePlay} onApply={onApply} {...options}/></LocaleProvider>));
  };
  const click = async (label: string, instance = 0) => {
    const button = [...container.querySelectorAll("button")].filter(element => element.textContent?.includes(label))[instance];
    expect(button).toBeDefined();
    await act(async () => button!.click());
  };

  it("never starts audio automatically and discards an unfinished prepare on unmount", async () => {
    await render();
    expect(mocks.audio).toHaveLength(0);
    await click("B 変化を聴く");
    expect(onBeforePlay).toHaveBeenCalledOnce();
    expect(mocks.engines[0].start).not.toHaveBeenCalled();
    await act(async () => root.unmount());
    mounted = false;
    await act(async () => mocks.ready[0]());
    expect(mocks.audio[0].dispose).toHaveBeenCalledOnce();
    expect(mocks.engines[0].start).not.toHaveBeenCalled();
    expect(onApply).not.toHaveBeenCalled();
  });

  it("cancels a pending preview when rehearsal becomes active", async () => {
    await render();
    await click("B 変化を聴く");
    await render(true);
    await act(async () => mocks.ready[0]());
    expect(mocks.engines[0].start).not.toHaveBeenCalled();
    expect(onApply).not.toHaveBeenCalled();
  });

  it("reuses prepared audio and only plays the latest A/B choice", async () => {
    await render();
    await click("A この指示なし");
    await click("B 変化を聴く");
    await act(async () => mocks.ready[0]());
    expect(mocks.audio).toHaveLength(1);
    expect(mocks.engines[0].start).toHaveBeenCalledOnce();
    expect(mocks.engines[0].setAnnotations).toHaveBeenLastCalledWith(annotations);
    expect(mocks.engines[0].seek).toHaveBeenLastCalledWith(0);
    expect(onApply).not.toHaveBeenCalled();
    await click("A この指示なし");
    expect(mocks.audio).toHaveLength(1);
    expect(mocks.engines[0].setAnnotations).toHaveBeenLastCalledWith([{ measureNumber: 1, memo: "Keep this" }]);
    expect(annotations[0].expression.preset).toBe("tender");
    await click("楽譜に残す");
    expect(onApply).toHaveBeenCalledExactlyOnceWith({ expression: annotations[0].expression });
  });

  it("matches current tempo, tuning, volume and muted parts without cancelling equal option arrays", async () => {
    await render(false, { tempo: 84, tuningHz: 442, volume: 0.4, mutedParts: [1] });
    await click("B 変化を聴く");
    await render(false, { tempo: 84, tuningHz: 442, volume: 0.4, mutedParts: [1, 1] });
    await act(async () => mocks.ready[0]());
    expect(mocks.engines[0].start).toHaveBeenCalledOnce();
    expect(mocks.engines[0].setTempo).toHaveBeenLastCalledWith(84);
    expect(mocks.engines[0].load.mock.invocationCallOrder[0]).toBeLessThan(mocks.engines[0].setTempo.mock.invocationCallOrder[0]);
    expect(mocks.audio[0].setTuning).toHaveBeenLastCalledWith(442);
    expect(mocks.audio[0].setVolume).toHaveBeenLastCalledWith(0.4);
    expect(mocks.audio[0].setPartVolume).toHaveBeenCalledWith(0, 1);
    expect(mocks.audio[0].setPartVolume).toHaveBeenCalledWith(1, 0);
    await render(false, { tempo: 84, tuningHz: 442, volume: 0.4, mutedParts: [] });
    await click("B 変化を聴く");
    expect(mocks.audio).toHaveLength(1);
    expect(mocks.audio[0].setPartVolume).toHaveBeenLastCalledWith(1, 1);
  });

  it.each([
    { tempo: 84 },
    { tuningHz: 442 },
    { volume: 0.4 },
    { mutedParts: [1] },
  ])("cancels pending audio when playback options change: %j", async options => {
    await render();
    await click("B 変化を聴く");
    await render(false, options);
    await act(async () => mocks.ready[0]());
    expect(mocks.engines[0].start).not.toHaveBeenCalled();
    expect(onApply).not.toHaveBeenCalled();
  });

  it.each([false, true])("stops another open preview before starting from the pencil editor (already playing: %s)", async alreadyPlaying => {
    await act(async () => root.render(<LocaleProvider>
      <ExpressionPreview score={score} measure={1} annotations={annotations} onBeforePlay={onBeforePlay} onApply={onApply}/>
      <ExpressionPreview score={score} measure={1} annotations={annotations} onBeforePlay={onBeforePlay} onApply={onApply}/>
    </LocaleProvider>));
    await click("B 変化を聴く");
    if (alreadyPlaying) await act(async () => mocks.ready[0]());
    const previousStops = mocks.audio[0].stop.mock.calls.length;
    await click("B 変化を聴く", 1);
    expect(mocks.audio[0].stop.mock.calls.length).toBeGreaterThan(previousStops);
    expect([...container.querySelectorAll("button")].filter(button => button.getAttribute("aria-pressed") === "true")).toHaveLength(1);
    await act(async () => { mocks.ready[0](); mocks.ready[1](); });
    expect(mocks.engines[0].start).toHaveBeenCalledTimes(alreadyPlaying ? 1 : 0);
    expect(mocks.engines[1].start).toHaveBeenCalledOnce();
    expect(onApply).not.toHaveBeenCalled();
  });

  it("keeps the saved expression scale, reference and custom instruments across equivalent parent snapshots", async () => {
    const ensemble: PracticeEnsemble = {
      tuning: { ...defaultEnsembleTuning, expressionAmount: 0, responseSeconds: 0.8 },
      leader: "violin",
      reference: {
        version: 1, title: "A quiet phrase", scoreTitle: score.title, workSignature: "test-score", sourcePartId: "violin",
        source: { type: "recorded-input", takeId: "take-1", recordedAt: "2026-09-24" },
        points: [{ beat: 0, tempoRatio: 0.9, gain: 0.8, articulation: 1.1 }, { beat: 4, tempoRatio: 1, gain: 1, articulation: 1 }],
      },
    };
    const space: OrchestraSpace = { enabled: false, listener: { x: 2, z: -1 }, chairs: [
      { id: "custom-horn", partIndex: 0, instrument: "french_horn", x: 3, z: -4, level: 0.7, variation: 0.3 },
      { id: "quiet-violin", partIndex: 1, instrument: "violin", x: -2, z: -3, level: 0 },
    ] };
    await render(false, { ensemble, space });
    await click("B 変化を聴く");
    await render(false, { ensemble: structuredClone(ensemble), space: structuredClone(space) });
    await act(async () => mocks.ready[0]());
    expect(mocks.engines[0].start).toHaveBeenCalledOnce();
    expect(mocks.engines[0].setTuning).toHaveBeenLastCalledWith(ensemble.tuning);
    expect(mocks.engines[0].setReference).toHaveBeenLastCalledWith(ensemble.reference);
    expect(mocks.engines[0].setLeader).toHaveBeenLastCalledWith("violin");
    expect(mocks.engines[0].load.mock.invocationCallOrder[0]).toBeLessThan(mocks.engines[0].setReference.mock.invocationCallOrder[0]);
    expect(mocks.audio[0].configureSpace).toHaveBeenLastCalledWith(space.chairs.map(chair => ({ ...chair, variation: chair.variation ?? 0 })), space.listener, false);
    expect(container.textContent).toContain("設定で表情の反映がオフ");
    const stops = mocks.audio[0].stop.mock.calls.length;
    await render();
    expect(mocks.audio[0].stop.mock.calls.length).toBeGreaterThan(stops);
    await click("B 変化を聴く");
    expect(mocks.engines[0].setTuning).toHaveBeenLastCalledWith(defaultEnsembleTuning);
    expect(mocks.engines[0].setReference).toHaveBeenLastCalledWith(null);
    expect(mocks.engines[0].setLeader).toHaveBeenLastCalledWith("player");
    expect(mocks.audio[0].configureSpace.mock.lastCall[0].map((chair: { instrument: string }) => chair.instrument)).toEqual(["acoustic_grand_piano", "violin"]);
    expect(onApply).not.toHaveBeenCalled();
  });
});
