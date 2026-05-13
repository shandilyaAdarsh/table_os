-- ============================================================
-- Migration: 003_auth_audit_logs
-- Table: auth_audit_logs
-- Immutable append-only audit trail. No UPDATE or DELETE allowed.
-- ============================================================

-- ─── Event type enum ─────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE public.auth_event_type AS ENUM (
    'LOGIN_SUCCESS',
    'LOGIN_FAILED',
    'LOGOUT',
    'TOKEN_REFRESH',
    'PASSWORD_RESET_REQUESTED',
    'PASSWORD_RESET_COMPLETED',
    'SESSION_EXPIRED',
    'SESSION_REVOKED',
    'ACCOUNT_LOCKED',
    'SUSPICIOUS_ACTIVITY'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ─── Table ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.auth_audit_logs (
  id                    UUID              NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Actor (nullable for pre-auth events like rate limit blocks)
  user_id               UUID              REFERENCES auth.users(id) ON DELETE SET NULL,
  tenant_id             UUID,
  device_session_id     UUID,             -- References device_sessions but no FK (log survives session deletion)

  -- Event
  event_type            public.auth_event_type NOT NULL,

  -- Context
  ip_address            TEXT,
  user_agent            TEXT,
  device_fingerprint    TEXT,
  metadata              JSONB             NOT NULL DEFAULT '{}',
  failure_reason        TEXT,

  -- Immutable timestamp — no updated_at on audit logs
  created_at            TIMESTAMPTZ       NOT NULL DEFAULT NOW()
);

-- ─── Indexes ─────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_auth_audit_logs_user_id
  ON public.auth_audit_logs (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_auth_audit_logs_event_type
  ON public.auth_audit_logs (event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_auth_audit_logs_tenant_id
  ON public.auth_audit_logs (tenant_id, created_at DESC)
  WHERE tenant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_auth_audit_logs_created_at
  ON public.auth_audit_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_auth_audit_logs_ip_address
  ON public.auth_audit_logs (ip_address, created_at DESC)
  WHERE ip_address IS NOT NULL;

-- ─── Immutability enforcement ─────────────────────────────────
-- Prevent UPDATE and DELETE on audit logs
CREATE OR REPLACE RULE no_update_auth_audit_logs AS
  ON UPDATE TO public.auth_audit_logs DO INSTEAD NOTHING;

CREATE OR REPLACE RULE no_delete_auth_audit_logs AS
  ON DELETE TO public.auth_audit_logs DO INSTEAD NOTHING;

-- ─── RLS ─────────────────────────────────────────────────────
ALTER TABLE public.auth_audit_logs ENABLE ROW LEVEL SECURITY;

-- SUPER_ADMIN can read all logs — scoped via backend RBAC check
-- No direct client writes — backend service_role only
CREATE POLICY "audit_logs_service_role_only"
  ON public.auth_audit_logs
  FOR ALL
  USING (FALSE);  -- Block all direct client access; backend uses service_role

COMMENT ON TABLE public.auth_audit_logs IS
  'Immutable auth event audit trail. '
  'No UPDATE or DELETE permitted — append-only via DB rules. '
  'device_session_id is intentionally NOT a FK so logs survive session deletion.';
