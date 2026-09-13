import type { PracticeSession } from "./practice-session";
export interface LibraryScore { id: string; title: string; xml: string; savedAt: string; session?: PracticeSession }

function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("convocerto-library", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("scores", { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error("楽譜ライブラリを開けませんでした。"));
  });
}

async function operation<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction("scores", mode);
    const request = action(transaction.objectStore("scores"));
    transaction.oncomplete = () => { db.close(); resolve(request.result); };
    transaction.onerror = () => { db.close(); reject(transaction.error); };
    transaction.onabort = () => { db.close(); reject(transaction.error); };
  });
}
export const listLibraryScores = () => operation("readonly", (store) => store.getAll()) as Promise<LibraryScore[]>;
export const saveLibraryScore = (score: LibraryScore) => operation("readwrite", (store) => store.put(score));
export const removeLibraryScore = (id: string) => operation("readwrite", (store) => store.delete(id));
