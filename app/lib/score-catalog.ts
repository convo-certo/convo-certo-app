import { readMusicXMLFile } from "./musicxml-file";
import { musicXMLDocument } from "./musicxml-import";

export interface CatalogPart { name: string; program: number | null }
export interface CatalogScore {
  id: string;
  title: string;
  composer: string;
  parts: CatalogPart[];
  measures: number;
  category: "orchestra" | "wind" | "chamber" | "solo";
  scoreLicense: "CC0-1.0" | "PDM-1.0";
  scoreSource: string;
  scope: "edition" | "excerpt" | "solo";
  file: string;
  bytes: number;
  sha256: string;
  xmlSha256: string;
}

export const catalogInstruments = [
  { id: "flute", ja: "フルート", en: "Flute", group: "woodwind" },
  { id: "piccolo", ja: "ピッコロ", en: "Piccolo", group: "woodwind" },
  { id: "recorder", ja: "リコーダー", en: "Recorder", group: "woodwind" },
  { id: "oboe", ja: "オーボエ", en: "Oboe", group: "woodwind" },
  { id: "english-horn", ja: "イングリッシュホルン", en: "English horn", group: "woodwind" },
  { id: "bassoon", ja: "ファゴット", en: "Bassoon", group: "woodwind" },
  { id: "clarinet", ja: "クラリネット", en: "Clarinet", group: "woodwind" },
  { id: "saxophone", ja: "サックス", en: "Saxophone", group: "woodwind" },
  { id: "horn", ja: "ホルン", en: "Horn", group: "brass" },
  { id: "trumpet", ja: "トランペット・コルネット", en: "Trumpet / cornet", group: "brass" },
  { id: "trombone", ja: "トロンボーン", en: "Trombone", group: "brass" },
  { id: "euphonium", ja: "ユーフォニアム", en: "Euphonium", group: "brass" },
  { id: "tuba", ja: "チューバ", en: "Tuba", group: "brass" },
  { id: "violin", ja: "ヴァイオリン", en: "Violin", group: "strings" },
  { id: "viola", ja: "ヴィオラ", en: "Viola", group: "strings" },
  { id: "cello", ja: "チェロ", en: "Cello", group: "strings" },
  { id: "double-bass", ja: "コントラバス", en: "Double bass", group: "strings" },
  { id: "harp", ja: "ハープ", en: "Harp", group: "strings" },
  { id: "guitar", ja: "ギター・リュート", en: "Guitar / lute", group: "strings" },
  { id: "piano", ja: "ピアノ", en: "Piano", group: "keyboard" },
  { id: "harpsichord", ja: "チェンバロ", en: "Harpsichord", group: "keyboard" },
  { id: "organ", ja: "オルガン", en: "Organ", group: "keyboard" },
  { id: "percussion", ja: "打楽器", en: "Percussion", group: "percussion" },
  { id: "voice", ja: "声楽", en: "Voice", group: "voice" },
] as const;

export const catalogGroups = [
  { id: "woodwind", ja: "木管", en: "Woodwinds" },
  { id: "brass", ja: "金管", en: "Brass" },
  { id: "strings", ja: "弦楽器", en: "Strings" },
  { id: "keyboard", ja: "鍵盤", en: "Keyboards" },
  { id: "percussion", ja: "打楽器", en: "Percussion" },
  { id: "voice", ja: "声楽", en: "Voice" },
] as const;

export type CatalogInstrumentId = typeof catalogInstruments[number]["id"];

const normalize = (value: string) => value.normalize("NFKD").replace(/(\p{Script=Latin})\p{Mark}+/gu, "$1").normalize("NFC").toLowerCase().replace(/accidentalflat/g, "♭");
const namePatterns: [RegExp, CatalogInstrumentId][] = [
  [/percussion|drum|cymbal|timp|timbal|triang|tambour|caisse|piatti|glockenspiel|marimba|tubular bells|打楽器|ティンパニ/, "percussion"],
  [/sax|サックス|サクソフォ/, "saxophone"],
  [/recorder|fl(?:auto|auot) dolce|flute a bec|リコーダー/, "recorder"],
  [/clarinet|clarinett|クラリネット|\b(?:solo|bass|[1-4](?:st|nd|rd|th))?cl\b|\bcla\b/, "clarinet"],
  [/english horn|cor anglais|イングリッシュホルン/, "english-horn"],
  [/oboe|oboi|hautbois|オーボエ/, "oboe"],
  [/bassoon|basson|fagot|\bbsn\b|ファゴット/, "bassoon"],
  [/trombone|トロンボーン/, "trombone"],
  [/euphonium|ユーフォニアム|ユーフォニウム/, "euphonium"],
  [/trumpet|tromba|trombe|trompet|cornet|clarino|トランペット|コルネット/, "trumpet"],
  [/\btuba\b|チューバ|テューバ/, "tuba"],
  [/horn|\bcor\b|corno|corni|\bcors\b|ホルン/, "horn"],
  [/harpsichord|cembalo|clavecin|チェンバロ/, "harpsichord"],
  [/harp|harfe|arpa|ハープ/, "harp"],
  [/violin|violon(?:s|\b)|\bvln\b|ヴァイオリン|バイオリン/, "violin"],
  [/cello|violonc|celli|\bvcl\b|チェロ/, "cello"],
  [/viola|viole\b|altos|\bvla\b|ヴィオラ|ビオラ/, "viola"],
  [/contrabass|contrabbass|contra-bass|contrebass|contrabaj|kontrebas|double bass|string bass|violone|\bbass(?:es|o)?\b|コントラバス/, "double-bass"],
  [/piccolo|ottavino|ピッコロ/, "piccolo"],
  [/flut|flaut|フルート/, "flute"],
  [/piano|ピアノ/, "piano"],
  [/organ|オルガン/, "organ"],
  [/guitar|guitare|lute|ギター|リュート/, "guitar"],
  [/voice|choir|soprano|tenor|baritone|声楽|合唱/, "voice"],
];

const programs: Partial<Record<number, CatalogInstrumentId>> = {
  1: "piano", 2: "piano", 3: "piano", 4: "piano", 5: "piano", 6: "piano", 7: "harpsichord", 8: "harpsichord",
  9: "percussion", 10: "percussion", 11: "percussion", 12: "percussion", 13: "percussion", 14: "percussion", 15: "percussion", 16: "percussion",
  17: "organ", 18: "organ", 19: "organ", 20: "organ", 21: "organ",
  25: "guitar", 26: "guitar", 27: "guitar", 28: "guitar", 29: "guitar", 30: "guitar", 31: "guitar", 32: "guitar",
  33: "double-bass", 41: "violin", 42: "viola", 43: "cello", 44: "double-bass", 47: "harp", 48: "percussion",
  53: "voice", 54: "voice", 55: "voice", 57: "trumpet", 58: "trombone", 59: "tuba", 61: "horn",
  65: "saxophone", 66: "saxophone", 67: "saxophone", 68: "saxophone", 69: "oboe", 70: "english-horn", 71: "bassoon", 72: "clarinet", 73: "piccolo", 74: "flute", 75: "recorder",
};

export function catalogPartInstrument(part: CatalogPart): CatalogInstrumentId | null {
  const name = normalize(part.name);
  if (/^(?:bass(?:es|o)?|tenor|alto|soprano|descant|treble)[.\s]*$/.test(name) && part.program !== null && programs[part.program]) return programs[part.program]!;
  if (/^e horn$/.test(name) && part.program === 70) return "english-horn";
  return namePatterns.find(([pattern]) => pattern.test(name))?.[1] ?? (part.program == null ? null : programs[part.program]) ?? null;
}

export function orderCatalog(scores: CatalogScore[]): CatalogScore[] {
  const introductions = ["corelli-sarabande-brass-ensemble", "bach-orchestral-suite-2", "library-146600", "library-46905", "library-58525", "holst-jupiter-woodwind-chorale", "library-23470", "library-132798"];
  const priority = (score: CatalogScore) => { const index = introductions.indexOf(score.id); return index < 0 ? introductions.length : index; };
  return [...scores].sort((left, right) => priority(left) - priority(right));
}

export function catalogScoreInstruments(score: CatalogScore) {
  const ids = new Set(score.parts.map(catalogPartInstrument));
  return catalogInstruments.filter(instrument => ids.has(instrument.id));
}

const composerAliases: [RegExp, string][] = [
  [/\bbach\b|バッハ/, "Bach バッハ"],
  [/\bbeethoven\b|ベートー[ヴベ]ェ?ン/, "Beethoven ベートーヴェン ベートーベン"],
  [/\bbrahms\b|ブラームス/, "Brahms ブラームス"],
  [/\bmozart\b|モーツァルト|モーツアルト/, "Mozart モーツァルト モーツアルト"],
  [/\bdvorak\b|ド[ヴボ]ォ?ルザーク/, "Dvorak ドヴォルザーク ドボルザーク"],
  [/\btchaikovsky\b|チャイコフスキー/, "Tchaikovsky チャイコフスキー"],
  [/\bhaydn\b|ハイドン/, "Haydn ハイドン"],
  [/\bschubert\b|シューベルト/, "Schubert シューベルト"],
  [/\bschumann\b|シューマン/, "Schumann シューマン"],
  [/\bhandel\b|ヘンデル/, "Handel ヘンデル"],
  [/\bholst\b|ホルスト/, "Holst ホルスト"],
  [/\bcorelli\b|コレッリ/, "Corelli コレッリ"],
  [/\bbizet\b|ビゼー/, "Bizet ビゼー"],
  [/\bsaint[ -]saens\b|サン[＝=・ -]?サーンス/, "Saint-Saens サンサーンス サン＝サーンス"],
  [/\bsousa\b|スーザ/, "Sousa スーザ"],
  [/\bstrauss\b|シュトラウス/, "Strauss シュトラウス"],
  [/\bbyrd\b|バード/, "Byrd バード"],
  [/\bfucik\b|フチーク/, "Fucik フチーク"],
  [/\bchesnokov\b|チェスノコフ/, "Chesnokov チェスノコフ"],
];

const normalizeSearch = (value: string) => normalize(value)
  .replace(/\b(op|kv|k|bwv|hob|d)\s*\.?\s*(?=\d)/g, "$1")
  .replace(/[\p{Punctuation}\p{Symbol}]/gu, " ");

export function filterCatalog(scores: CatalogScore[], query: string, instrument: string): CatalogScore[] {
  const words = normalizeSearch(query).trim().split(/\s+/).filter(Boolean);
  return scores.filter(score => {
    const instruments = catalogScoreInstruments(score);
    if (instrument && !instruments.some(item => item.id === instrument || `group:${item.group}` === instrument)) return false;
    const groupNames = catalogGroups.filter(group => instruments.some(item => item.group === group.id));
    const composer = normalize(score.composer);
    const aliases = composerAliases.filter(([pattern]) => pattern.test(composer)).map(([, names]) => names);
    const search = normalizeSearch([score.title, score.composer, ...aliases, ...score.parts.map(part => part.name), ...instruments.flatMap(item => [item.ja, item.en]), ...groupNames.flatMap(group => [group.ja, group.en])].join(" "));
    return words.every(word => search.includes(word));
  });
}

const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const string = (value: unknown, limit: number, empty = false): value is string => typeof value === "string" && value.length <= limit && (empty || value.trim().length > 0) && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value);
const integer = (value: unknown, min: number, max: number): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= min && value <= max;
const hash = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);

export function parseScoreCatalog(value: unknown): CatalogScore[] {
  if (!record(value) || value.version !== 1 || !Array.isArray(value.scores) || value.scores.length > 1000) throw new Error("Invalid score catalogue");
  const ids = new Set<string>();
  return value.scores.map(item => {
    if (!record(item) || typeof item.id !== "string" || !/^[a-z0-9][a-z0-9-]{0,95}$/.test(item.id) || ids.has(item.id)
      || !string(item.title, 500) || !string(item.composer, 300, true) || !Array.isArray(item.parts) || item.parts.length < 1 || item.parts.length > 128
      || item.parts.some(part => !record(part) || !string(part.name, 500, true) || !(part.program === null || integer(part.program, 1, 128)))
      || !integer(item.measures, 1, 100000) || !["orchestra", "wind", "chamber", "solo"].includes(String(item.category))
      || !["CC0-1.0", "PDM-1.0"].includes(String(item.scoreLicense)) || !["edition", "excerpt", "solo"].includes(String(item.scope))
      || item.file !== `${item.id}.mxl` || !integer(item.bytes, 1, 25_000_000) || !hash(item.sha256) || !hash(item.xmlSha256)
      || !string(item.scoreSource, 2000)) throw new Error("Invalid score catalogue entry");
    const url = new URL(item.scoreSource);
    if (url.protocol !== "https:" || !url.hostname || url.username || url.password) throw new Error("Invalid score source");
    ids.add(item.id);
    return item as unknown as CatalogScore;
  });
}

export function catalogFileSize(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.ceil(bytes / 1024))} KB`;
}

export function prepareCatalogXML(xml: string, score: CatalogScore): string {
  const doc = musicXMLDocument(xml);
  const root = doc.documentElement;
  const element = (name: string, value?: string) => { const node = doc.createElement(name); if (value !== undefined) node.textContent = value; return node; };
  let work = root.querySelector(":scope > work");
  if (!work) { work = element("work"); root.prepend(work); }
  let title = work.querySelector("work-title");
  if (!title) { title = element("work-title"); work.append(title); }
  title.textContent = score.title;
  const movement = root.querySelector(":scope > movement-title");
  if (movement) movement.textContent = score.title;
  if (score.composer.trim()) {
    let identification = root.querySelector(":scope > identification");
    if (!identification) {
      identification = element("identification");
      const next = [...root.children].find(child => !["work", "movement-number", "movement-title"].includes(child.localName));
      root.insertBefore(identification, next ?? null);
    }
    let composer = identification.querySelector('creator[type="composer"]');
    if (!composer) { composer = element("creator"); composer.setAttribute("type", "composer"); identification.prepend(composer); }
    composer.textContent = score.composer;
  }
  const labels = score.parts.map(part => catalogInstruments.find(item => item.id === catalogPartInstrument(part))?.en ?? "Part");
  const used = new Map<string, number>();
  root.querySelectorAll("part-list > score-part").forEach((part, index) => {
    let name = part.querySelector("part-name");
    if (name?.textContent?.trim()) return;
    const label = labels[index] ?? "Part";
    const count = (used.get(label) ?? 0) + 1;
    used.set(label, count);
    if (!name) { name = element("part-name"); part.prepend(name); }
    name.textContent = labels.filter(value => value === label).length > 1 ? `${label} ${count}` : label;
  });
  return new XMLSerializer().serializeToString(root);
}

export async function fetchCatalogScore(score: CatalogScore, signal: AbortSignal): Promise<File> {
  const response = await fetch(`/repertoire/library/${score.file}`, { signal });
  if (!response.ok) throw new Error("Score download failed");
  const blob = await response.blob();
  if (blob.size !== score.bytes) throw new Error("Score size mismatch");
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  const checksum = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
  if (checksum !== score.sha256 || signal.aborted) throw new Error("Score checksum mismatch");
  const xml = await readMusicXMLFile(new File([blob], score.file, { type: "application/vnd.recordare.musicxml" }));
  if (signal.aborted) throw new Error("Score request cancelled");
  return new File([prepareCatalogXML(xml, score)], `${score.id}.musicxml`, { type: "application/vnd.recordare.musicxml+xml" });
}
