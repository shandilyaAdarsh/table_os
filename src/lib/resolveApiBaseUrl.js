// src/lib/resolveApiBaseUrl.js
// Centralized API URL resolution — single source of truth.
// Extracted to its own module to avoid circular dependency with runtime.

export function resolveApiBaseUrl() {
  return import.meta.env.VITE_API_URL || (typeof window !== 'undefined' ? `http://${window.location.hostname}:3001` : 'http://localhost:3001');
}
