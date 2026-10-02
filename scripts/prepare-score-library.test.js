import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { strToU8, unzipSync, zipSync } from "fflate";
import { expect, test } from "vitest";
import { prepareScoreLibrary, verifyScoreLibrary } from "./prepare-score-library.mjs";

const digest = bytes => createHash("sha256").update(bytes).digest("hex");

function fixture() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "convocerto-library-")));
  const sourceDirectory = join(root, "ensemble");
  const outputDirectory = join(root, "library");
  mkdirSync(sourceDirectory);
  const xml = '<?xml version="1.0"?><score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Flûte &amp; flute</part-name><midi-instrument id="I1"><midi-program>74</midi-program></midi-instrument></score-part><score-part id="P2"><part-name></part-name></score-part></part-list><part id="P1"><measure number="1"/></part><part id="P2"><measure number="1"/></part></score-partwise>';
  const scores = ["flute-edition", "mozart-k622-2", "bach-orchestral-suite-1", "mozart-k581-clarinet-quintet", "tchaikovsky-1812-overture"].map(id => ({ id, title: "Flute edition", composer: "Composer", parts: ["Flûte & flute", ""], measures: 1, category: "chamber", scoreLicense: "CC0-1.0", scoreSource: "https://example.test/score" }));
  const sources = scores.map(score => ({ ...score, sha256: digest(xml), licenseConflict: false, datasetLicense: "CC-BY-4.0", metadata: { license: "cc-zero", license_conflict: "False", has_paywall: "False", "subset:all_valid": "True" } }));
  for (const score of scores) writeFileSync(join(sourceDirectory, `${score.id}.musicxml`), xml);
  writeFileSync(join(sourceDirectory, "catalog.json"), JSON.stringify(scores));
  writeFileSync(join(sourceDirectory, "sources.json"), JSON.stringify(sources));
  writeFileSync(join(sourceDirectory, "README.md"), "PDMX authors and CC BY 4.0 attribution.\n");
  const saveSources = () => writeFileSync(join(sourceDirectory, "sources.json"), JSON.stringify(sources));
  const saveScores = () => writeFileSync(join(sourceDirectory, "catalog.json"), JSON.stringify(scores));
  return { root, sourceDirectory, outputDirectory, scores, sources, xml, saveSources, saveScores };
}

test("packages additional editions deterministically with intact XML, instrument programs, and complete attribution", () => {
  const state = fixture();
  try {
    const report = prepareScoreLibrary(state);
    expect(report.count).toBe(2);
    expect(Object.keys(report.excluded)).toEqual(["mozart-k622-2", "bach-orchestral-suite-1", "mozart-k581-clarinet-quintet"]);
    const catalog = JSON.parse(readFileSync(join(state.outputDirectory, "catalog.json")));
    expect(catalog.version).toBe(1);
    expect(catalog.scores[0].parts).toEqual([{ name: "Flûte & flute", program: 74 }, { name: "", program: null }]);
    expect(catalog.scores[1]).toMatchObject({ scope: "excerpt", title: "チャイコフスキー：序曲《1812年》フィナーレ抜粋" });
    for (const score of catalog.scores) {
      const archive = readFileSync(join(state.outputDirectory, score.file));
      const entries = unzipSync(archive);
      expect(Buffer.from(entries["score.musicxml"]).toString("utf8")).toBe(state.xml);
      expect(Buffer.from(entries["META-INF/container.xml"]).toString("utf8")).toContain('full-path="score.musicxml"');
      expect(score.sha256).toBe(digest(archive));
      expect(score.xmlSha256).toBe(digest(state.xml));
    }
    expect(JSON.parse(readFileSync(join(state.outputDirectory, "sources.json")))).toEqual([state.sources[0], state.sources[4]]);
    expect(readFileSync(join(state.outputDirectory, "README.md"), "utf8")).toContain("PDMX authors and CC BY 4.0");
    const before = new Map(readdirSync(state.outputDirectory).map(name => [name, digest(readFileSync(join(state.outputDirectory, name)))]));
    expect(prepareScoreLibrary(state)).toEqual(report);
    for (const [name, sha256] of before) expect(digest(readFileSync(join(state.outputDirectory, name)))).toBe(sha256);
    expect(verifyScoreLibrary(state.outputDirectory)).toEqual({ count: report.count, bytes: report.bytes, files: report.files });
  } finally { rmSync(state.root, { recursive: true, force: true }); }
});

test("rejects mismatched source hashes or rights before replacing an existing library", () => {
  const state = fixture();
  try {
    prepareScoreLibrary(state);
    const before = readFileSync(join(state.outputDirectory, "catalog.json"));
    state.sources[0].sha256 = "0".repeat(64);
    state.saveSources();
    expect(() => prepareScoreLibrary(state)).toThrow("Original score bytes or attribution mismatch");
    expect(readFileSync(join(state.outputDirectory, "catalog.json"))).toEqual(before);
    state.sources[0].sha256 = digest(state.xml);
    state.sources[0].metadata.license_conflict = "True";
    state.saveSources();
    expect(() => prepareScoreLibrary(state)).toThrow("Original score bytes or attribution mismatch");
    expect(readFileSync(join(state.outputDirectory, "catalog.json"))).toEqual(before);
  } finally { rmSync(state.root, { recursive: true, force: true }); }
});

test("verifies archive bytes, original XML hashes, metadata and exact file membership", () => {
  const state = fixture();
  try {
    prepareScoreLibrary(state);
    const path = join(state.outputDirectory, "catalog.json");
    const raw = readFileSync(path);
    const catalog = JSON.parse(raw);
    catalog.scores[0].xmlSha256 = "0".repeat(64);
    writeFileSync(path, JSON.stringify(catalog));
    expect(() => verifyScoreLibrary(state.outputDirectory)).toThrow("attribution mismatch");
    writeFileSync(path, raw);
    catalog.scores[0].xmlSha256 = state.sources[0].sha256;
    catalog.scores[0].parts[0].program = 1;
    writeFileSync(path, JSON.stringify(catalog));
    expect(() => verifyScoreLibrary(state.outputDirectory)).toThrow("content metadata mismatch");
    writeFileSync(path, raw);
    writeFileSync(join(state.outputDirectory, "unexpected.xml"), "private score");
    expect(() => verifyScoreLibrary(state.outputDirectory)).toThrow("Unexpected files");
    rmSync(join(state.outputDirectory, "unexpected.xml"));
    writeFileSync(join(state.outputDirectory, "flute-edition.mxl"), "broken");
    expect(() => verifyScoreLibrary(state.outputDirectory)).toThrow("archive size or hash mismatch");
  } finally { rmSync(state.root, { recursive: true, force: true }); }
});

test("rejects source/output overlap, unsafe IDs and linked paths", () => {
  const state = fixture();
  try {
    expect(() => prepareScoreLibrary({ ...state, outputDirectory: state.sourceDirectory })).toThrow("separate from source");
    expect(() => prepareScoreLibrary({ ...state, outputDirectory: state.root })).toThrow("separate from source");
    state.scores[0].id = "../private";
    state.saveScores();
    expect(() => prepareScoreLibrary(state)).toThrow("Invalid score ID");
    state.scores[0].id = "flute-edition";
    state.saveScores();
    const path = join(state.sourceDirectory, "flute-edition.musicxml");
    rmSync(path);
    symlinkSync(join(state.sourceDirectory, "mozart-k622-2.musicxml"), path);
    expect(() => prepareScoreLibrary(state)).toThrow("symlink");
    expect(existsSync(state.outputDirectory)).toBe(false);
    rmSync(path);
    writeFileSync(path, state.xml);
    symlinkSync(join(state.root, "missing-target"), state.outputDirectory);
    expect(() => prepareScoreLibrary(state)).toThrow("symlink");
  } finally { rmSync(state.root, { recursive: true, force: true }); }
});

test("checks decompressed XML hashes and rejects declared expansion beyond the import limit", () => {
  const state = fixture();
  try {
    prepareScoreLibrary(state);
    const catalogPath = join(state.outputDirectory, "catalog.json");
    const catalog = JSON.parse(readFileSync(catalogPath));
    const score = catalog.scores[0];
    const archivePath = join(state.outputDirectory, score.file);
    const original = readFileSync(archivePath);
    const entries = unzipSync(original);
    entries["score.musicxml"] = strToU8("<score-partwise/>");
    const changed = zipSync(entries);
    score.bytes = changed.length;
    score.sha256 = digest(changed);
    writeFileSync(archivePath, changed);
    writeFileSync(catalogPath, JSON.stringify(catalog));
    expect(() => verifyScoreLibrary(state.outputDirectory)).toThrow("Original XML hash mismatch");
    const oversized = Buffer.from(original);
    const central = oversized.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    expect(central).toBeGreaterThan(0);
    oversized.writeUInt32LE(60_000_001, central + 24);
    score.bytes = oversized.length;
    score.sha256 = digest(oversized);
    writeFileSync(archivePath, oversized);
    writeFileSync(catalogPath, JSON.stringify(catalog));
    expect(() => verifyScoreLibrary(state.outputDirectory)).toThrow("expanded size limit");
  } finally { rmSync(state.root, { recursive: true, force: true }); }
});
