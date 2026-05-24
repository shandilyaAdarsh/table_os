-- ============================================================
-- Migration: 20260519000018_waiter_calls.sql
-- Production-grade table for waiter paging requests.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.waiter_calls (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID        NOT NULL,
  branch_id       UUID        NOT NULL,
  table_id        UUID        NOT NULL REFERENCES public.tables (id),
  session_id      UUID        REFERENCES public.qr_sessions (id),
  type            TEXT        NOT NULL CHECK (type IN ('service', 'bill', 'other')),
  notes           TEXT,
  status          TEXT        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'acknowledged', 'resolved')),
  acknowledged_by UUID,
  acknowledged_at TIMESTAMPTZ,
  resolved_by     UUID,
  resolved_at     TIMESTAMPTZ,
  version_num     INTEGER     NOT NULL DEFAULT 1,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_waiter_calls_tenant_id
  ON public.waiter_calls (tenant_id);

CREATE INDEX IF NOT EXISTS idx_waiter_calls_branch_id
  ON public.waiter_calls (branch_id);

CREATE INDEX IF NOT EXISTS idx_waiter_calls_status
  ON public.waiter_calls (branch_id, status)
  WHERE (status = 'pending');

DROP TRIGGER IF EXISTS handle_waiter_calls_updated_at ON public.waiter_calls;
CREATE TRIGGER handle_waiter_calls_updated_at
  BEFORE UPDATE ON public.waiter_calls
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS increment_waiter_calls_version ON public.waiter_calls;
CREATE TRIGGER increment_waiter_calls_version
  BEFORE UPDATE ON public.waiter_calls
  FOR EACH ROW EXECUTE FUNCTION public.increment_version_num();

-- Enable RLS
ALTER TABLE public.waiter_calls ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "waiter_calls_tenant_isolation" ON public.waiter_calls;
CREATE POLICY "waiter_calls_tenant_isolation" ON public.waiter_calls
  AS RESTRICTIVE FOR ALL
  USING (auth.jwt() ->> 'tenant_id' = tenant_id::text);

DROP POLICY IF EXISTS "waiter_calls_authenticated_access" ON public.waiter_calls;
CREATE POLICY "waiter_calls_authenticated_access" ON public.waiter_calls
  AS PERMISSIVE FOR ALL
  USING (auth.role() = 'authenticated');

COMMIT;
