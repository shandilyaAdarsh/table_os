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
        // Store idempotency_key as keyPath, timestamp as value
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
