// ============================================================
// src/utils/permission-cache.ts
// In-memory LRU with TTL. Drop-in replaceable with Redis.
// Cache key: `perm:{userId}:{tenantId}`
// TTL: 5 minutes (roles rarely change mid-session)
// ============================================================

import type { Permission } from '../types/rbac.types';

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface CacheEntry {
  permissions: Set<Permission>;
  cachedAt:    number;
}

// Simple bounded in-memory map. Replace with ioredis for multi-instance.
const store = new Map<string, CacheEntry>();
const MAX_ENTRIES = 2000; // evict LRU after this

function cacheKey(userId: string, tenantId: string | null): string {
  return `perm:${userId}:${tenantId ?? 'global'}`;
}

export const permissionCache = {
  get(userId: string, tenantId: string | null): Set<Permission> | null {
    const key   = cacheKey(userId, tenantId);
    const entry = store.get(key);
    if (!entry) return null;
    if (Date.now() - entry.cachedAt > CACHE_TTL_MS) {
      store.delete(key);
      return null;
    }
    return entry.permissions;
  },

  set(userId: string, tenantId: string | null, permissions: Set<Permission>): void {
    if (store.size >= MAX_ENTRIES) {
      // Evict oldest entry (first inserted — Map preserves insertion order)
      const firstKey = store.keys().next().value;
      if (firstKey) store.delete(firstKey);
    }
    store.set(cacheKey(userId, tenantId), {
      permissions,
      cachedAt: Date.now(),
    });
  },

  invalidate(userId: string, tenantId: string | null): void {
    store.delete(cacheKey(userId, tenantId));
  },

  invalidateUser(userId: string): void {
    // Invalidate all tenant entries for this user (used on role change)
    for (const key of store.keys()) {
      if (key.startsWith(`perm:${userId}:`)) {
        store.delete(key);
      }
    }
  },

  clear(): void {
    store.clear();
  },
};
