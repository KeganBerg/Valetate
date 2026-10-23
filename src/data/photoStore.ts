import type { CarPhoto } from '../types';

/** Local-mode photo storage: blobs in IndexedDB (localStorage is far too small for pictures). */
const DB = 'valetate-photos';
const STORE = 'photos';

type Row = Omit<CarPhoto, 'url'> & { blob: Blob };

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      const store = req.result.createObjectStore(STORE, { keyPath: 'id' });
      store.createIndex('carId', 'carId');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const req = fn(db.transaction(STORE, mode).objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

// object URLs are made once per photo so re-listing doesn't leak them
const urls = new Map<string, string>();
const withUrl = ({ blob, ...r }: Row): CarPhoto => {
  if (!urls.has(r.id)) urls.set(r.id, URL.createObjectURL(blob));
  return { ...r, url: urls.get(r.id)! };
};

export const localPhotos = {
  async list(carId: string): Promise<CarPhoto[]> {
    const rows = await run<Row[]>('readonly', (s) => s.index('carId').getAll(carId));
    return rows.sort((a, b) => a.takenAt - b.takenAt).map(withUrl);
  },
  async put(row: Row): Promise<CarPhoto> {
    await run('readwrite', (s) => s.put(row));
    return withUrl(row);
  },
  async setDamage(id: string, damage: boolean) {
    const row = await run<Row | undefined>('readonly', (s) => s.get(id));
    if (row) await run('readwrite', (s) => s.put({ ...row, damage }));
  },
};
