import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createPracticeJournalEntry, listPracticeJournal, mergePracticeSnapshot, recordPracticeSession, removePracticeJournalEntry, retainPracticeJournal, updatePracticeSnapshot } from "./practice-journal";
import { updateMusicXMLAnnotation } from "./musicxml-parser";
import type { LibraryScore } from "./score-library";

const xml = readFileSync("public/scores/sample-duet.musicxml", "utf8");
const practice: LibraryScore = {
  id: "imported-score",
  title: "My duet",
  xml,
  savedAt: "2026-09-24T10:00:00.000Z",
  session: {
    version: 1, seatId: "P1", instrumentKey: -2, shift: -2, tuning: 442,
    tempo: 84, beat: 5, startMeasure: 2, loopEnd: 4, loopEnabled: true,
    mode: "accompany", countInBars: 1, click: false, volume: 65, midiWritten: true,
  },
};
const today = new Date(2026, 8, 24, 10);

afterEach(() => vi.unstubAllGlobals());

describe("practice continuity", () => {
  it("aggregates actual playing time and distinct local dates while retaining the newest annotated score and settings", () => {
    const first = createPracticeJournalEntry(undefined, practice, 30.25, today)!;
    expect(first).toMatchObject({ totalPlayedSeconds: 30.25, sessionCount: 1, practiceDates: ["2026-09-24"], resumeMeasure: 2, seatName: "Clarinet" });
    const changed: LibraryScore = {
      ...practice,
      id: "new-snapshot-id",
      xml: updateMusicXMLAnnotation(xml, 2, { wait: { type: "listen" }, role: { mode: "follow", strength: "strong", factor: 0.8 } }),
      session: { ...practice.session!, tempo: 72, beat: 14 },
    };
    const second = createPracticeJournalEntry(first, changed, 65.5, new Date(2026, 8, 24, 23, 59))!;
    expect(second.id).toBe(first.id);
    expect(second.totalPlayedSeconds).toBe(95.75);
    expect(second.sessionCount).toBe(2);
    expect(second.practiceDates).toEqual(["2026-09-24"]);
    expect(second.practice.session).toEqual(changed.session);
    expect(second.practice.xml).toContain("Follow:strong");
    expect(second.resumeMeasure).toBe(4);
    const third = createPracticeJournalEntry(second, changed, 120, new Date(2026, 8, 25, 0, 1))!;
    expect(third.practiceDates).toEqual(["2026-09-24", "2026-09-25"]);
    expect(third.totalPlayedSeconds).toBe(215.75);
    expect(third.sessionCount).toBe(3);
    const delayed = createPracticeJournalEntry(third, practice, 10, today)!;
    expect(delayed.totalPlayedSeconds).toBe(225.75);
    expect(delayed.practice.session?.tempo).toBe(72);
    expect(delayed.lastPlayedAt).toBe(third.lastPlayedAt);
  });

  it("keeps instrument seats and changed musical works separate", () => {
    const first = createPracticeJournalEntry(undefined, practice, 30, today)!;
    const differentSeat = createPracticeJournalEntry(first, { ...practice, session: { ...practice.session!, seatId: "P2" } }, 40, today)!;
    const differentWork = createPracticeJournalEntry(first, { ...practice, xml: xml.replace("<step>C</step>", "<step>B</step>") }, 50, today)!;
    expect(differentSeat.id).not.toBe(first.id);
    expect(differentSeat.seatName).toBe("Piano");
    expect(differentSeat.totalPlayedSeconds).toBe(40);
    expect(differentWork.id).not.toBe(first.id);
    expect(differentWork.sessionCount).toBe(1);
  });

  it("labels the notated measure when resuming inside an expanded repeat", () => {
    const repeated = xml.replace("</measure>", '<barline location="right"><repeat direction="backward"/></barline></measure>');
    const entry = createPracticeJournalEntry(undefined, { ...practice, xml: repeated }, 20, today)!;
    expect(entry.practice.session?.beat).toBe(5);
    expect(entry.resumeMeasure).toBe(1);
    const afterRepeat = createPracticeJournalEntry(entry, { ...practice, xml: repeated, session: { ...practice.session!, beat: 9 } }, 10, today)!;
    expect(afterRepeat.resumeMeasure).toBe(2);
  });

  it("ignores accidental starts and rejects invalid duration or unrestorable snapshots", async () => {
    expect(createPracticeJournalEntry(undefined, practice, 2.99, today)).toBeNull();
    expect(await recordPracticeSession(practice, 0)).toBeNull();
    for (const seconds of [-1, NaN, Infinity, 86_401]) expect(() => createPracticeJournalEntry(undefined, practice, seconds, today)).toThrow("練習時間");
    expect(() => createPracticeJournalEntry(undefined, { ...practice, session: undefined }, 3, today)).toThrow("練習設定");
    expect(() => createPracticeJournalEntry(undefined, { ...practice, session: { ...practice.session!, seatId: "missing" } }, 3, today)).toThrow("存在する席");
    expect(() => createPracticeJournalEntry(undefined, { ...practice, session: { ...practice.session!, beat: 9000 } }, 3, today)).toThrow("不正");
  });

  it("retains the latest twelve works without changing their accumulated history", () => {
    const entry = createPracticeJournalEntry(undefined, practice, 60, today)!;
    const entries = Array.from({ length: 14 }, (_, index) => ({ ...entry, id: `work-${index}`, lastPlayedAt: new Date(2026, 8, index + 1).toISOString() }));
    const retained = retainPracticeJournal(entries);
    expect(retained.map(value => value.id)).toEqual(Array.from({ length: 12 }, (_, index) => `work-${13 - index}`));
    expect(retained.every(value => value.totalPlayedSeconds === 60 && value.practiceDates.length === 1)).toBe(true);
    expect(entries[0].id).toBe("work-0");
  });

  it("bounds the total retained snapshot bytes and rejects individual oversized files before parsing", () => {
    const entry = createPracticeJournalEntry(undefined, practice, 60, today)!;
    const large = { ...practice, xml: "x".repeat(14_000_000) };
    const entries = Array.from({ length: 3 }, (_, index) => ({ ...entry, id: `large-${index}`, practice: large, lastPlayedAt: new Date(2026, 8, index + 1).toISOString() }));
    expect(retainPracticeJournal(entries).map(value => value.id)).toEqual(["large-2", "large-1"]);
    expect(() => createPracticeJournalEntry(undefined, { ...practice, xml: "x".repeat(25_000_001) }, 3, today)).toThrow("大きいため");
  });

  it("reports unavailable storage and discards malformed stored metrics without claiming successful recording", async () => {
    vi.stubGlobal("indexedDB", undefined);
    await expect(listPracticeJournal()).rejects.toThrow("読み込めません");
    await expect(recordPracticeSession(practice, 3)).rejects.toThrow("保存できません");
    await expect(removePracticeJournalEntry("missing")).rejects.toThrow("削除できません");
    await expect(updatePracticeSnapshot(practice)).rejects.toThrow("保存できません");
    const entry = createPracticeJournalEntry(undefined, practice, 60, today)!;
    expect(retainPracticeJournal([
      { ...entry, totalPlayedSeconds: NaN },
      { ...entry, sessionCount: -1 },
      { ...entry, practiceDates: ["2026-09-24", "2026-09-24"] },
      { ...entry, lastPlayedAt: "yesterday" },
      entry,
    ])).toEqual([entry]);
  });

  it("updates a resume snapshot without counting another session or changing the last practice date", () => {
    const previous = createPracticeJournalEntry(undefined, practice, 60, today)!;
    const edited: LibraryScore = {
      ...practice,
      xml: updateMusicXMLAnnotation(xml, 2, { memo: "Keep the phrase flowing" }),
      session: { ...practice.session!, tempo: 72, beat: 14, loopEnabled: false },
    };
    const next = createPracticeJournalEntry(undefined, edited, 3, new Date(2026, 8, 30))!;
    const updated = mergePracticeSnapshot(previous, next)!;
    expect(updated.practice.xml).toContain("Keep the phrase flowing");
    expect(updated.practice.session).toEqual(edited.session);
    expect(updated.resumeMeasure).toBe(4);
    expect(updated.seatName).toBe(previous.seatName);
    expect(updated).toMatchObject({ totalPlayedSeconds: 60, sessionCount: 1, practiceDates: ["2026-09-24"], lastPlayedAt: previous.lastPlayedAt });
    expect(previous.practice.xml).not.toContain("Keep the phrase flowing");
    expect(mergePracticeSnapshot(undefined, next)).toBeNull();
    const otherSeat = createPracticeJournalEntry(undefined, { ...practice, session: { ...practice.session!, seatId: "P2" } }, 3, today)!;
    expect(mergePracticeSnapshot(previous, otherSeat)).toBeNull();
    expect(() => mergePracticeSnapshot(previous, { ...next, practice: { ...next.practice, xml: "x".repeat(25_000_000) } })).toThrow("保存できません");
  });

  it("commits deletion only in the history database and reports an aborted deletion as a failure", async () => {
    const deleteEntry = vi.fn();
    const close = vi.fn();
    const transaction = { objectStore: vi.fn(() => ({ delete: deleteEntry })), oncomplete: null, onerror: null, onabort: null } as unknown as IDBTransaction;
    const db = { close, transaction: vi.fn(() => transaction) };
    const request = { result: db, onsuccess: null } as unknown as IDBOpenDBRequest;
    const open = vi.fn(() => { queueMicrotask(() => request.onsuccess?.(new Event("success"))); return request; });
    vi.stubGlobal("indexedDB", { open });
    const deletion = removePracticeJournalEntry("one-work:P1");
    let committed = false;
    void deletion.then(() => { committed = true; });
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(open).toHaveBeenCalledWith("convocerto-practice-journal", 1);
    expect(db.transaction).toHaveBeenCalledWith("practice", "readwrite");
    expect(deleteEntry).toHaveBeenCalledExactlyOnceWith("one-work:P1");
    expect(committed).toBe(false);
    transaction.oncomplete?.(new Event("complete"));
    await deletion;
    expect(close).toHaveBeenCalledOnce();
    const failedDeletion = removePracticeJournalEntry("another-work:P2");
    await new Promise(resolve => setTimeout(resolve, 0));
    transaction.onabort?.(new Event("abort"));
    await expect(failedDeletion).rejects.toThrow("削除できません");
    await expect(removePracticeJournalEntry("")).rejects.toThrow("削除できません");
    expect(open).toHaveBeenCalledTimes(2);
  });
});
