import type { PaperId } from "../shared/paper";

// Finished booklets are kept in this browser's IndexedDB. Nothing is stored
// on the server.

export interface SavedBooklet {
  id: string;
  title: string;
  sourceUrl: string;
  paper: PaperId;
  pages: number;
  sheets: number;
  createdAt: number;
  pdf: Blob;
}

const DB_NAME = "booklets";
const STORE = "booklets";

let dbPromise: Promise<IDBDatabase> | null = null;

function db(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const tx = (await db()).transaction(STORE, mode);
  const req = fn(tx.objectStore(STORE));
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(req.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function listBooklets(): Promise<SavedBooklet[]> {
  const all = await run<SavedBooklet[]>("readonly", (s) => s.getAll());
  return all.sort((a, b) => b.createdAt - a.createdAt);
}

export async function saveBooklet(booklet: SavedBooklet): Promise<void> {
  await run("readwrite", (s) => s.put(booklet));
}

export async function deleteBooklet(id: string): Promise<void> {
  await run("readwrite", (s) => s.delete(id));
}
