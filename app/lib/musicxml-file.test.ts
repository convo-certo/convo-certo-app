import { expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import { readMusicXMLFile } from "./musicxml-file";
import { MusicXMLError } from "./musicxml-error";

function file(bytes: Uint8Array): File {
  return { size: bytes.length, arrayBuffer: async () => bytes.buffer } as File;
}
it("reads compressed scores through the MXL rootfile, ignoring other XML documents", async () => {
  const xml = '<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1"><measure number="1"/></part></score-partwise>';
  const bytes = zipSync({ "META-INF/container.xml": strToU8('<container><rootfiles><rootfile full-path="score/main.musicxml"/></rootfiles></container>'), "score/main.musicxml": strToU8(xml), "other.xml": strToU8("wrong") });
  expect(await readMusicXMLFile(file(bytes))).toBe(xml);
});
it("rejects incomplete archives and oversized uploads", async () => {
  await expect(readMusicXMLFile(file(zipSync({ "score.xml": strToU8("test") })))).rejects.toThrow("コンテナ");
  await expect(readMusicXMLFile({ size: 26_000_000 } as File)).rejects.toThrow("25MB");
});

it("reports upload size, empty files and read failures with stable codes", async () => {
  await expect(readMusicXMLFile({ size: 25_000_001 } as File)).rejects.toMatchObject({ code: "file-too-large", message: expect.stringContaining("25MB") });
  await expect(readMusicXMLFile(file(new Uint8Array()))).rejects.toMatchObject({ code: "file-empty" });
  const cause = new DOMException("Unavailable", "NotReadableError");
  await expect(readMusicXMLFile({ size: 1, arrayBuffer: async () => { throw cause; } } as unknown as File)).rejects.toMatchObject({ code: "file-unreadable", cause });
});

it("distinguishes damaged archives, invalid indexes and missing score documents", async () => {
  await expect(readMusicXMLFile(file(new Uint8Array([0x50, 0x4b, 0x03, 0x04])))).rejects.toBeInstanceOf(MusicXMLError);
  await expect(readMusicXMLFile(file(new Uint8Array([0x50, 0x4b, 0x03, 0x04])))).rejects.toMatchObject({ code: "archive-invalid" });
  await expect(readMusicXMLFile(file(zipSync({ "score.xml": strToU8("test") })))).rejects.toMatchObject({ code: "container-missing" });
  await expect(readMusicXMLFile(file(zipSync({ "META-INF/container.xml": strToU8("<container>") })))).rejects.toMatchObject({ code: "container-invalid" });
  await expect(readMusicXMLFile(file(zipSync({ "META-INF/container.xml": strToU8('<container><rootfiles><rootfile full-path="missing.xml"/></rootfiles></container>') })))).rejects.toMatchObject({ code: "score-missing" });
});

it("preserves the expansion limit before decompressing an oversized entry", async () => {
  const bytes = zipSync({ "score.xml": strToU8("<score-partwise/>") });
  const view = new DataView(bytes.buffer);
  for (let index = 0; index < bytes.length - 28; index++) {
    if (view.getUint32(index, true) === 0x02014b50) { view.setUint32(index + 24, 60_000_001, true); break; }
  }
  await expect(readMusicXMLFile(file(bytes))).rejects.toMatchObject({ code: "archive-too-large", message: "展開後の楽譜が大きすぎます。" });
});

it("retains XML-specific failure codes inside a valid MXL archive", async () => {
  const bytes = zipSync({
    "META-INF/container.xml": strToU8('<container><rootfiles><rootfile full-path="score.xml"/></rootfiles></container>'),
    "score.xml": strToU8("<score-partwise>"),
  });
  await expect(readMusicXMLFile(file(bytes))).rejects.toMatchObject({ code: "xml-invalid" });
});
