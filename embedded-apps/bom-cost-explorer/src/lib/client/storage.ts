'use client';
/** localStorage that never throws (private mode, quota). */
export const ls = {
  get<T>(key: string, fallback: T): T {
    try {
      const v = localStorage.getItem(key);
      return v === null ? fallback : (JSON.parse(v) as T);
    } catch {
      return fallback;
    }
  },
  set(key: string, v: unknown): boolean {
    try {
      localStorage.setItem(key, JSON.stringify(v));
      return true;
    } catch {
      return false;
    }
  },
  del(key: string) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  },
};

/** Minimal IndexedDB key/value store - scenario RESULTS can be tens of MB (10k rows with rate
 * options), far beyond localStorage's ~5 MB, so only scenario definitions live in localStorage. */
const DB = 'bom-cost-explorer';
const STORE = 'results';
function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
  try {
    const db = await open();
    return await new Promise<T>((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const req = fn(t.objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return undefined;
  }
}
export const idb = {
  get: <T,>(k: string) => tx<T>('readonly', (s) => s.get(k) as IDBRequest<T>),
  set: (k: string, v: unknown) => tx('readwrite', (s) => s.put(v, k)),
  del: (k: string) => tx('readwrite', (s) => s.delete(k)),
};
