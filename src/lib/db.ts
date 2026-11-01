import type { Segment } from "./render";
import type { Word, WordList } from "./types";

// Minimal IndexedDB wrapper. Stores: word lists, synthesized audio clips keyed
// by hash, and the last rendered session (so it can be resumed offline).

const DB_NAME = "parrot";
const VERSION = 2;

interface ClipRecord {
  hash: string;
  blob: Blob;
  createdAt: number;
}

let dbPromise: Promise<IDBDatabase> | undefined;

function open(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("lists")) db.createObjectStore("lists", { keyPath: "id" });
      if (!db.objectStoreNames.contains("clips")) db.createObjectStore("clips", { keyPath: "hash" });
      if (!db.objectStoreNames.contains("sessions")) db.createObjectStore("sessions", { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function run<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const req = fn(tx.objectStore(store));
    tx.oncomplete = () => resolve(req.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

/** Asks the browser not to evict our data (Safari otherwise may after 7 idle days). */
export function requestPersistence(): void {
  navigator.storage?.persist?.().catch(() => {});
}

export const listsDb = {
  async all(): Promise<WordList[]> {
    const lists = await run<WordList[]>("lists", "readonly", (s) => s.getAll());
    return lists.sort((a, b) => b.updatedAt - a.updatedAt);
  },
  get: (id: string) => run<WordList | undefined>("lists", "readonly", (s) => s.get(id)),
  async put(list: WordList): Promise<void> {
    requestPersistence();
    await run("lists", "readwrite", (s) => s.put({ ...list, updatedAt: Date.now() }));
  },
  async delete(id: string): Promise<void> {
    await run("lists", "readwrite", (s) => s.delete(id));
  },
};

export const clipsDb = {
  async get(hash: string): Promise<Blob | undefined> {
    const record = await run<ClipRecord | undefined>("clips", "readonly", (s) => s.get(hash));
    return record?.blob;
  },
  async put(hash: string, blob: Blob): Promise<void> {
    await run("clips", "readwrite", (s) => s.put({ hash, blob, createdAt: Date.now() } satisfies ClipRecord));
  },
  async has(hash: string): Promise<boolean> {
    return (await run<IDBValidKey | undefined>("clips", "readonly", (s) => s.getKey(hash))) !== undefined;
  },
  async delete(hash: string): Promise<void> {
    await run("clips", "readwrite", (s) => s.delete(hash));
  },
  count: () => run<number>("clips", "readonly", (s) => s.count()),
  async clear(): Promise<void> {
    await run("clips", "readwrite", (s) => s.clear());
  },
};

export interface SavedSession {
  id: "last";
  wav: Blob;
  duration: number;
  segments: Segment[];
  /** The word in each slot, in play order. */
  slots: Word[];
  listId: string;
  languageCode: string;
  title: string;
  createdAt: number;
}

export const sessionsDb = {
  get: () => run<SavedSession | undefined>("sessions", "readonly", (s) => s.get("last")),
  async put(session: SavedSession): Promise<void> {
    await run("sessions", "readwrite", (s) => s.put(session));
  },
};
