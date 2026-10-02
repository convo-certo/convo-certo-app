import type { GeneratedPartName, NoteEvent, ParsedScore } from "./types";
import type { Locale } from "./i18n";
import { musicXMLDocument } from "./musicxml-import";

export interface PerformanceSeat {
  id: string;
  partId: string;
  name: string;
  generatedName?: GeneratedPartName;
  voice?: string;
  staff?: string;
}

const lane = (note: NoteEvent) => JSON.stringify([note.staff ?? "1", note.voice ?? "1"]);

type PerformanceName = { name: string; generatedName?: GeneratedPartName };

export function performanceName(part: PerformanceName, locale: Locale): string {
  const generated = part.generatedName;
  if (!generated) return part.name;
  if (generated.kind === "remaining") return generated.sourceName + (locale === "ja" ? "（他の声部）" : " (other voices)");
  if (generated.kind === "staff") return `${generated.sourceName} · ${locale === "ja" ? `譜表${generated.staff}（全声部）` : `staff ${generated.staff} (all voices)`}`;
  return `${generated.sourceName} · ${locale === "ja" ? `譜表${generated.staff} 声部${generated.voice}` : `staff ${generated.staff} voice ${generated.voice}`}`;
}

function staffName(sourceName: string, staff: string): PerformanceName {
  return { name: `${sourceName} · 譜表${staff}（全声部）`, generatedName: { sourceName, kind: "staff", staff } };
}

function voiceName(sourceName: string, staff: string, voice: string): PerformanceName {
  return { name: `${sourceName} · 譜表${staff} 声部${voice}`, generatedName: { sourceName, kind: "voice", staff, voice } };
}

export function readPerformanceSeatName(xml: string, seatId: string, fallback: string): PerformanceName {
  try {
    const doc = musicXMLDocument(xml);
    const parts = [...doc.querySelectorAll("part-list > score-part")];
    const whole = parts.find(part => part.getAttribute("id") === seatId);
    if (whole) return { name: whole.querySelector("part-name")?.textContent ?? fallback };
    const lane = JSON.parse(seatId) as unknown;
    if (!Array.isArray(lane) || ![2, 3].includes(lane.length) || !lane.every(value => typeof value === "string") || JSON.stringify(lane) !== seatId) return { name: fallback };
    const [partId, staff, voice] = lane;
    const sourceName = parts.find(part => part.getAttribute("id") === partId)?.querySelector("part-name")?.textContent;
    if (sourceName != null) return lane.length === 2 ? staffName(sourceName, staff) : voiceName(sourceName, staff, voice);
  } catch {}
  return { name: fallback };
}

export function listPerformanceSeats(score: ParsedScore): PerformanceSeat[] {
  return score.parts.flatMap((part) => {
    const whole: PerformanceSeat = { id: part.id, partId: part.id, name: part.name };
    const lanes = [...new Set(part.notes.map(lane))];
    if (lanes.length < 2) return [whole];
    const staves = [...new Set(part.notes.map(note => note.staff ?? "1"))].sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
    const staffSeats: PerformanceSeat[] = staves.length < 2 ? [] : staves.map(staff => ({ id: JSON.stringify([part.id, staff]), partId: part.id, staff, ...staffName(part.name, staff) }));
    return [whole, ...staffSeats, ...lanes.map((value) => {
      const [staff, voice] = JSON.parse(value) as [string, string];
      return { id: JSON.stringify([part.id, staff, voice]), partId: part.id, staff, voice, ...voiceName(part.name, staff, voice) };
    })];
  });
}

export function assignPerformanceSeat(score: ParsedScore, seatId: string): ParsedScore {
  const seat = listPerformanceSeats(score).find((item) => item.id === seatId);
  if (!seat) throw new Error("この譜面に存在する席を選んでください。");
  const parts = score.parts.flatMap((part) => {
    if (part.id !== seat.partId) return [{ ...part, isSolo: false }];
    if (seat.staff == null && seat.voice == null) return [{ ...part, isSolo: true }];
    const chosen = (note: NoteEvent) => (seat.voice == null || (note.voice ?? "1") === seat.voice) && (seat.staff == null || (note.staff ?? "1") === seat.staff);
    return [
      { ...part, name: part.name + "（他の声部）", generatedName: { sourceName: part.name, kind: "remaining" as const }, isSolo: false, notes: part.notes.filter((note) => !chosen(note)) },
      { ...part, id: seat.id, sourcePartId: part.id, name: seat.name, generatedName: seat.generatedName, isSolo: true, notes: part.notes.filter(chosen) },
    ];
  }).map((part, partIndex) => ({ ...part, notes: part.notes.map((note) => ({ ...note, partIndex })) }));
  return { ...score, playerPartId: seat.id, parts };
}

export function playerPart(score: ParsedScore) {
  return score.parts.find((part) => score.playerPartId ? part.id === score.playerPartId : part.isSolo);
}
