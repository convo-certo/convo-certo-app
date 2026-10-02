import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { expect, test } from "vitest";
import { prepareStarterBundle } from "./prepare-starter-bundle.mjs";
import { prepareScoreLibrary, verifyScoreLibrary } from "./prepare-score-library.mjs";

function fixture() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "convocerto-starter-")));
  const put = (path, text) => { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), text); };
  const xml = '<score-partwise><work><work-title>Mozart II</work-title></work></score-partwise>';
  const source = { id: "mozart-k622-2", title: "Mozart II", scoreLicense: "CC0-1.0", scoreSource: "https://example.test/score", sha256: createHash("sha256").update(xml).digest("hex"), datasetLicense: "CC-BY-4.0", metadata: { license_url: "https://creativecommons.org/publicdomain/zero/1.0/" } };
  put("index.html", "<html>App</html>");
  put("scores/sample-duet.musicxml", "sample duet bytes");
  put("scores/research-only.score.json", "local edition".repeat(500));
  put("scores/extra.musicxml", "research score".repeat(500));
  put("repertoire/ensemble/mozart-k622-2.musicxml", xml);
  put("repertoire/ensemble/mozart-k622-1.musicxml", "other movement".repeat(500));
  put("repertoire/ensemble/ConvoCerto-MusicXML.zip", "large archive".repeat(500));
  put("repertoire/ensemble/pdmx-wind-candidates.json", "unbundled candidates");
  put("repertoire/local/private.json", "local private edition");
  put("repertoire/mozart-k622-2.json", "old MIDI fallback".repeat(500));
  put("repertoire/ensemble/catalog.json", JSON.stringify([source, { ...source, id: "other" }]));
  put("repertoire/ensemble/sources.json", JSON.stringify([source, { ...source, id: "other" }]));
  put("repertoire/ensemble/README.md", "PDMX authors and CC BY 4.0 attribution");
  put("repertoire/SOURCES.md", "# Sources\n\nOld fallback attribution\n\n## Instrument recordings\nFluidR3 by Frank Wen / Benjamin Gleitzman. CC BY 3.0. Samples for 26 instruments.\n");
  put("credits.html", readFileSync(resolve("public/credits.html"), "utf8").replaceAll("data-instrument-bank-count>34", "data-instrument-bank-count>26"));
  const banks = Array.from({ length: 34 }, (_, index) => ({ instrument: `instrument-${index}`, license: "CC-BY-3.0" }));
  put("audio/fluid/sources.json", JSON.stringify(banks));
  for (const bank of banks) put(`audio/fluid/${bank.instrument}/C4.mp3`, "instrument sample bytes");
  put("notices/dependencies.html", "software licenses");
  put("fonts/inter/LICENSE.txt", "SIL OFL text");
  put("assets/app.js", "application bundle");
  return { root, put, source };
}

test("ships exactly the starter scores while retaining full selected attribution and every instrument bank", () => {
  const { root, source } = fixture();
  try {
    const report = prepareStarterBundle(root);
    expect(report.scores).toEqual(["scores/sample-duet.musicxml", "repertoire/ensemble/mozart-k622-2.musicxml"]);
    expect(report.afterBytes).toBeLessThan(report.beforeBytes);
    expect(report.removedBytes).toBe(report.beforeBytes - report.afterBytes);
    expect(report.scoreDataAfterBytes).toBeLessThan(report.scoreDataBeforeBytes);
    for (const path of ["scores/research-only.score.json", "scores/extra.musicxml", "repertoire/ensemble/mozart-k622-1.musicxml", "repertoire/ensemble/ConvoCerto-MusicXML.zip", "repertoire/ensemble/pdmx-wind-candidates.json", "repertoire/local", "repertoire/mozart-k622-2.json"]) expect(existsSync(join(root, path))).toBe(false);
    expect(JSON.parse(readFileSync(join(root, "repertoire/ensemble/sources.json"), "utf8"))).toEqual([source]);
    expect(JSON.parse(readFileSync(join(root, "repertoire/ensemble/catalog.json"), "utf8"))).toEqual([source]);
    expect(readFileSync(join(root, "repertoire/ensemble/README.md"), "utf8")).toContain("PDMX authors and CC BY 4.0");
    expect(readFileSync(join(root, "repertoire/SOURCES.md"), "utf8")).toContain("for 34 instruments.");
    expect(readFileSync(join(root, "repertoire/SOURCES.md"), "utf8")).not.toContain("Old fallback attribution");
    const credits = new DOMParser().parseFromString(readFileSync(join(root, "credits.html"), "utf8"), "text/html");
    for (const locale of ["ja", "en"]) {
      expect(credits.querySelector(`article[lang="${locale}"] [data-instrument-bank-count]`)?.textContent).toBe("34");
      expect(credits.querySelector(`article[lang="${locale}"] a[href="/notices/dependencies.html"]`)).not.toBeNull();
    }
    expect(report.instrumentBanks).toBe(34);
    for (let index = 0; index < 34; index++) expect(readFileSync(join(root, `audio/fluid/instrument-${index}/C4.mp3`), "utf8")).toBe("instrument sample bytes");
    for (const path of ["notices/dependencies.html", "fonts/inter/LICENSE.txt", "assets/app.js"]) expect(existsSync(join(root, path))).toBe(true);
    const repeated = prepareStarterBundle(root);
    expect(repeated.beforeBytes).toBe(report.afterBytes);
    expect(repeated.removedBytes).toBe(0);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("fails before pruning if the starter score is missing or its metadata is incomplete or mismatched", () => {
  const { root, put, source } = fixture();
  try {
    put("repertoire/ensemble/sources.json", JSON.stringify([{ ...source, sha256: "wrong" }]));
    expect(() => prepareStarterBundle(root)).toThrow("attribution");
    expect(existsSync(join(root, "repertoire/ensemble/ConvoCerto-MusicXML.zip"))).toBe(true);
    put("repertoire/ensemble/sources.json", JSON.stringify([source]));
    const credits = readFileSync(join(root, "credits.html"), "utf8");
    put("credits.html", credits.replace("data-instrument-bank-count", "missing-count"));
    expect(() => prepareStarterBundle(root)).toThrow("Japanese and English instrument counts");
    expect(existsSync(join(root, "repertoire/local/private.json"))).toBe(true);
    put("credits.html", credits);
    rmSync(join(root, "scores/sample-duet.musicxml"));
    expect(() => prepareStarterBundle(root)).toThrow();
    expect(existsSync(join(root, "repertoire/local/private.json"))).toBe(true);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("refuses source directories and linked input trees", () => {
  expect(() => prepareStarterBundle(resolve("public"))).toThrow("source assets");
  const { root } = fixture();
  try {
    rmSync(join(root, "scores"), { recursive: true });
    symlinkSync(resolve("public/scores"), join(root, "scores"));
    expect(() => prepareStarterBundle(root)).toThrow("symlink");
    expect(existsSync(join(root, "repertoire/local/private.json"))).toBe(true);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("retains and accounts for the optional compressed library without adding starter cards", () => {
  const { root, put } = fixture();
  try {
    const xml = '<score-partwise><part-list><score-part id="P1"><part-name>Flute</part-name><midi-instrument id="I1"><midi-program>74</midi-program></midi-instrument></score-part></part-list><part id="P1"><measure number="1"/></part></score-partwise>';
    const entry = { id: "additional-flute", title: "Flute piece", composer: "Composer", parts: ["Flute"], measures: 1, category: "chamber", scoreLicense: "CC0-1.0", scoreSource: "https://example.test/score", sha256: createHash("sha256").update(xml).digest("hex"), licenseConflict: false, metadata: { license: "cc-zero", license_conflict: "False", has_paywall: "False", "subset:all_valid": "True" } };
    put("library-source/additional-flute.musicxml", xml);
    put("library-source/catalog.json", JSON.stringify([entry]));
    put("library-source/sources.json", JSON.stringify([entry]));
    put("library-source/README.md", "PDMX attribution and license");
    const libraryPath = join(root, "repertoire/library");
    prepareScoreLibrary({ sourceDirectory: join(root, "library-source"), outputDirectory: libraryPath });
    const library = verifyScoreLibrary(libraryPath);
    const archive = readFileSync(join(libraryPath, "additional-flute.mxl"));
    put("repertoire/library/additional-flute.mxl", "corrupted");
    expect(() => prepareStarterBundle(root, { includeLibrary: true })).toThrow("archive size or hash mismatch");
    expect(existsSync(join(root, "repertoire/local/private.json"))).toBe(true);
    put("repertoire/library/additional-flute.mxl", archive);
    const report = prepareStarterBundle(root, { includeLibrary: true });
    expect(report.scores).toHaveLength(2);
    expect(report.library).toEqual({ scores: 1, bytes: library.bytes });
    expect(verifyScoreLibrary(libraryPath)).toEqual(library);
    expect(readFileSync(join(root, "repertoire/SOURCES.md"), "utf8")).toContain("1 additional compressed MusicXML editions");
    expect(prepareStarterBundle(root, { includeLibrary: true }).removedBytes).toBe(0);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
