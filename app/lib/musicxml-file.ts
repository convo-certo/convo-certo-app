import { unzipSync } from "fflate";
import { decodeXML, normalizeMusicXML } from "./musicxml-import";

export async function readMusicXMLFile(file: File): Promise<string> {
  if (file.size > 25_000_000) throw new Error("25MB以下のMusicXMLを選んでください。");
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) return normalizeMusicXML(decodeXML(bytes));
  let budget = 0;
  const entries = unzipSync(bytes, { filter(entry) {
    budget += entry.originalSize;
    if (budget > 60_000_000) throw new Error("展開後の楽譜が大きすぎます。");
    return /\.(xml|musicxml)$/i.test(entry.name);
  } });
  const container = entries["META-INF/container.xml"];
  if (!container) throw new Error("MXLのコンテナ情報がありません。");
  const doc = new DOMParser().parseFromString(decodeXML(container), "application/xml");
  const root = doc.querySelector("rootfile")?.getAttribute("full-path");
  if (!root || !entries[root]) throw new Error("MXL内のMusicXMLが見つかりません。");
  return normalizeMusicXML(decodeXML(entries[root]));
}
