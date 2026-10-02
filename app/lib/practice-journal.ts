import { parseMusicXML } from "./musicxml-parser";
import { listPerformanceSeats } from "./performance-seats";
import { readPracticeFile } from "./practice-file";
import { workSignature } from "./score-signature";
import type { LibraryScore } from "./score-library";

export interface PracticeJournalEntry {
  id: string;
  practice: LibraryScore;
  totalPlayedSeconds: number;
  sessionCount: number;
  practiceDates: string[];
  lastPlayedAt: string;
  resumeMeasure: number;
  seatName: string;
}

const STORE = "practice";
const MAX_SCORES = 12;
const MAX_ENTRY_BYTES = 25_000_000;
const MAX_TOTAL_BYTES = 40_000_000;
const storageError = () => new Error("練習履歴を保存できませんでした。ブラウザの保存領域を確認してください。");
const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).byteLength;

function localDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function validEntry(value: unknown): value is PracticeJournalEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as PracticeJournalEntry;
  return typeof entry.id === "string" && typeof entry.practice?.xml === "string" && typeof entry.practice.title === "string"
    && !!entry.practice.session && Number.isFinite(entry.practice.session.tempo)
    && typeof entry.seatName === "string" && Number.isInteger(entry.resumeMeasure) && entry.resumeMeasure >= 0
    && Number.isFinite(entry.totalPlayedSeconds) && entry.totalPlayedSeconds >= 3 && entry.totalPlayedSeconds <= Number.MAX_SAFE_INTEGER
    && Number.isSafeInteger(entry.sessionCount) && entry.sessionCount > 0
    && Array.isArray(entry.practiceDates) && entry.practiceDates.length > 0
    && entry.practiceDates.every(date => typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date))
    && new Set(entry.practiceDates).size === entry.practiceDates.length
    && typeof entry.lastPlayedAt === "string" && Number.isFinite(Date.parse(entry.lastPlayedAt));
}

export function retainPracticeJournal(entries: PracticeJournalEntry[]): PracticeJournalEntry[] {
  let totalBytes = 0;
  return entries.filter(validEntry).sort((a, b) => b.lastPlayedAt.localeCompare(a.lastPlayedAt)).filter(entry => {
    const size = bytes(entry);
    if (size > MAX_ENTRY_BYTES || totalBytes + size > MAX_TOTAL_BYTES) return false;
    totalBytes += size;
    return true;
  }).slice(0, MAX_SCORES);
}

function mergeEntry(previous: PracticeJournalEntry | undefined, next: PracticeJournalEntry): PracticeJournalEntry {
  if (!previous || previous.id !== next.id || !validEntry(previous)) return next;
  const merged = {
    ...(previous.lastPlayedAt > next.lastPlayedAt ? previous : next),
    totalPlayedSeconds: previous.totalPlayedSeconds + next.totalPlayedSeconds,
    sessionCount: previous.sessionCount + 1,
    practiceDates: [...new Set([...previous.practiceDates, ...next.practiceDates])].sort(),
  };
  if (!validEntry(merged)) throw storageError();
  return merged;
}

export function mergePracticeSnapshot(previous: PracticeJournalEntry | undefined, next: PracticeJournalEntry): PracticeJournalEntry | null {
  if (!previous || previous.id !== next.id || !validEntry(previous) || !validEntry(next)) return null;
  const updated = { ...previous, practice: next.practice, resumeMeasure: next.resumeMeasure, seatName: next.seatName };
  if (bytes(updated) > MAX_ENTRY_BYTES) throw storageError();
  return updated;
}

export function createPracticeJournalEntry(
  previous: PracticeJournalEntry | undefined,
  practice: LibraryScore,
  playedSeconds: number,
  at = new Date(),
): PracticeJournalEntry | null {
  if (!Number.isFinite(playedSeconds) || playedSeconds < 0 || playedSeconds > 86_400 || !Number.isFinite(at.getTime())) throw new Error("練習時間を記録できませんでした。");
  if (playedSeconds < 3) return null;
  if (typeof practice?.id !== "string" || !practice.session) throw new Error("再開するための練習設定がありません。");
  if (bytes(practice) > MAX_ENTRY_BYTES) throw new Error("この楽譜は大きいため、練習履歴に保存できません。練習ファイルに書き出してください。");
  const validated = readPracticeFile(JSON.stringify({ format: "convocerto-practice", version: 1, score: practice }));
  const source = parseMusicXML(validated.xml);
  const session = validated.session!;
  const measureIndex = source.measureStartBeats.reduce((index, beat, candidate) => beat <= session.beat ? candidate : index, 0);
  const id = `${workSignature(source)}:${session.seatId}`;
  const seat = listPerformanceSeats(source).find(part => part.id === session.seatId);
  const next = mergeEntry(previous, {
    id,
    practice: { ...validated, id: practice.id, savedAt: at.toISOString() },
    totalPlayedSeconds: playedSeconds,
    sessionCount: 1,
    practiceDates: [localDate(at)],
    lastPlayedAt: at.toISOString(),
    resumeMeasure: source.measureNumbers[source.playbackOrder[measureIndex]] ?? measureIndex + 1,
    seatName: seat?.name ?? session.seatId,
  });
  if (bytes(next) > MAX_ENTRY_BYTES) throw new Error("この楽譜は大きいため、練習履歴に保存できません。練習ファイルに書き出してください。");
  return next;
}

function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") { reject(storageError()); return; }
    let settled = false;
    const request = indexedDB.open("convocerto-practice-journal", 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: "id" });
    request.onsuccess = () => {
      if (settled) { request.result.close(); return; }
      settled = true;
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = request.onblocked = () => { settled = true; reject(storageError()); };
  });
}

export async function listPracticeJournal(): Promise<PracticeJournalEntry[]> {
  let db: IDBDatabase;
  try { db = await database(); } catch { throw new Error("練習履歴を読み込めませんでした。"); }
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, "readonly");
    const request = transaction.objectStore(STORE).getAll();
    transaction.oncomplete = () => {
      db.close();
      try { resolve(retainPracticeJournal(request.result)); }
      catch { reject(new Error("練習履歴を読み込めませんでした。")); }
    };
    transaction.onerror = transaction.onabort = () => { db.close(); reject(new Error("練習履歴を読み込めませんでした。")); };
  });
}

export async function recordPracticeSession(practice: LibraryScore, playedSeconds: number): Promise<PracticeJournalEntry | null> {
  const next = createPracticeJournalEntry(undefined, practice, playedSeconds);
  if (!next) return null;
  let db: IDBDatabase;
  try { db = await database(); } catch { throw storageError(); }
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, "readwrite");
    const store = transaction.objectStore(STORE);
    const request = store.getAll();
    let recorded = next;
    request.onsuccess = () => {
      try {
        const entries = (request.result as unknown[]).filter(validEntry);
        recorded = mergeEntry(entries.find(entry => entry.id === next.id), next);
        if (bytes(recorded) > MAX_ENTRY_BYTES) throw storageError();
        const retained = retainPracticeJournal([recorded, ...entries.filter(entry => entry.id !== next.id)]);
        const retainedIds = new Set(retained.map(entry => entry.id));
        for (const entry of request.result as PracticeJournalEntry[]) if (!retainedIds.has(entry.id)) store.delete(entry.id);
        if (retainedIds.has(recorded.id)) store.put(recorded);
      } catch { transaction.abort(); }
    };
    transaction.oncomplete = () => { db.close(); resolve(recorded); };
    transaction.onerror = transaction.onabort = () => { db.close(); reject(storageError()); };
  });
}

export async function removePracticeJournalEntry(id: string): Promise<void> {
  const error = () => new Error("練習履歴を削除できませんでした。もう一度お試しください。");
  if (typeof id !== "string" || !id.trim()) throw error();
  let db: IDBDatabase;
  try { db = await database(); } catch { throw error(); }
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, "readwrite");
    transaction.objectStore(STORE).delete(id);
    transaction.oncomplete = () => { db.close(); resolve(); };
    transaction.onerror = transaction.onabort = () => { db.close(); reject(error()); };
  });
}

export async function updatePracticeSnapshot(practice: LibraryScore): Promise<boolean> {
  const next = createPracticeJournalEntry(undefined, practice, 3)!;
  let db: IDBDatabase;
  try { db = await database(); } catch { throw storageError(); }
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, "readwrite");
    const store = transaction.objectStore(STORE);
    const request = store.get(next.id);
    let updated = false;
    request.onsuccess = () => {
      try {
        const snapshot = mergePracticeSnapshot(request.result, next);
        if (!snapshot) return;
        const all = store.getAll();
        all.onsuccess = () => {
          try {
            const entries = (all.result as unknown[]).filter(validEntry);
            const retained = retainPracticeJournal(entries.map(entry => entry.id === snapshot.id ? snapshot : entry));
            if (retained.length !== entries.length || !retained.some(entry => entry.id === snapshot.id)) throw storageError();
            store.put(snapshot);
            updated = true;
          } catch { transaction.abort(); }
        };
      } catch { transaction.abort(); }
    };
    transaction.oncomplete = () => { db.close(); resolve(updated); };
    transaction.onerror = transaction.onabort = () => { db.close(); reject(storageError()); };
  });
}
