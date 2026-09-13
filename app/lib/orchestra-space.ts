import type { ScorePart } from "./types";
import { instrumentForPart } from "./orchestra-audio";

export interface OrchestraChair {
  id: string;
  partIndex: number;
  instrument: string;
  x: number;
  z: number;
  level: number;
  variation?: number;
}
export function defaultChairs(parts: ScorePart[]): OrchestraChair[] {
  const family = (part: ScorePart) => {
    const instrument = instrumentForPart(part);
    if (/violin|viola|cello|contrabass|string|piano|harp/.test(instrument)) return 0;
    if (/horn|trumpet|trombone|tuba|timpani/.test(instrument)) return 2;
    return 1;
  };
  const order = parts.map((part, index) => ({ index, family: family(part) })).sort((a, b) => a.family - b.family);
  const columns = Math.min(6, parts.length);
  const rows = Math.ceil(parts.length / columns);
  return parts.map((part, index) => {
    const rank = order.findIndex((item) => item.index === index);
    return { id: `chair-${index}`, partIndex: index, instrument: instrumentForPart(part), x: ((rank % columns) - (columns - 1) / 2) * 1.8, z: -1.5 - Math.floor(rank / columns) * Math.min(2.4, 8 / Math.max(1, rows - 1)), level: 1 };
  });
}
