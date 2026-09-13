import { rm, access } from "node:fs/promises";

const paths = ["repertoire/local/", ...["mozart-k622-adagio", "mozart-k581-trio"].flatMap((name) => [`scores/${name}.musicxml`, `scores/${name}.score.json`])];
for (const relative of paths) {
  const path = new URL(`../build/client/${relative}`, import.meta.url);
  await rm(path, { recursive: true, force: true });
  try {
    await access(path);
    throw new Error(`Local-only edition entered the distribution build: ${relative}`);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}
