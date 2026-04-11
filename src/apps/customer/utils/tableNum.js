/**
 * tableNum.js — Shared utility to read and persist table number.
 *
 * Priority chain (most → least reliable):
 *   1. Current URL ?table= param
 *   2. localStorage (set by useSessionStore via joinTable or saveTableNum)
 *   3. sessionStorage (set on MenuHome mount)
 *   4. VITE_DEMO_TABLE_NUM env var
 *   5. 'T03' hardcoded fallback for demo
 *
 * Why localStorage NOT just sessionStorage:
 * sessionStorage is cleared on new tab / hard refresh on some browsers.
 * localStorage persists for the entire browser session and across navigation.
 */

// Save table number from URL into localStorage (and sessionStorage as backup).
// Call this once on app entry (CustomerApp / MenuHome mount).
export const saveTableNum = () => {
  const params = new URLSearchParams(window.location.search)
  const table = params.get('table')
  if (table) {
    localStorage.setItem('tableNum', table)
    sessionStorage.setItem('tableNum', table)
  }
}

// Get table number — works even after React Router drops ?table= from URL.
export const getTableNum = () => {
  // 1. Current URL (most reliable when present)
  const params = new URLSearchParams(window.location.search)
  const fromUrl = params.get('table')
  if (fromUrl) {
    // Re-persist every time we see it in URL
    localStorage.setItem('tableNum', fromUrl)
    sessionStorage.setItem('tableNum', fromUrl)
    return fromUrl
  }

  // 2. localStorage (survives navigation + new tabs)
  const fromLocal = localStorage.getItem('tableNum')
  if (fromLocal) return fromLocal

  // 3. sessionStorage (survives navigation within same tab)
  const fromSession = sessionStorage.getItem('tableNum')
  if (fromSession) return fromSession

  // 4. Env var
  const fromEnv = import.meta.env.VITE_DEMO_TABLE_NUM
  if (fromEnv) return fromEnv

  // 5. Demo fallback
  return 'T03'
}
