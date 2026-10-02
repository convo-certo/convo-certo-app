import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { verifyScoreLibrary } from "./prepare-score-library.mjs";

const repository = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const starterId = "mozart-k622-2";
const scorePaths = ["scores/sample-duet.musicxml", `repertoire/ensemble/${starterId}.musicxml`];
const repertoireFiles = new Set(["SOURCES.md", `ensemble/${starterId}.musicxml`, "ensemble/catalog.json", "ensemble/sources.json", "ensemble/README.md"]);

function directoryBytes(directory) {
  let total = 0;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) total += directoryBytes(path);
    else total += lstatSync(path).size;
  }
  return total;
}

function requireFile(root, relativePath) {
  let path = root;
  for (const segment of relativePath.split("/")) {
    path = join(path, segment);
    if (lstatSync(path).isSymbolicLink()) throw new Error(`Starter bundle input must not be a symlink: ${relativePath}`);
  }
  if (!lstatSync(path).isFile()) throw new Error(`Starter bundle input is not a file: ${relativePath}`);
  return readFileSync(path);
}

function retainFiles(directory, allowed, prefix = "") {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const name = prefix + entry.name;
    const path = join(directory, entry.name);
    if (entry.isDirectory() && [...allowed].some(file => file.startsWith(name + "/"))) retainFiles(path, allowed, name + "/");
    else if (!allowed.has(name)) rmSync(path, { recursive: true, force: true });
  }
}

export function prepareStarterBundle(directory, { includeLibrary = false } = {}) {
  const root = realpathSync(directory);
  const source = realpathSync(join(repository, "public"));
  if (root === source || !relative(source, root).startsWith("..") || root === realpathSync(repository)) throw new Error("Starter packaging must target a build directory, never the repository or public source assets.");
  requireFile(root, "index.html");
  for (const path of scorePaths) requireFile(root, path);
  const catalog = JSON.parse(requireFile(root, "repertoire/ensemble/catalog.json"));
  const sources = JSON.parse(requireFile(root, "repertoire/ensemble/sources.json"));
  const audio = JSON.parse(requireFile(root, "audio/fluid/sources.json"));
  const credits = requireFile(root, "credits.html").toString("utf8");
  const repertoireNotes = requireFile(root, "repertoire/SOURCES.md").toString("utf8");
  requireFile(root, "repertoire/ensemble/README.md");
  if (!Array.isArray(catalog) || !Array.isArray(sources) || !Array.isArray(audio)) throw new Error("Starter bundle metadata must contain arrays.");
  const selectedCatalog = catalog.filter(item => item.id === starterId);
  const selectedSources = sources.filter(item => item.id === starterId);
  if (selectedCatalog.length !== 1 || selectedSources.length !== 1) throw new Error("Starter Mozart score must have one catalogue entry and one source record.");
  const sourceRecord = selectedSources[0];
  const scoreHash = createHash("sha256").update(requireFile(root, scorePaths[1])).digest("hex");
  if (sourceRecord.sha256 !== scoreHash || sourceRecord.scoreLicense !== selectedCatalog[0].scoreLicense || sourceRecord.scoreSource !== selectedCatalog[0].scoreSource) throw new Error("Starter score bytes or attribution do not match the catalogue.");
  const instrumentNotes = repertoireNotes.match(/## Instrument recordings\n[\s\S]*/)?.[0];
  if (!instrumentNotes) throw new Error("Instrument source attribution is missing.");
  const countMarker = /(<span data-instrument-bank-count>)\d+(<\/span>)/g;
  if ([...credits.matchAll(countMarker)].length !== 2) throw new Error("Japanese and English instrument counts are missing from the credits.");
  const starterCredits = credits.replace(countMarker, `$1${audio.length}$2`);
  const library = includeLibrary ? verifyScoreLibrary(join(root, "repertoire/library")) : null;
  const allowedRepertoire = new Set(repertoireFiles);
  if (library) for (const file of library.files) allowedRepertoire.add(`library/${file}`);
  const beforeBytes = directoryBytes(root);
  const scoreDataBeforeBytes = directoryBytes(join(root, "scores")) + directoryBytes(join(root, "repertoire"));
  retainFiles(join(root, "scores"), new Set(["sample-duet.musicxml"]));
  retainFiles(join(root, "repertoire"), allowedRepertoire);
  writeFileSync(join(root, "repertoire/ensemble/catalog.json"), JSON.stringify(selectedCatalog, null, 2) + "\n");
  writeFileSync(join(root, "repertoire/ensemble/sources.json"), JSON.stringify(selectedSources, null, 2) + "\n");
  const libraryNotes = library ? `The following two starter scores and ${library.count} additional compressed MusicXML editions are included in this distribution. The additional library is available from the score browser; its original XML bytes are unchanged inside each MXL. Full attribution and archive/XML hashes are retained in /repertoire/library/sources.json, /repertoire/library/catalog.json and /repertoire/library/README.md.` : "Only the following two MusicXML scores are included in this distribution. Additional scores can be opened from the user's own MusicXML files.";
  writeFileSync(join(root, "repertoire/SOURCES.md"), `# ConvoCerto repertoire\n\n${libraryNotes}\n\n## ConvoCerto Sample Duet\n\nConvoCerto Demo. CC0 1.0 Universal — Public Domain Dedication.\n\n/scores/sample-duet.musicxml\nhttps://creativecommons.org/publicdomain/zero/1.0/\n\n## Mozart — Clarinet Concerto K.622, II. Adagio\n\nSource: ${sourceRecord.scoreSource}\nScore license: ${sourceRecord.scoreLicense}\n\nThe original MusicXML bytes are unchanged. Full source metadata and the file hash are retained in /repertoire/ensemble/sources.json. Dataset attribution is retained in /repertoire/ensemble/README.md.\n\n${instrumentNotes.replace(/for \d+ instruments\./, `for ${audio.length} instruments.`)}`);
  writeFileSync(join(root, "credits.html"), starterCredits);
  const afterBytes = directoryBytes(root);
  return {
    profile: "starter",
    scores: scorePaths,
    instrumentBanks: audio.length,
    beforeBytes,
    afterBytes,
    removedBytes: beforeBytes - afterBytes,
    scoreDataBeforeBytes,
    scoreDataAfterBytes: directoryBytes(join(root, "scores")) + directoryBytes(join(root, "repertoire")),
    ...(library ? { library: { scores: library.count, bytes: library.bytes } } : {}),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const directory = join(repository, "build/client");
  const report = prepareStarterBundle(directory, { includeLibrary: true });
  writeFileSync(join(dirname(directory), "starter-bundle-report.json"), JSON.stringify(report, null, 2) + "\n");
  console.log(`Starter bundle: ${report.scores.length} starter scores, ${report.library.scores} additional editions, ${report.instrumentBanks} instrument banks; ${(report.beforeBytes / 1_000_000).toFixed(2)} MB → ${(report.afterBytes / 1_000_000).toFixed(2)} MB (${(report.removedBytes / 1_000_000).toFixed(2)} MB removed).`);
}
