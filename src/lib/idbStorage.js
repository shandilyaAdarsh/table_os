import { openDB } from 'idb';

const DB_NAME = 'tableos-runtime-db';
const DB_VERSION = 2;

export const initDB = async () => {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion, newVersion, transaction) {
      if (!db.objectStoreNames.contains('keyval')) {
        db.createObjectStore('keyval');
      }
      if (!db.objectStoreNames.contains('mutation_queue')) {
        db.createObjectStore('mutation_queue', { keyPath: 'mutation_id' });
      }
      if (!db.objectStoreNames.contains('idempotency_tombstones')) {
        db.createObjectStore('idempotency_tombstones', { keyPath: 'idempotency_key' });
      }
    },
  });
};

/**
 * Custom Zustand storage engine utilizing IndexedDB.
 */
export const idbZustandStorage = {
  getItem: async (name) => {
    const db = await initDB();
    const value = await db.get('keyval', name);
    return value || null;
  },
  setItem: async (name, value) => {
    const db = await initDB();
    await db.put('keyval', value, name);
  },
  removeItem: async (name) => {
    const db = await initDB();
    await db.delete('keyval', name);
  },
};

// ─── Runtime Cleanup Utilities ────────────────────────────────────────────────

/**
 * Clear only the KDS identity/leadership state from IDB.
 * Safe to call — preserves mutation queue integrity.
 */
export const clearLeadershipState = async () => {
  const db = await initDB();
  await db.delete('keyval', 'tableos-kds-identity');
  console.info('[IDB] KDS identity state cleared. Leadership lease reset.');
};

/**
 * Clear all runtime projection + identity state.
 * Does NOT clear the mutation queue — pending operations are preserved.
 */
export const clearRuntimeProjectionState = async () => {
  const db = await initDB();
  const allKeys = await db.getAllKeys('keyval');
  const projectionKeys = allKeys.filter(
    (k) =>
      k.startsWith('tableos-') &&
      !k.includes('mutation') &&
      k !== 'tableos-transport-engine' // preserve cursor
  );
  for (const key of projectionKeys) {
    await db.delete('keyval', key);
  }
  console.info('[IDB] Runtime projection state cleared:', projectionKeys);
};

/**
 * Full dev runtime reset. Clears all IDB state EXCEPT the mutation queue.
 * The mutation queue is preserved to avoid losing offline operations.
 */
export const clearAllRuntimeState = async () => {
  const db = await initDB();
  const allKeys = await db.getAllKeys('keyval');
  for (const key of allKeys) {
    await db.delete('keyval', key);
  }
  // Clear idempotency tombstones (they expire naturally, but reset on dev flush)
  const tombstoneKeys = await db.getAllKeys('idempotency_tombstones');
  for (const key of tombstoneKeys) {
    await db.delete('idempotency_tombstones', key);
  }
  console.warn('[IDB] ⚡ Full runtime state cleared (mutation queue preserved).');
};

/**
 * Inspect current runtime IDB state — returns a diagnostic snapshot.
 * Useful for the RuntimeDiagnostics panel and structured console output.
 */
export const inspectRuntimeState = async () => {
  const db = await initDB();

  const keyvalKeys = await db.getAllKeys('keyval');
  const keyvalEntries = {};
  for (const key of keyvalKeys) {
    try {
      const raw = await db.get('keyval', key);
      keyvalEntries[key] = typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch {
      keyvalEntries[key] = '[unparseable]';
    }
  }

  const mutationQueueItems = await db.getAll('mutation_queue');
  const tombstoneCount = (await db.getAllKeys('idempotency_tombstones')).length;

  const snapshot = {
    keyval: keyvalEntries,
    mutationQueue: mutationQueueItems,
    tombstoneCount,
    snapshotAt: new Date().toISOString(),
  };

  console.group('[IDB] Runtime State Snapshot');
  console.log('Keyval entries:', keyvalEntries);
  console.log('Mutation queue:', mutationQueueItems);
  console.log('Idempotency tombstones:', tombstoneCount);
  console.groupEnd();

  return snapshot;
};
