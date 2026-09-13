import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const directory = join(root, "public/repertoire/ensemble");
const catalog = JSON.parse(readFileSync(join(directory, "catalog.json"), "utf8"));
const sources = JSON.parse(readFileSync(join(directory, "sources.json"), "utf8"));
if (catalog.length !== sources.length) throw new Error("catalog.jsonとsources.jsonの件数が一致しません。");
const sourceById = new Map(sources.map((source) => [source.id, source]));
for (const item of catalog) {
  const source = sourceById.get(item.id);
  if (!source || !["CC0-1.0", "PDM-1.0"].includes(source.scoreLicense) || source.licenseConflict !== false) throw new Error(`権利メタデータが不正です: ${item.id}`);
  const file = join(directory, `${item.id}.musicxml`);
  if (!existsSync(file)) throw new Error(`MusicXMLがありません: ${item.id}`);
  const xml = readFileSync(file);
  if (/<(?:[A-Za-z0-9_]+:)?rights(?:\s|>)/i.test(xml.toString("utf8"))) throw new Error(`MusicXML内部に権利要素があります: ${item.id}`);
  if (createHash("sha256").update(xml).digest("hex") !== source.sha256) throw new Error(`ハッシュが一致しません: ${item.id}`);
}
console.log(`Verified ${catalog.length} ensemble MusicXML files and rights records.`);
