import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const directory = join(root, "public/audio/fluid");
const manifest = JSON.parse(readFileSync(join(directory, "sources.json"), "utf8"));
if (manifest.length < 34) throw new Error(`音色が不足しています: ${manifest.length}`);
const instruments = new Set();
for (const entry of manifest) {
  if (instruments.has(entry.instrument) || !/^https:\/\//.test(entry.source) || entry.license !== "CC-BY-3.0") throw new Error(`音源メタデータが不正です: ${entry.instrument}`);
  instruments.add(entry.instrument);
  for (let octave = 1; octave <= 7; octave += 1) {
    const note = `C${octave}`;
    const file = join(directory, entry.instrument, `${note}.mp3`);
    if (!existsSync(file)) throw new Error(`音源がありません: ${entry.instrument}/${note}`);
    const hash = createHash("sha256").update(readFileSync(file)).digest("hex");
    if (hash !== entry.samples?.[note]) throw new Error(`音源ハッシュが一致しません: ${entry.instrument}/${note}`);
  }
}
console.log(`Verified ${manifest.length} FluidR3 GM instruments and ${manifest.length * 7} samples.`);
