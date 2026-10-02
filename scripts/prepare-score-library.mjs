import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { JSDOM } from "jsdom";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

const repository = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const starterId = "mozart-k622-2";
export const heldScores = {
  "bach-orchestral-suite-1": "The XML identifies a march from BWV 207, while the catalogue identifies BWV 1066.",
  "mozart-k581-clarinet-quintet": "The converted parts have inconsistent measure counts and require musical review.",
};
const excerpts = {
  "tchaikovsky-1812-overture": "チャイコフスキー：序曲《1812年》フィナーレ抜粋",
  "bach-orchestral-suite-2": "J.S.バッハ：管弦楽組曲第2番 BWV 1067 第3曲 サラバンド",
  "bizet-arlesienne-brass": "ビゼー：《アルルの女》三人の王の行進 金管合奏版",
  "bizet-arlesienne-brass-expanded": "ビゼー：《アルルの女》三人の王の行進 金管合奏版（拡張編成）",
  "handel-water-music-wind-ensemble": "ヘンデル：《水上の音楽》ヘ長調組曲より 管楽合奏版",
};
const composers = {
  "library-152280": "Antonín Dvořák",
  "library-146600": "Antonín Dvořák",
  "library-26542": "Antonín Dvořák",
  "library-181228": "Pyotr Ilyich Tchaikovsky",
};
const metadataFiles = ["catalog.json", "sources.json", "README.md"];
const archiveEntries = ["mimetype", "META-INF/container.xml", "score.musicxml"];
const maxArchiveBytes = 25_000_000;
const maxExpandedBytes = 60_000_000;
const container = '<?xml version="1.0" encoding="UTF-8"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="score.musicxml" media-type="application/vnd.recordare.musicxml+xml"/></rootfiles></container>';
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const validId = id => typeof id === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id);

function assertUnlinked(path) {
  let cursor = resolve(path);
  while (true) {
    try {
      if (lstatSync(cursor).isSymbolicLink()) throw new Error(`Score library path must not be a symlink: ${path}`);
    } catch (error) { if (error.code !== "ENOENT") throw error; }
    const parent = dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
}

function fileBytes(directory, filename) {
  if (isAbsolute(filename) || filename !== filename.split(/[\\/]/).at(-1)) throw new Error(`Unsafe score library filename: ${filename}`);
  const path = join(directory, filename);
  assertUnlinked(path);
  if (!lstatSync(path).isFile()) throw new Error(`Score library input must be a regular file: ${filename}`);
  return readFileSync(path);
}

function scoreParts(xml) {
  const list = xml.toString("utf8").match(/<part-list(?:\s[^>]*)?>[\s\S]*?<\/part-list>/)?.[0];
  if (!list) throw new Error("Score part-list is missing.");
  const dom = new JSDOM(list, { contentType: "text/xml" });
  try {
    return [...dom.window.document.querySelectorAll("part-list > score-part")].map(part => {
      const value = part.querySelector("midi-instrument > midi-program")?.textContent?.trim();
      const program = value ? Number(value) : null;
      if (program !== null && (!Number.isInteger(program) || program < 1 || program > 128)) throw new Error("Score MIDI program must be between 1 and 128.");
      return { name: part.querySelector("part-name")?.textContent ?? "", program };
    });
  } finally { dom.window.close(); }
}

function verifyArchive(bytes, entry) {
  if (bytes.length !== entry.bytes || bytes.length > maxArchiveBytes || hash(bytes) !== entry.sha256) throw new Error(`Score archive size or hash mismatch: ${entry.id}`);
  let expanded = 0;
  const names = new Set();
  const archive = unzipSync(bytes, { filter(file) {
    expanded += file.originalSize;
    if (expanded > maxExpandedBytes) throw new Error(`Score archive exceeds the expanded size limit: ${entry.id}`);
    if (!archiveEntries.includes(file.name) || names.has(file.name)) throw new Error(`Unexpected score archive entry: ${file.name}`);
    names.add(file.name);
    return true;
  } });
  if (Object.keys(archive).length !== archiveEntries.length || archiveEntries.some(name => !archive[name])) throw new Error(`Incomplete score archive: ${entry.id}`);
  if (strFromU8(archive.mimetype) !== "application/vnd.recordare.musicxml" || strFromU8(archive["META-INF/container.xml"]) !== container) throw new Error(`Invalid MusicXML container: ${entry.id}`);
  const xml = archive["score.musicxml"];
  if (hash(xml) !== entry.xmlSha256) throw new Error(`Original XML hash mismatch: ${entry.id}`);
  return xml;
}

export function verifyScoreLibrary(directory) {
  assertUnlinked(directory);
  const catalog = JSON.parse(fileBytes(directory, "catalog.json"));
  const sources = JSON.parse(fileBytes(directory, "sources.json"));
  if (catalog.version !== 1 || !Array.isArray(catalog.scores) || !catalog.scores.length || !Array.isArray(sources) || sources.length !== catalog.scores.length) throw new Error("Invalid score library manifest.");
  const sourceById = new Map(sources.map(source => [source.id, source]));
  if (sourceById.size !== sources.length) throw new Error("Duplicate score source record.");
  const files = [...metadataFiles];
  const ids = new Set();
  for (const score of catalog.scores) {
    if (!validId(score.id) || ids.has(score.id) || score.id === starterId || Object.hasOwn(heldScores, score.id) || score.file !== `${score.id}.mxl`) throw new Error(`Invalid score library entry: ${score.id}`);
    ids.add(score.id);
    if (typeof score.title !== "string" || !score.title.trim() || typeof score.composer !== "string" || !Number.isInteger(score.measures) || score.measures < 1 || !["orchestra", "wind", "chamber", "solo"].includes(score.category) || !["edition", "excerpt", "solo"].includes(score.scope) || !Array.isArray(score.parts) || !score.parts.length || score.parts.some(part => typeof part.name !== "string" || (part.program !== null && (!Number.isInteger(part.program) || part.program < 1 || part.program > 128)))) throw new Error(`Invalid score library metadata: ${score.id}`);
    const source = sourceById.get(score.id);
    if (!source || source.sha256 !== score.xmlSha256 || source.scoreSource !== score.scoreSource || source.scoreLicense !== score.scoreLicense || source.licenseConflict !== false || !["CC0-1.0", "PDM-1.0"].includes(score.scoreLicense) || !/^https:\/\//.test(score.scoreSource)) throw new Error(`Score attribution mismatch: ${score.id}`);
    const xml = verifyArchive(fileBytes(directory, score.file), score);
    if (JSON.stringify(scoreParts(Buffer.from(xml))) !== JSON.stringify(score.parts) || source.measures !== score.measures || source.category !== score.category) throw new Error(`Score content metadata mismatch: ${score.id}`);
    files.push(score.file);
  }
  const actual = readdirSync(directory);
  if (actual.length !== files.length || actual.some(name => !files.includes(name))) throw new Error("Unexpected files in score library.");
  const bytes = files.reduce((total, name) => total + fileBytes(directory, name).length, 0);
  return { count: catalog.scores.length, bytes, files };
}

export function prepareScoreLibrary({ sourceDirectory = join(repository, "public/repertoire/ensemble"), outputDirectory = join(repository, "public/repertoire/library") } = {}) {
  const sourceRoot = resolve(sourceDirectory);
  const outputRoot = resolve(outputDirectory);
  const pathFromOutput = relative(outputRoot, sourceRoot);
  const pathFromSource = relative(sourceRoot, outputRoot);
  if (!pathFromOutput || (!pathFromOutput.startsWith("..") && !isAbsolute(pathFromOutput)) || (!pathFromSource.startsWith("..") && !isAbsolute(pathFromSource))) throw new Error("Score library output must be separate from source assets.");
  assertUnlinked(sourceRoot);
  assertUnlinked(outputRoot);
  if (existsSync(outputRoot)) verifyScoreLibrary(outputRoot);
  const catalog = JSON.parse(fileBytes(sourceRoot, "catalog.json"));
  const sources = JSON.parse(fileBytes(sourceRoot, "sources.json"));
  const attribution = fileBytes(sourceRoot, "README.md").toString("utf8");
  if (!Array.isArray(catalog) || !Array.isArray(sources) || new Set(catalog.map(score => score.id)).size !== catalog.length || new Set(sources.map(score => score.id)).size !== sources.length) throw new Error("Invalid source catalogue.");
  const sourceById = new Map(sources.map(source => [source.id, source]));
  const selected = catalog.filter(score => score.id !== starterId && !Object.hasOwn(heldScores, score.id));
  if (!selected.length) throw new Error("No additional scores are available.");
  const scores = [];
  const selectedSources = [];
  const files = new Map();
  const date = new Date(1980, 0, 1);
  for (const item of selected) {
    if (!validId(item.id)) throw new Error(`Invalid score ID: ${item.id}`);
    const source = sourceById.get(item.id);
    const xml = fileBytes(sourceRoot, `${item.id}.musicxml`);
    if (!source || hash(xml) !== source.sha256 || item.scoreLicense !== source.scoreLicense || item.scoreSource !== source.scoreSource || source.licenseConflict !== false || !["cc-zero", "publicdomain"].includes(source.metadata?.license) || source.metadata?.license_conflict !== "False" || source.metadata?.has_paywall !== "False" || source.metadata?.["subset:all_valid"] !== "True") throw new Error(`Original score bytes or attribution mismatch: ${item.id}`);
    if (/<(?:[A-Za-z0-9_]+:)?rights(?:\s|>)/i.test(xml.toString("utf8"))) throw new Error(`Score contains an unreviewed rights statement: ${item.id}`);
    if (xml.length + strToU8(container).length + 34 > maxExpandedBytes) throw new Error(`Score exceeds the expanded size limit: ${item.id}`);
    const parts = scoreParts(xml);
    if (!Array.isArray(item.parts) || JSON.stringify(parts.map(part => part.name)) !== JSON.stringify(item.parts)) throw new Error(`Score part names mismatch: ${item.id}`);
    const archive = zipSync({ mimetype: [strToU8("application/vnd.recordare.musicxml"), { level: 0, mtime: date }], "META-INF/container.xml": [strToU8(container), { mtime: date }], "score.musicxml": [xml, { mtime: date }] }, { level: 9 });
    const score = { id: item.id, title: excerpts[item.id] ?? item.title, composer: composers[item.id] ?? item.composer, parts, measures: item.measures, category: item.category, scoreLicense: item.scoreLicense, scoreSource: item.scoreSource, scope: item.category === "solo" ? "solo" : Object.hasOwn(excerpts, item.id) ? "excerpt" : "edition", file: `${item.id}.mxl`, bytes: archive.length, sha256: hash(archive), xmlSha256: source.sha256 };
    verifyArchive(archive, score);
    scores.push(score);
    selectedSources.push(source);
    files.set(score.file, archive);
  }
  files.set("catalog.json", JSON.stringify({ version: 1, scores }, null, 2) + "\n");
  files.set("sources.json", JSON.stringify(selectedSources, null, 2) + "\n");
  files.set("README.md", `# ConvoCerto additional score library\n\n${scores.length} additional score editions are included as compressed MusicXML (MXL). The two starter cards remain separate. Each MXL contains the original MusicXML bytes unchanged; catalog.json records both archive and original XML SHA-256 hashes. sources.json retains the complete per-score source metadata.\n\nTitles identify known excerpts. A score edition may contain one movement, several movements, or an arrangement; the entry count is not a count of distinct compositions. Original notation and arrangement credits remain in the XML. Musical proofreading against original editions is not complete. The app shows playback limitations after opening a score.\n\n## Source attribution\n\n${attribution}`);
  mkdirSync(dirname(outputRoot), { recursive: true });
  const staging = mkdtempSync(join(dirname(outputRoot), ".score-library-"));
  try {
    for (const [filename, bytes] of files) writeFileSync(join(staging, filename), bytes, { flag: "wx" });
    const report = verifyScoreLibrary(staging);
    if (existsSync(outputRoot)) rmSync(outputRoot, { recursive: true });
    renameSync(staging, outputRoot);
    return { ...report, excluded: { [starterId]: "Included separately as a starter score.", ...heldScores } };
  } finally { rmSync(staging, { recursive: true, force: true }); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const report = prepareScoreLibrary();
  console.log(`Additional score library: ${report.count} editions, ${(report.bytes / 1_000_000).toFixed(2)} MB including attribution.`);
}
