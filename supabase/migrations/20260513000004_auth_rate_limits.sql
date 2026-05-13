-- ============================================================
-- Migration: 004_auth_rate_limits
-- Table: auth_rate_limits
-- IP + email rate limiting state. Keyed by arbitrary string.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.auth_rate_limits (
  -- Key format examples:
  --   login:ip:192.168.1.1
  --   login:email:user@example.com
  key             TEXT          NOT NULL PRIMARY KEY,

  -- Sliding window
  window_start    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  attempt_count   INTEGER       NOT NULL DEFAULT 1,

  -- Block state
  blocked_until   TIMESTAMPTZ,

  -- Audit
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_attempt_count_positive CHECK (attempt_count > 0)
);

-- ─── Indexes ─────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_auth_rate_limits_blocked_until
  ON public.auth_rate_limits (blocked_until)
  WHERE blocked_until IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_auth_rate_limits_window_start
  ON public.auth_rate_limits (window_start);

-- ─── updated_at trigger ───────────────────────────────────────
DROP TRIGGER IF EXISTS trg_auth_rate_limits_updated_at ON public.auth_rate_limits;
CREATE TRIGGER trg_auth_rate_limits_updated_at
  BEFORE UPDATE ON public.auth_rate_limits
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ─── Auto-cleanup of expired rate limit records ───────────────
-- Optional: schedule via pg_cron or Supabase scheduled functions
-- DELETE FROM auth_rate_limits
--   WHERE window_start < NOW() - INTERVAL '2 hours'
--   AND (blocked_until IS NULL OR blocked_until < NOW());

-- ─── RLS ─────────────────────────────────────────────────────
ALTER TABLE public.auth_rate_limits ENABLE ROW LEVEL SECURITY;

-- Backend service_role only — no client access
CREATE POLICY "rate_limits_service_role_only"
  ON public.auth_rate_limits
  FOR ALL
  USING (FALSE);

COMMENT ON TABLE public.auth_rate_limits IS
  'Sliding window rate limit state for auth endpoints. '
  'Keyed by "event_type:dimension:value" (e.g. login:ip:1.2.3.4). '
  'Backend (service_role) owns all operations.';
