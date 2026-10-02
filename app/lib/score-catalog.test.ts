import { readFileSync } from "node:fs";
import { webcrypto, createHash } from "node:crypto";
import { Blob as NodeBlob, File as NodeFile } from "node:buffer";
import { afterEach, describe, expect, it, vi } from "vitest";
import { strToU8, zipSync } from "fflate";
import { catalogPartInstrument, catalogScoreInstruments, fetchCatalogScore, filterCatalog, orderCatalog, parseScoreCatalog, prepareCatalogXML, type CatalogScore } from "./score-catalog";
import { parseMusicXML } from "./musicxml-parser";

const score: CatalogScore = {
  id: "quartet", title: "Haydn quartet", composer: "Joseph Haydn", parts: [{ name: "", program: 41 }, { name: "", program: 41 }, { name: "", program: 42 }, { name: "", program: 43 }],
  measures: 128, category: "chamber", scoreLicense: "CC0-1.0", scoreSource: "https://scorebase.org/scores/23470", scope: "edition", file: "quartet.mxl", bytes: 400, sha256: "a".repeat(64), xmlSha256: "b".repeat(64),
};

describe("catalogue metadata and instrument search", () => {
  it("accepts unnamed parts with 1-based MIDI programmes and never guesses piano for unknown parts", () => {
    expect(parseScoreCatalog({ version: 1, scores: [score] })).toEqual([score]);
    expect(catalogScoreInstruments(score).map(item => item.id)).toEqual(["violin", "viola", "cello"]);
    expect(catalogPartInstrument({ name: "Unknown instrument", program: null })).toBeNull();
    expect(catalogPartInstrument({ name: "Unknown instrument", program: 128 })).toBeNull();
  });

  it.each([
    ["Fagot", "bassoon"], ["Cor en Fa", "horn"], ["Flauta", "flute"], ["1stCl", "clarinet"], ["SoloCl", "clarinet"], ["Clarinete en La", "clarinet"], ["A.Sax", "saxophone"], ["BarSax", "saxophone"],
    ["VLN", "violin"], ["Violons", "violin"], ["VLA", "viola"], ["Violonchelos", "cello"], ["VCL", "cello"], ["Contrabajos", "double-bass"], ["Violone", "double-bass"],
    ["Flauto. (Flûte à bec.)", "recorder"], ["Flauto dolce I", "recorder"], ["Flauot dolce II", "recorder"], ["Violino piccolo.", "violin"], ["Caisse claire piccolo", "percussion"],
    ["Bass Clarinet", "clarinet"], ["Bass Trombone", "trombone"], ["English Horn", "english-horn"], ["Harpsichord", "harpsichord"], ["Clarino I in C", "trumpet"], ["Euphonium", "euphonium"],
    ["Bass Recorder", "recorder"], ["Tenor Recorder", "recorder"],
  ])("recognises the source label %s", (name, expected) => {
    expect(catalogPartInstrument({ name, program: 49 })).toBe(expected);
  });

  it("preserves Japanese voiced marks and uses MIDI to identify ambiguous voice ranges", () => {
    for (const [name, id] of [["ヴァイオリン", "violin"], ["ヴィオラ", "viola"], ["オーボエ", "oboe"], ["ピアノ", "piano"]]) expect(catalogPartInstrument({ name, program: null })).toBe(id);
    for (const name of ["Descant", "Treble", "Tenor", "Bass"]) expect(catalogPartInstrument({ name, program: 75 })).toBe("recorder");
  });

  it("searches Japanese and English instruments and intersects the chosen family or instrument", () => {
    const piano = { ...score, id: "piano", title: "Schumann", composer: "Robert Schumann", parts: [{ name: "Pianoforte", program: 1 }] };
    expect(filterCatalog([score, piano], "Haydn ヴィオラ", "group:strings")).toEqual([score]);
    expect(filterCatalog([score, piano], "cello", "viola")).toEqual([score]);
    expect(filterCatalog([score, piano], "Haydn", "piano")).toEqual([]);
    expect(filterCatalog([score, piano], "ピアノ", "group:keyboard")).toEqual([piano]);
    expect(orderCatalog([{ ...piano, id: "library-58525" }, { ...score, id: "corelli-sarabande-brass-ensemble" }]).map(item => item.id)).toEqual(["corelli-sarabande-brass-ensemble", "library-58525"]);
  });

  it("finds source catalogue composer labels using Japanese names without translating score titles", () => {
    const source = JSON.parse(readFileSync("public/repertoire/ensemble/catalog.json", "utf8")) as Pick<CatalogScore, "id" | "title" | "composer">[];
    const catalog = source.map(item => ({ ...score, id: item.id, title: item.title, composer: item.composer }));
    for (const [query, expected] of [["ハイドン", "library-23470"], ["シューマン", "library-58525"], ["ベートーベン", "beethoven-symphony-5-1"], ["モーツァルト", "mozart-k622-1"], ["ドボルザーク", "dvorak-new-world-4-woodwind"], ["サン＝サーンス", "library-84396"]]) {
      expect(filterCatalog(catalog, query, "").map(item => item.id)).toContain(expected);
    }
    expect(filterCatalog(catalog, "ハイドン", "piano")).toHaveLength(0);
    expect(filterCatalog(catalog, "Haydn", "viola").map(item => item.id)).toEqual(filterCatalog(catalog, "ハイドン", "viola").map(item => item.id));
  });

  it("accepts full-width text, accents and punctuation differences in names and work numbers", () => {
    const mozart = { ...score, title: "Mozart · K. 622", composer: "W. A. Mozart" };
    const brahms = { ...score, title: "Brahms · Op. 120-2", composer: "Johannes Brahms" };
    const handel = { ...score, title: "Water Music", composer: "George Frideric Handel" };
    for (const query of ["K622", "ｋ６２２", "Mozart K.622", "モーツァルト K 622"]) expect(filterCatalog([mozart, brahms], query, "")).toEqual([mozart]);
    for (const query of ["Op120", "Op.120-2", "ブラームス op 120"]) expect(filterCatalog([mozart, brahms], query, "")).toEqual([brahms]);
    expect(filterCatalog([handel], "Händel", "")).toEqual([handel]);
    expect(filterCatalog([{ ...score, composer: "ハイドン", title: "弦楽四重奏曲" }], "Haydn", "viola")).toHaveLength(1);
  });

  it.each([
    { id: "../private", file: "../private.mxl" }, { file: "https://example.com/file.mxl" }, { file: "quartet.mxl?path=../secret" },
    { scoreSource: "javascript:alert(1)" }, { scoreSource: "https://name:password@example.com/" }, { bytes: 25_000_001 }, { bytes: -1 },
    { sha256: "unchecked" }, { title: "" }, { parts: [{ name: "", program: 0 }] }, { parts: [{ name: "Cello" }] }, { category: "unknown" },
  ])("rejects unsafe or malformed catalogue metadata %j", patch => {
    expect(() => parseScoreCatalog({ version: 1, scores: [{ ...score, ...patch }] })).toThrow();
  });

  it("rejects incompatible versions and duplicate entries", () => {
    expect(() => parseScoreCatalog({ version: 2, scores: [score] })).toThrow();
    expect(() => parseScoreCatalog({ version: 1, scores: [score, score] })).toThrow();
  });
});

it("makes the source quartet recognisable without changing notes, part IDs or credits", () => {
  const source = readFileSync("public/repertoire/ensemble/library-23470.musicxml", "utf8");
  const prepared = prepareCatalogXML(source, score);
  const before = parseMusicXML(source);
  const after = parseMusicXML(prepared);
  expect(after.title).toBe("Haydn quartet");
  expect(after.parts.map(part => part.name)).toEqual(["Violin 1", "Violin 2", "Viola", "Cello"]);
  expect(after.parts.map(part => ({ id: part.id, notes: part.notes, program: part.midiProgram }))).toEqual(before.parts.map(part => ({ id: part.id, notes: part.notes, program: part.midiProgram })));
  const docs = [source, prepared].map(xml => new DOMParser().parseFromString(xml, "application/xml"));
  expect(docs[1].querySelector("movement-title")?.textContent).toBe("Haydn quartet");
  expect(docs[1].querySelector('creator[type="composer"]')?.textContent).toBe("Joseph Haydn");
  expect([...docs[1].querySelectorAll("credit, identification > source")].map(node => node.outerHTML)).toEqual([...docs[0].querySelectorAll("credit, identification > source")].map(node => node.outerHTML));
});

describe("compressed score loading", () => {
  afterEach(() => vi.unstubAllGlobals());
  const xml = '<score-partwise><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>1</divisions></attributes><note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration></note></measure></part></score-partwise>';
  const bytes = zipSync({ "META-INF/container.xml": strToU8('<container><rootfiles><rootfile full-path="score.musicxml"/></rootfiles></container>'), "score.musicxml": strToU8(xml) });
  const downloaded = { ...score, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
  const setup = (payload: Uint8Array) => {
    vi.stubGlobal("crypto", webcrypto);
    vi.stubGlobal("File", NodeFile);
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, blob: async () => new NodeBlob([payload]) })));
  };

  it("checks the compressed bytes before creating the labelled practice score", async () => {
    setup(bytes);
    const file = await fetchCatalogScore(downloaded, new AbortController().signal);
    expect(file.name).toBe("quartet.musicxml");
    expect(parseMusicXML(await file.text()).title).toBe("Haydn quartet");
    expect(fetch).toHaveBeenCalledWith("/repertoire/library/quartet.mxl", expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });

  it("rejects a fallback HTML response and a same-sized corrupted download", async () => {
    setup(strToU8("<html>missing</html>"));
    await expect(fetchCatalogScore(downloaded, new AbortController().signal)).rejects.toThrow("size");
    const corrupt = bytes.slice(); corrupt[12] ^= 1;
    setup(corrupt);
    await expect(fetchCatalogScore(downloaded, new AbortController().signal)).rejects.toThrow("checksum");
  });
});
