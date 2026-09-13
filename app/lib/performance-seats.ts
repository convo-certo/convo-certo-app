import type { NoteEvent, ParsedScore } from "./types";

export interface PerformanceSeat {
  id: string;
  partId: string;
  name: string;
  voice?: string;
  staff?: string;
}

const lane = (note: NoteEvent) => JSON.stringify([note.staff ?? "1", note.voice ?? "1"]);

export function listPerformanceSeats(score: ParsedScore): PerformanceSeat[] {
  return score.parts.flatMap((part) => {
    const whole: PerformanceSeat = { id: part.id, partId: part.id, name: part.name };
    const lanes = [...new Set(part.notes.map(lane))];
    if (lanes.length < 2) return [whole];
    return [whole, ...lanes.map((value) => {
      const [staff, voice] = JSON.parse(value) as [string, string];
      return { id: JSON.stringify([part.id, staff, voice]), partId: part.id, staff, voice, name: `${part.name} · 譜表${staff} 声部${voice}` };
    })];
  });
}

export function assignPerformanceSeat(score: ParsedScore, seatId: string): ParsedScore {
  const seat = listPerformanceSeats(score).find((item) => item.id === seatId);
  if (!seat) throw new Error("この譜面に存在する席を選んでください。");
  const parts = score.parts.flatMap((part) => {
    if (part.id !== seat.partId) return [{ ...part, isSolo: false }];
    if (seat.voice == null) return [{ ...part, isSolo: true }];
    const chosen = (note: NoteEvent) => (note.voice ?? "1") === seat.voice && (note.staff ?? "1") === seat.staff;
    return [
      { ...part, name: part.name + "（他の声部）", isSolo: false, notes: part.notes.filter((note) => !chosen(note)) },
      { ...part, id: seat.id, sourcePartId: part.id, name: seat.name, isSolo: true, notes: part.notes.filter(chosen) },
    ];
  }).map((part, partIndex) => ({ ...part, notes: part.notes.map((note) => ({ ...note, partIndex })) }));
  return { ...score, playerPartId: seat.id, parts };
}

export function playerPart(score: ParsedScore) {
  return score.parts.find((part) => score.playerPartId ? part.id === score.playerPartId : part.isSolo);
}
