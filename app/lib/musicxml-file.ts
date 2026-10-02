import { unzipSync } from "fflate";
import { decodeXML, normalizeMusicXML } from "./musicxml-import";
import { MusicXMLError } from "./musicxml-error";

export async function readMusicXMLFile(file: File): Promise<string> {
  if (file.size > 25_000_000) throw new MusicXMLError("file-too-large", "25MB以下のMusicXMLを選んでください。");
  if (!file.size) throw new MusicXMLError("file-empty", "楽譜ファイルが空です。MusicXMLとして書き出し直してください。");
  let bytes: Uint8Array;
  try { bytes = new Uint8Array(await file.arrayBuffer()); }
  catch (cause) { throw new MusicXMLError("file-unreadable", "楽譜ファイルを読み取れませんでした。ファイルを選び直してください。", { cause }); }
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) return normalizeMusicXML(decodeXML(bytes));
  let budget = 0;
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(bytes, { filter(entry) {
      budget += entry.originalSize;
      if (budget > 60_000_000) throw new MusicXMLError("archive-too-large", "展開後の楽譜が大きすぎます。");
      return /\.(xml|musicxml)$/i.test(entry.name);
    } });
  } catch (cause) {
    if (cause instanceof MusicXMLError) throw cause;
    throw new MusicXMLError("archive-invalid", "圧縮MXLが壊れているか、途中で切れています。楽譜ソフトから書き出し直してください。", { cause });
  }
  const container = entries["META-INF/container.xml"];
  if (!container) throw new MusicXMLError("container-missing", "MXLのコンテナ情報がありません。");
  const doc = new DOMParser().parseFromString(decodeXML(container), "application/xml");
  if (doc.querySelector("parsererror") || doc.documentElement.localName !== "container") throw new MusicXMLError("container-invalid", "MXLのコンテナ情報が壊れています。楽譜ソフトから書き出し直してください。");
  const root = doc.querySelector("rootfile")?.getAttribute("full-path");
  if (!root || !entries[root]) throw new MusicXMLError("score-missing", "MXL内のMusicXMLが見つかりません。");
  return normalizeMusicXML(decodeXML(entries[root]));
}
