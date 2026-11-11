import { brandSchema, campaignSchema, type Brand, type Campaign } from './schemas';

const DB_NAME = 'adspark';
const DB_VERSION = 1;
export const STORES = { campaigns: 'campaigns', brands: 'brands', settings: 'settings' } as const;
type StoreName = (typeof STORES)[keyof typeof STORES];

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available in this browser.'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORES.campaigns)) db.createObjectStore(STORES.campaigns, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(STORES.brands)) db.createObjectStore(STORES.brands, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(STORES.settings)) db.createObjectStore(STORES.settings);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      dbPromise = null;
      reject(req.error ?? new Error('Could not open the local database.'));
    };
    req.onblocked = () => reject(new Error('The local database is blocked by another open tab.'));
  });
  return dbPromise;
}

function run<T>(store: StoreName, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(store, mode);
        const request = fn(tx.objectStore(store));
        tx.oncomplete = () => resolve(request ? (request.result as T) : (undefined as T));
        tx.onerror = () => reject(tx.error ?? new Error('Database transaction failed.'));
        tx.onabort = () => reject(tx.error ?? new Error('Database transaction aborted.'));
      }),
  );
}

export interface LoadResult<T> {
  items: T[];
  /** Records that failed validation and were skipped (kept in the database untouched). */
  skipped: number;
}

function validateAll<T>(raw: unknown[], parse: (v: unknown) => { success: boolean; data?: T }): LoadResult<T> {
  const items: T[] = [];
  let skipped = 0;
  for (const value of raw) {
    const r = parse(value);
    if (r.success && r.data) items.push(r.data);
    else skipped++;
  }
  return { items, skipped };
}

export const db = {
  async listCampaigns(): Promise<LoadResult<Campaign>> {
    const raw = await run<unknown[]>(STORES.campaigns, 'readonly', (s) => s.getAll());
    const result = validateAll(raw ?? [], (v) => campaignSchema.safeParse(v));
    result.items.sort((a, b) => b.updatedAt - a.updatedAt);
    return result;
  },
  putCampaign(c: Campaign) {
    return run(STORES.campaigns, 'readwrite', (s) => s.put(c));
  },
  deleteCampaign(id: string) {
    return run(STORES.campaigns, 'readwrite', (s) => s.delete(id));
  },
  async listBrands(): Promise<LoadResult<Brand>> {
    const raw = await run<unknown[]>(STORES.brands, 'readonly', (s) => s.getAll());
    const result = validateAll(raw ?? [], (v) => brandSchema.safeParse(v));
    result.items.sort((a, b) => a.createdAt - b.createdAt);
    return result;
  },
  putBrand(b: Brand) {
    return run(STORES.brands, 'readwrite', (s) => s.put(b));
  },
  deleteBrand(id: string) {
    return run(STORES.brands, 'readwrite', (s) => s.delete(id));
  },
  getSetting<T>(key: string): Promise<T | undefined> {
    return run<T | undefined>(STORES.settings, 'readonly', (s) => s.get(key) as IDBRequest<T | undefined>);
  },
  setSetting(key: string, value: unknown) {
    return run(STORES.settings, 'readwrite', (s) => s.put(value, key));
  },
  async clearAll() {
    await run(STORES.campaigns, 'readwrite', (s) => s.clear());
    await run(STORES.brands, 'readwrite', (s) => s.clear());
    await run(STORES.settings, 'readwrite', (s) => s.clear());
  },
};
