const DB_NAME = 'polyglot_audio_cache';
const DB_VERSION = 1;
const STORE_NAME = 'tts_audio';
const MAX_CACHE_BYTES = 60 * 1024 * 1024;

interface CachedAudioRecord {
  key: string;
  data: ArrayBuffer;
  createdAt: number;
  lastUsedAt: number;
  byteLength: number;
}

const canUseIndexedDB = () =>
  typeof indexedDB !== 'undefined';

const openAudioCacheDb = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    if (!canUseIndexedDB()) {
      reject(new Error('IndexedDB unavailable'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'key' });
        store.createIndex('lastUsedAt', 'lastUsedAt');
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Failed to open audio cache'));
  });
};

const withAudioStore = async <T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> => {
  const db = await openAudioCacheDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode);
    const store = tx.objectStore(STORE_NAME);
    const request = action(store);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Audio cache operation failed'));
    tx.oncomplete = () => db.close();
    tx.onerror = () => {
      db.close();
      reject(tx.error || new Error('Audio cache transaction failed'));
    };
  });
};

export const readCachedAudio = async (key: string): Promise<ArrayBuffer | null> => {
  try {
    const record = await withAudioStore<CachedAudioRecord | undefined>('readwrite', store => store.get(key));
    if (!record) return null;

    const updated: CachedAudioRecord = {
      ...record,
      lastUsedAt: Date.now()
    };
    await withAudioStore<IDBValidKey>('readwrite', store => store.put(updated));
    return record.data;
  } catch {
    return null;
  }
};

export const writeCachedAudio = async (key: string, data: ArrayBuffer): Promise<void> => {
  try {
    const now = Date.now();
    const record: CachedAudioRecord = {
      key,
      data,
      createdAt: now,
      lastUsedAt: now,
      byteLength: data.byteLength
    };

    await withAudioStore<IDBValidKey>('readwrite', store => store.put(record));
    await pruneAudioCache();
  } catch {
    // Cache is best-effort. Playback must not fail if storage is unavailable or full.
  }
};

const getAllAudioRecords = async (): Promise<CachedAudioRecord[]> => {
  return await withAudioStore<CachedAudioRecord[]>('readonly', store => store.getAll());
};

const deleteAudioRecord = async (key: string): Promise<void> => {
  await withAudioStore<undefined>('readwrite', store => store.delete(key) as IDBRequest<undefined>);
};

const pruneAudioCache = async () => {
  try {
    const records = await getAllAudioRecords();
    let totalBytes = records.reduce((sum, record) => sum + record.byteLength, 0);
    if (totalBytes <= MAX_CACHE_BYTES) return;

    const oldestFirst = [...records].sort((a, b) => a.lastUsedAt - b.lastUsedAt);
    for (const record of oldestFirst) {
      if (totalBytes <= MAX_CACHE_BYTES) break;
      await deleteAudioRecord(record.key);
      totalBytes -= record.byteLength;
    }
  } catch {
    // Cache pruning is best-effort.
  }
};
