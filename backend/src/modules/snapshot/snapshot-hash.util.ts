// ============================================================
// src/modules/snapshot/snapshot-hash.util.ts
// Deterministic SHA-256 snapshot hash generation.
//
// Guarantees:
//   - Same input data always produces the same hash
//   - Keys are sorted at every level (lexicographic)
//   - Compact JSON serialization (no whitespace)
//   - Prefixed with algorithm identifier: "sha256:"
//
// Per snapshot_payload_spec.md §7.
// ============================================================

import crypto from 'node:crypto';
import type { BranchMenuSnapshotPayload } from './snapshot.dtos';

/**
 * Deep-sorts all object keys lexicographically and all arrays
 * in their already-canonical order (per-spec: sort is done
 * by the serializer BEFORE hashing, so arrays arrive sorted).
 *
 * This produces stable canonical JSON for the SHA-256 input.
 */
function sortedJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortedJson);
  }

  if (value !== null && typeof value === 'object') {
    const sorted: Record<string, unknown> = {};
    // Lexicographic key sort
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = sortedJson((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }

  return value;
}

/**
 * Generates a deterministic SHA-256 hash of the snapshot payload
 * (the payload WITHOUT the snapshot_hash field itself).
 *
 * Returns the hash in the format: "sha256:<64-char-hex>"
 */
export function generateSnapshotHash(payload: BranchMenuSnapshotPayload): string {
  const canonical = JSON.stringify(sortedJson(payload));
  const digest = crypto.createHash('sha256').update(canonical, 'utf8').digest('hex');
  return `sha256:${digest}`;
}

/**
 * Formats the snapshot hash as an ETag header value.
 * ETag must be quoted per RFC 7232.
 */
export function formatETag(snapshotHash: string): string {
  return `"${snapshotHash}"`;
}

/**
 * Parses an If-None-Match header value and extracts the raw hash.
 * Returns null if the header is absent or malformed.
 */
export function parseIfNoneMatch(ifNoneMatchHeader: string | undefined): string | null {
  if (!ifNoneMatchHeader) return null;

  // Strip surrounding quotes (RFC 7232 §2.3 strong ETags are double-quoted)
  const stripped = ifNoneMatchHeader.replace(/^"(.*)"$/, '$1');

  // Validate format: must start with "sha256:" followed by 64 hex chars
  if (/^sha256:[0-9a-f]{64}$/.test(stripped)) {
    return stripped;
  }

  return null;
}
