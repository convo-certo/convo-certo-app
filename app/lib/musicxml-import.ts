export function musicXMLDocument(text: string): XMLDocument {
  if (/<!ENTITY\s/i.test(text)) throw new Error("独自のXMLエンティティを含むファイルです。MusicXMLとして書き出し直してください。");
  const parsed = new DOMParser().parseFromString(text, "application/xml");
  if (parsed.querySelector("parsererror")) throw new Error("XMLが途中で切れているか、書式が壊れています。楽譜ソフトから書き出し直してください。");
  const source = parsed.documentElement;
  if (!["score-partwise", "score-timewise"].includes(source.localName)) throw new Error(source.localName === "opus" ? "複数作品をまとめたopus形式です。演奏する作品を1つのMusicXMLとして書き出してください。" : "このXMLは楽譜のMusicXMLではありません。.musicxml または .mxl形式で書き出してください。");
  let doc = parsed;
  if (source.namespaceURI || source.prefix) {
    doc = document.implementation.createDocument(null, source.localName);
    const copy = (element: Element): Element => {
      const result = doc.createElement(element.localName);
      for (const attribute of element.attributes) if (!attribute.name.startsWith("xmlns")) result.setAttribute(attribute.name, attribute.value);
      for (const child of element.childNodes) result.appendChild(child.nodeType === 1 ? copy(child as Element) : doc.importNode(child, true));
      return result;
    };
    doc.replaceChild(copy(source), doc.documentElement);
  }
  if (doc.documentElement.localName === "score-timewise") {
    const old = doc.documentElement;
    const root = doc.createElement("score-partwise");
    for (const attribute of old.attributes) root.setAttribute(attribute.name, attribute.value);
    for (const child of Array.from(old.children)) if (child.localName !== "measure") root.appendChild(child.cloneNode(true));
    const ids = Array.from(root.querySelectorAll("part-list > score-part")).map((part) => part.getAttribute("id")!);
    for (const id of ids) {
      const part = doc.createElement("part"); part.setAttribute("id", id);
      for (const original of Array.from(old.children).filter((child) => child.localName === "measure")) {
        const content = Array.from(original.children).find((child) => child.localName === "part" && child.getAttribute("id") === id);
        if (!content) throw new Error(`小節 ${original.getAttribute("number")} にパート ${id} がありません。完全な総譜を書き出してください。`);
        const measure = doc.createElement("measure");
        for (const attribute of original.attributes) measure.setAttribute(attribute.name, attribute.value);
        for (const child of content.childNodes) measure.appendChild(child.cloneNode(true));
        part.appendChild(measure);
      }
      root.appendChild(part);
    }
    doc.replaceChild(root, old);
  }
  const ids = Array.from(doc.querySelectorAll("part-list > score-part")).map((part) => part.getAttribute("id"));
  if (!ids.length || ids.some((id) => !id) || new Set(ids).size !== ids.length) throw new Error("楽譜のパート一覧がないか、パートIDが重複しています。");
  for (const id of ids) if (!Array.from(doc.documentElement.children).some((part) => part.localName === "part" && part.getAttribute("id") === id)) throw new Error(`パート ${id} の音符データがありません。総譜を書き出し直してください。`);
  for (const divisions of doc.querySelectorAll("divisions")) if (!(Number(divisions.textContent) > 0) || !Number.isFinite(Number(divisions.textContent))) throw new Error("音符の長さの基準（divisions）が不正です。");
  return doc;
}

export const normalizeMusicXML = (text: string) => new XMLSerializer().serializeToString(musicXMLDocument(text).documentElement);

export function decodeXML(bytes: Uint8Array): string {
  let encoding = "utf-8";
  if (bytes[0] === 0xff && bytes[1] === 0xfe || bytes[0] === 0x3c && bytes[1] === 0) encoding = "utf-16le";
  else if (bytes[0] === 0xfe && bytes[1] === 0xff || bytes[0] === 0 && bytes[1] === 0x3c) encoding = "utf-16be";
  else encoding = new TextDecoder("ascii").decode(bytes.subarray(0, 180)).match(/<\?xml[^>]*encoding=["']([^"']+)["']/i)?.[1] ?? encoding;
  try { return new TextDecoder(encoding, { fatal: true }).decode(bytes); }
  catch { throw new Error("文字コードを読み取れませんでした。UTF-8のMusicXMLで保存してください。"); }
}
