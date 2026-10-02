import { readFileSync } from "node:fs";
import { expect, it, vi } from "vitest";
import { defaultEnsembleTuning } from "./ensemble-tuning";
import { readPracticeFile, readPracticeFileUpload } from "./practice-file";
import { PracticeFileError, practiceFileErrorMessage, type PracticeFileErrorCode } from "./practice-file-error";

const xml = readFileSync("public/scores/sample-duet.musicxml", "utf8");
const session = { version: 1, seatId: "P1", instrumentKey: -2, shift: -2, tuning: 442, tempo: 84, beat: 4, startMeasure: 2, loopEnd: 4, loopEnabled: true, mode: "accompany", countInBars: 1, click: false, volume: 65, midiWritten: true };
const file = (settings: unknown = session, scoreXML = xml) => JSON.stringify({ format: "convocerto-practice", version: 1, score: { title: "My practice", xml: scoreXML, session: settings } });
const reference = { version: 1, title: "Phrasing", scoreTitle: "Duet", sourcePartId: "P1", workSignature: "another-score", source: { type: "recorded-input", takeId: "test", recordedAt: "2026-09-30" }, points: [0, 1, 2].map(beat => ({ beat, tempoRatio: 1, gain: 1, articulation: 1 })) };
const withReference = (value: unknown) => file({ ...session, ensemble: { leader: "player", tuning: defaultEnsembleTuning, reference: value } });

const invalidFiles: { name: string; input: string; code: PracticeFileErrorCode; ja: string; en: string }[] = [
  { name: "damaged JSON", input: "{", code: "json-invalid", ja: "JSONが壊れ", en: "damaged JSON" },
  { name: "unsupported version", input: file().replace('"version":1', '"version":2'), code: "format-unsupported", ja: "対応する", en: "not a supported" },
  { name: "malformed embedded XML", input: file(session, "<score-partwise>"), code: "score-invalid", ja: "楽譜を読み込めません", en: "score inside" },
  { name: "embedded score without parts", input: file(session, '<score-partwise version="4.0"><part-list/></score-partwise>'), code: "score-invalid", ja: "楽譜を読み込めません", en: "score inside" },
  { name: "invalid settings", input: file({ ...session, tempo: -1 }), code: "settings-invalid", ja: "練習設定が不正", en: "invalid settings" },
  { name: "invalid ensemble tuning", input: file({ ...session, ensemble: { leader: "player", tuning: { ...defaultEnsembleTuning, responseSeconds: 100 } } }), code: "settings-invalid", ja: "練習設定が不正", en: "invalid settings" },
  { name: "missing saved part", input: file({ ...session, seatId: "not-in-this-score" }), code: "seat-missing", ja: "担当が楽譜にありません", en: "saved part is missing" },
  { name: "invalid reference format", input: withReference({ version: 99 }), code: "reference-invalid", ja: "表現データが不正", en: "expression data is invalid" },
  { name: "invalid reference points", input: withReference({ ...reference, points: [null, null, null] }), code: "reference-invalid", ja: "表現データが不正", en: "expression data is invalid" },
  { name: "reference for another score", input: withReference(reference), code: "reference-mismatch", ja: "一致しません", en: "does not match" },
];

it.each(invalidFiles)("classifies $name and translates the same failure after a locale change", ({ input, code, ja, en }) => {
  let failure: unknown;
  try { readPracticeFile(input); } catch (error) { failure = error; }
  expect(failure).toBeInstanceOf(PracticeFileError);
  expect(failure).toMatchObject({ code });
  expect(practiceFileErrorMessage(failure, "en")).toContain(en);
  expect(practiceFileErrorMessage(failure, "ja")).toContain(ja);
  expect(practiceFileErrorMessage(failure, "en")).not.toMatch(/[\u3040-\u30ff\u4e00-\u9fff]/);
  expect(practiceFileErrorMessage(failure, "en")).toMatch(/Choose|Export|export/);
});

it("checks upload size before reading and checks UTF-8 bytes for text imports", async () => {
  const text = vi.fn(async () => file());
  await expect(readPracticeFileUpload({ size: 30_000_001, text })).rejects.toMatchObject({ code: "file-too-large" });
  expect(text).not.toHaveBeenCalled();
  expect(() => readPracticeFile("あ".repeat(10_000_001))).toThrowError(expect.objectContaining({ code: "file-too-large" }));
  const failure = new PracticeFileError("file-too-large");
  expect(practiceFileErrorMessage(failure, "en")).toContain("30 MB");
  expect(practiceFileErrorMessage(failure, "ja")).toContain("30MB");
});

it("separates file read failure from JSON validation without exposing the platform exception", async () => {
  const cause = new Error("非公開のファイルパス /private/practice.json");
  const failedRead = readPracticeFileUpload({ size: 100, text: async () => { throw cause; } });
  await expect(failedRead).rejects.toMatchObject({ code: "file-unreadable", cause });
  const failure = await failedRead.catch(error => error);
  expect(practiceFileErrorMessage(failure, "en")).toContain("Save a local copy");
  expect(practiceFileErrorMessage(failure, "ja")).toContain("選び直してください");
  expect(practiceFileErrorMessage(failure, "en")).not.toContain(cause.message);
  await expect(readPracticeFileUpload({ size: 1, text: async () => "{" })).rejects.toMatchObject({ code: "json-invalid" });
});

it("keeps valid file imports unchanged", async () => {
  const contents = file();
  await expect(readPracticeFileUpload({ size: new TextEncoder().encode(contents).length, text: async () => contents })).resolves.toEqual(readPracticeFile(contents));
});

it("uses trusted localized recovery text instead of raw exception messages", () => {
  const error = new PracticeFileError("settings-invalid", { cause: new Error("raw details") });
  error.message = "raw details";
  for (const locale of ["ja", "en"] as const) {
    expect(practiceFileErrorMessage(error, locale)).not.toContain("raw details");
    expect(practiceFileErrorMessage(new Error("raw details"), locale)).toBe(practiceFileErrorMessage(new PracticeFileError("import-failed"), locale));
  }
  expect(practiceFileErrorMessage(new Error("raw details"), "en")).toContain("Reload My scores");
});
