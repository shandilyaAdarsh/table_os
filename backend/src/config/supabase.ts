// ============================================================
// src/config/supabase.ts
// Two Supabase clients:
//   supabaseAdmin → service_role (bypasses RLS) — server-side ONLY
//   supabaseAnon  → anon key (respects RLS)
// NEVER expose service_role key outside this server.
// ============================================================

import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { env } from './env';

/**
 * Admin client — service_role key.
 * Bypasses Row Level Security.
 * Use ONLY for server-side auth operations: login, session management, auditing.
 */
export const supabaseAdmin: SupabaseClient = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  {
    global: {
      // Explicitly pin the service_role key in the Authorization header.
      // This prevents the Supabase JS client's internal auth session state
      // from ever overriding the service_role header after admin operations
      // like auth.admin.updateUserById() mutate the singleton's session state.
      headers: {
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
    },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

/**
 * Anon client — respects RLS.
 * Use for user-scoped operations where RLS should apply.
 */
export const supabaseAnon: SupabaseClient = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_ANON_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

/**
 * Create a per-request user-scoped client.
 * Passes the user's JWT so RLS policies are enforced.
 * Create a NEW instance per request — never reuse across users.
 */
export function createUserClient(accessToken: string): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    global: {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
