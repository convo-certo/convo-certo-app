import { expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import { readMusicXMLFile } from "./musicxml-file";

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
