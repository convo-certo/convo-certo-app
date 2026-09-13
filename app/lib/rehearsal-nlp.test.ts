import { describe, expect, it } from "vitest";
import { parseRehearsalCommand } from "./rehearsal-nlp";
import { readRehearsalPlan } from "./rehearsal-plan";

describe("rehearsal instructions", () => {
  it("distinguishes absolute tempo from relative changes", () => {
    expect(parseRehearsalCommand("テンポを120にして")).toMatchObject({ type: "set_tempo", tempo: 120 });
    expect(parseRehearsalCommand("テンポ上げて")).toMatchObject({ tempo: 10, tempoMode: "relative" });
    expect(parseRehearsalCommand("テンポを下げて")).toMatchObject({ tempo: -10, tempoMode: "relative" });
    expect(parseRehearsalCommand("テンポ")).toBeNull();
  });
  it("validates a plan against the selected movement", () => {
    const text = JSON.stringify({ version: 1, repertoireId: "mozart-k622-1", annotations: [{ measureNumber: 57, wait: { type: "listen" } }] });
    expect(readRehearsalPlan(text, "mozart-k622-1", 359)[0].measureNumber).toBe(57);
    expect(() => readRehearsalPlan(text, "brahms-op120-2-1", 173)).toThrow();
    expect(() => readRehearsalPlan(text, "mozart-k622-1", 10)).toThrow();
  });
});
