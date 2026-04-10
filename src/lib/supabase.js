/**
 * src/lib/supabase.js
 *
 * Dev-safe mock Supabase client backed by mock/data.js.
 *
 * To switch to real Supabase:
 * 1. npm install @supabase/supabase-js
 * 2. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env.local
 * 3. Uncomment the two lines at the bottom of this file
 */

import { menuItems } from '../mock/data'

// ─── Mock rows registry ──────────────────────────────────────────────────────
const MOCK_DB = {
  menu_items:        [...menuItems],
  orders:            [],
  order_items:       [],
  restaurant_tables: [],
  tenants:           [],
  staff:             [],
}

// ─── Chainable mock query builder ────────────────────────────────────────────
class MockQuery {
  constructor(rows, table) {
    this._rows     = [...(rows || [])]
    this._table    = table
    this._inserted = null
  }

  select()  { return this }

  eq(col, val) {
    // Boolean columns: is_available — compare without coercing so true === true
    this._rows = this._rows.filter(r => r[col] === val)
    return this
  }

  neq(col, val) {
    this._rows = this._rows.filter(r => r[col] !== val)
    return this
  }

  order(col, opts) {
    if (col) {
      const dir = opts?.ascending === false ? -1 : 1
      this._rows = [...this._rows].sort((a, b) =>
        a[col] < b[col] ? -dir : a[col] > b[col] ? dir : 0
      )
    }
    return this
  }

  insert(data) {
    const newRow = Array.isArray(data) ? data[0] : data
    const row = {
      id: `mock-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      created_at: new Date().toISOString(),
      ...newRow,
    }
    if (this._table && MOCK_DB[this._table]) MOCK_DB[this._table].push(row)
    this._inserted = row
    this._rows = [row]
    return this
  }

  update(data) {
    this._rows = this._rows.map(r => ({ ...r, ...data }))
    return this
  }

  single() {
    const row = this._inserted || this._rows[0] || null
    return Promise.resolve({ data: row, error: null })
  }

  // Thenable — allows `await supabase.from(...).select()` without calling .single()
  then(resolve, reject) {
    return Promise.resolve({ data: this._rows, error: null }).then(resolve, reject)
  }
}

// ─── No-op Realtime channel ──────────────────────────────────────────────────
const noopChannel = {
  on()        { return this },
  subscribe() { return this },
}

// ── To enable REAL Supabase, uncomment below (requires npm install @supabase/supabase-js): ──
import { createClient } from '@supabase/supabase-js'
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  {
    realtime: {
      params: {
        eventsPerSecond: 10
      }
    }
  }
)
