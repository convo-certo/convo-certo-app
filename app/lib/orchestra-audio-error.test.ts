import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OrchestraAudio } from "./orchestra-audio";
import { OrchestraAudioError, orchestraAudioErrorMessage, type OrchestraAudioErrorCode } from "./orchestra-audio-error";
import type { ScorePart } from "./types";

vi.mock("./instrument-palette", async importOriginal => ({
  ...await importOriginal<typeof import("./instrument-palette")>(),
  placementInstruments: [],
}));

class Context {
  state = "running";
  currentTime = 0;
  destination = {};
  onstatechange = null;
  resume = vi.fn(async () => { this.state = "running"; });
  close = vi.fn(async () => { this.state = "closed"; });
  decodeAudioData = vi.fn(async (_bytes: ArrayBuffer) => ({ numberOfChannels: 1, duration: 1, getChannelData: () => new Float32Array([0.2]) }));
  createGain() { return { gain: { value: 1 }, connect: (next: unknown) => next }; }
  createDynamicsCompressor() { return { threshold: { value: 0 }, ratio: { value: 0 }, connect: (next: unknown) => next }; }
}

let context: Context;
let audio: OrchestraAudio;
beforeEach(() => {
  vi.stubGlobal("AudioContext", class extends Context { constructor() { super(); context = this; } });
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(4) })));
  audio = new OrchestraAudio();
});
afterEach(() => { audio.dispose(); vi.useRealTimers(); vi.unstubAllGlobals(); });

const part: ScorePart = { id: "P1", name: "Clarinet", isSolo: true, notes: [] };

describe("audio failure classification", () => {
  it("requires reopening an uninitialized or closed score", async () => {
    await expect(audio.resume()).rejects.toMatchObject({ code: "closed" });
    await audio.prepare([]);
    context.state = "closed";
    await expect(audio.resume()).rejects.toMatchObject({ code: "closed" });
  });

  it("identifies unavailable audio during preparation", async () => {
    vi.stubGlobal("AudioContext", undefined);
    await expect(audio.prepare([])).rejects.toMatchObject({ code: "unavailable" });
  });

  it.each(["NotAllowedError", "SecurityError"])("keeps %s distinct from other resume failures", async name => {
    await audio.prepare([]);
    const cause = new DOMException("ブラウザからの説明", name);
    context.resume.mockRejectedValue(cause);
    await expect(audio.resume()).rejects.toMatchObject({ code: "resume-blocked", cause });
  });

  it("preserves the diagnostic cause without showing its untranslated message", async () => {
    await audio.prepare([]);
    const cause = new Error("音声出力に失敗しました");
    context.resume.mockRejectedValue(cause);
    const error = await audio.resume().catch(error => error);
    expect(error).toMatchObject({ code: "resume-failed", cause });
    expect(orchestraAudioErrorMessage(error, "en")).toBe("Could not restore audio. Check your output device and try again.");
  });

  it("does not report success when resume resolves but audio remains interrupted", async () => {
    await audio.prepare([]);
    context.state = "suspended";
    context.resume.mockResolvedValue(undefined);
    await expect(audio.resume()).rejects.toMatchObject({ code: "resume-interrupted" });
  });

  it("times out a stalled resume and clears its timer", async () => {
    vi.useFakeTimers();
    await audio.prepare([]);
    context.resume.mockImplementation(() => new Promise<void>(() => {}));
    const result = audio.resume().catch(error => error);
    await vi.advanceTimersByTimeAsync(5000);
    expect(await result).toMatchObject({ code: "resume-timeout" });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("reports an HTTP failure as missing sounds rather than an invalid score", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false })));
    await expect(audio.prepare([part])).rejects.toMatchObject({ code: "sample-load", instrument: "clarinet" });
  });

  it("distinguishes unreadable samples from silent samples", async () => {
    await audio.prepare([]);
    const cause = new DOMException("破損した音源", "EncodingError");
    context.decodeAudioData.mockRejectedValue(cause);
    await expect(audio.prepare([part])).rejects.toMatchObject({ code: "sample-decode", instrument: "clarinet", cause });
    context.decodeAudioData.mockResolvedValue({ numberOfChannels: 1, duration: 1, getChannelData: () => new Float32Array(4) });
    await expect(audio.prepare([part])).rejects.toMatchObject({ code: "sample-silent", instrument: "clarinet" });
  });
});

describe("localized audio guidance", () => {
  it("keeps actionable failure distinctions in both languages", () => {
    const codes: OrchestraAudioErrorCode[] = ["unavailable", "closed", "resume-timeout", "resume-blocked", "resume-interrupted", "resume-failed", "sample-load", "sample-decode", "sample-silent"];
    const english = codes.map(code => orchestraAudioErrorMessage(new OrchestraAudioError(code), "en"));
    const japanese = codes.map(code => orchestraAudioErrorMessage(new OrchestraAudioError(code), "ja"));
    expect(new Set(english).size).toBe(codes.length);
    expect(new Set(japanese).size).toBe(codes.length);
    for (const message of english) expect(message).not.toMatch(/[ぁ-んァ-ン一-龯]/);
    for (const message of japanese) expect(message).toMatch(/[ぁ-んァ-ン一-龯]/);
    expect(orchestraAudioErrorMessage(new OrchestraAudioError("closed"), "en")).toContain("Reopen the score");
    expect(orchestraAudioErrorMessage(new OrchestraAudioError("sample-silent", { instrument: "clarinet" }), "en")).toContain("(Clarinet)");
    expect(orchestraAudioErrorMessage(new OrchestraAudioError("sample-silent", { instrument: "clarinet" }), "ja")).toContain("(クラリネット)");
    expect(orchestraAudioErrorMessage(new Error("原文"), "en")).not.toContain("原文");
  });
});
