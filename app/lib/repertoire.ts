import type { ParsedScore } from "./types";

export interface RepertoireEntry {
  id: string;
  composer: string;
  title: string;
  movement: string;
  ensemble: "orchestra" | "piano";
  path: string;
  nativeTransposition: number;
  scoreDisplayTransposition?: number;
  source: string;
}

export const repertoire: RepertoireEntry[] = [
  ...["I. Allegro", "II. Adagio", "III. Rondo — Allegro"].map((movement, i) => ({
    id: `mozart-k622-${i + 1}`, composer: "W. A. Mozart", title: "クラリネット協奏曲 K.622", movement,
    ensemble: "orchestra" as const, path: `/repertoire/mozart-k622-${i + 1}.json`, nativeTransposition: -3,
    source: "https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=1635",
  })),
  ...["I. Allegro amabile", "II. Allegro appassionato", "III. Andante con moto"].map((movement, i) => ({
    id: `brahms-op120-2-${i + 1}`, composer: "Johannes Brahms", title: "クラリネットソナタ第2番 Op.120-2", movement,
    ensemble: "piano" as const, path: `/repertoire/local/brahms-op120-2-${i + 1}.json`, nativeTransposition: -2, scoreDisplayTransposition: 2,
    source: "https://www.viola-in-music.com/free-classical-music-midi-download.html",
  })),
];

export async function loadRepertoire(entry: RepertoireEntry): Promise<ParsedScore> {
  let response = await fetch(entry.ensemble === "orchestra" ? `/repertoire/local/${entry.id}.json` : entry.path);
  if (entry.ensemble === "orchestra") {
    const candidate = await response.clone().text();
    if (!response.ok || !candidate.trimStart().startsWith("{")) response = await fetch(entry.path);
  }
  if (!response.ok) throw new Error("この楽章の演奏データを読み込めませんでした。");
  let score: ParsedScore;
  try { score = await response.json(); }
  catch { throw new Error("この楽章の演奏データがまだ準備されていません。"); }
  if (!score.parts?.length || !score.totalBeats) throw new Error("演奏データが不正です。");
  return score;
}

export function transposeScore(score: ParsedScore, semitones: number): ParsedScore {
  return { ...score, parts: score.parts.map((part) => ({ ...part, notes: part.notes.map((note) => ({ ...note, pitch: note.pitch + semitones })) })) };
}
