import { readReferenceProfile } from "./reference-profile";
import { workSignature } from "./score-signature";
import { transposeScore } from "./repertoire";
import { readEnsembleTuning } from "./ensemble-tuning";
import { normalizeMusicXML } from "./musicxml-import";
import { parseMusicXML } from "./musicxml-parser";
import { assignPerformanceSeat } from "./performance-seats";
import { instrumentForPart } from "./orchestra-audio";
import { placementInstruments } from "./instrument-palette";
import { PracticeFileError } from "./practice-file-error";
import type { LibraryScore } from "./score-library";
import type { PracticeSession } from "./practice-session";

const maxFileBytes = 30_000_000;

export async function readPracticeFileUpload(file: Pick<File, "size" | "text">): Promise<Omit<LibraryScore, "id" | "savedAt">> {
  if (file.size > maxFileBytes) throw new PracticeFileError("file-too-large");
  let text: string;
  try { text = await file.text(); }
  catch (cause) { throw new PracticeFileError("file-unreadable", { cause }); }
  return readPracticeFile(text);
}

export function readPracticeFile(text: string): Omit<LibraryScore, "id" | "savedAt"> {
  if (new TextEncoder().encode(text).length > maxFileBytes) throw new PracticeFileError("file-too-large");
  let data;
  try { data = JSON.parse(text); } catch (cause) { throw new PracticeFileError("json-invalid", { cause }); }
  if (data?.format !== "convocerto-practice" || data.version !== 1 || typeof data.score?.xml !== "string" || typeof data.score?.title !== "string" || data.score.title.length > 500) throw new PracticeFileError("format-unsupported");
  let xml: string;
  let source: ReturnType<typeof parseMusicXML>;
  try { xml = normalizeMusicXML(data.score.xml); source = parseMusicXML(xml); }
  catch (cause) { throw new PracticeFileError("score-invalid", { cause }); }
  if (!source.title.trim()) source.title = data.score.title;
  const session = data.score.session as PracticeSession | undefined;
  if (session !== undefined) {
    const invalid = () => { throw new PracticeFileError("settings-invalid"); };
    if (!session || session.version !== 1 || typeof session.seatId !== "string") invalid();
    let score: typeof source;
    try { score = assignPerformanceSeat(source, session.seatId); }
    catch (cause) { throw new PracticeFileError("seat-missing", { cause }); }
    const inRange = (value: unknown, min: number, max: number, integer = false) => typeof value === "number" && Number.isFinite(value) && value >= min && value <= max && (!integer || Number.isInteger(value));
    if (!inRange(session.instrumentKey, -36, 36, true) || !inRange(session.shift, -24, 24, true) || !inRange(session.tuning, 430, 450) || !inRange(session.tempo, 20, 240) || !inRange(session.beat, 0, score.totalBeats) || !inRange(session.startMeasure, 1, score.measureStartBeats.length, true) || !inRange(session.loopEnd, session.loopEnabled ? session.startMeasure : 1, score.measureStartBeats.length, true) || !inRange(session.countInBars, 0, 2, true) || !inRange(session.volume, 0, 100) || !["accompany", "listen", "wait"].includes(session.mode) || [session.loopEnabled, session.click, session.midiWritten].some(value => typeof value !== "boolean")) invalid();
    if (session.mutedPartIds !== undefined) {
      const allowed = new Set(score.parts.filter(part => !part.isSolo).map(part => part.id));
      if (!Array.isArray(session.mutedPartIds) || session.mutedPartIds.some(id => typeof id !== "string" || !allowed.has(id)) || new Set(session.mutedPartIds).size !== session.mutedPartIds.length) invalid();
    }
    if (session.ensemble !== undefined) {
      const ensemble = session.ensemble;
      if (!ensemble || typeof ensemble.leader !== "string" || !["player", "conductor", ...score.parts.filter(part => !part.isSolo).map(part => part.id)].includes(ensemble.leader)) invalid();
      try { ensemble.tuning = readEnsembleTuning(ensemble.tuning); }
      catch (cause) { throw new PracticeFileError("settings-invalid", { cause }); }
      if (ensemble.reference != null) {
        let reference: ReturnType<typeof readReferenceProfile>;
        try { reference = readReferenceProfile(JSON.stringify(ensemble.reference)); }
        catch (cause) { throw new PracticeFileError("reference-invalid", { cause }); }
        if (reference.workSignature !== workSignature(transposeScore(score, session.shift)) || reference.points.at(-1)!.beat > score.totalBeats) throw new PracticeFileError("reference-mismatch");
        ensemble.reference = reference;
      }
    }
    if (session.space !== undefined) {
      const space = session.space;
      const instruments = new Set([...placementInstruments, ...score.parts.map(instrumentForPart)]);
      if (!space || typeof space.enabled !== "boolean" || !inRange(space.listener?.x, -6, 6) || !inRange(space.listener?.z, -10, 2) || !Array.isArray(space.chairs) || !space.chairs.length || space.chairs.length > 64) invalid();
      const ids = new Set<string>();
      for (const chair of space.chairs) {
        if (!chair || typeof chair.id !== "string" || chair.id.length > 200 || ids.has(chair.id) || !inRange(chair.partIndex, 0, score.parts.length - 1, true) || !instruments.has(chair.instrument) || !inRange(chair.x, -6, 6) || !inRange(chair.z, -10, 0) || !inRange(chair.level, 0, 1.5) || (chair.variation !== undefined && !inRange(chair.variation, 0, 1))) invalid();
        ids.add(chair.id);
      }
    }
  }
  return { title: data.score.title, xml, session };
}

export function exportPracticeFile(score: LibraryScore): void {
  const text = JSON.stringify({ format: "convocerto-practice", version: 1, score: { title: score.title, xml: score.xml, session: score.session } });
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url; link.download = "practice.convo.json"; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
