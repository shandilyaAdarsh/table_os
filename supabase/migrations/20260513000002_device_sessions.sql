-- ============================================================
-- Migration: 002_device_sessions
-- Table: device_sessions
-- Tracks active sessions per device for replay attack prevention.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.device_sessions (
  id                    UUID          NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Ownership
  user_id               UUID          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id             UUID,           -- Denormalized for fast tenant-scoped queries

  -- Supabase session linkage
  supabase_session_id   TEXT,

  -- Device identification
  device_fingerprint    TEXT          NOT NULL,
  user_agent            TEXT,
  ip_address            TEXT,
  country_code          CHAR(2),        -- ISO 3166-1 alpha-2, populated by geo-lookup if added

  -- Session state
  is_active             BOOLEAN       NOT NULL DEFAULT TRUE,
  last_token_hash       TEXT,           -- SHA-256 of last issued access token (replay detection)
  expires_at            TIMESTAMPTZ   NOT NULL,
  revoked_at            TIMESTAMPTZ,
  revoke_reason         TEXT,

  -- Audit
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ─── Indexes ─────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_device_sessions_user_id
  ON public.device_sessions (user_id)
  WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_device_sessions_fingerprint
  ON public.device_sessions (device_fingerprint, is_active);

CREATE INDEX IF NOT EXISTS idx_device_sessions_expires_at
  ON public.device_sessions (expires_at)
  WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_device_sessions_tenant_id
  ON public.device_sessions (tenant_id)
  WHERE is_active = TRUE;

-- ─── updated_at trigger ───────────────────────────────────────
DROP TRIGGER IF EXISTS trg_device_sessions_updated_at ON public.device_sessions;
CREATE TRIGGER trg_device_sessions_updated_at
  BEFORE UPDATE ON public.device_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ─── RLS ─────────────────────────────────────────────────────
ALTER TABLE public.device_sessions ENABLE ROW LEVEL SECURITY;

-- Backend owns all session operations — no direct client access
-- No SELECT policy: clients never query device_sessions directly

COMMENT ON TABLE public.device_sessions IS
  'Active device sessions. Tracks one session per device per login. '
  'last_token_hash enables replay attack detection. '
  'Backend (service_role) owns all operations.';
