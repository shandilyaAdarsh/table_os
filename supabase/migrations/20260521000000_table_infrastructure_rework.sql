-- ============================================================
-- Migration: 20260521000000_table_infrastructure_rework.sql
-- Table Infrastructure + QR Runtime Phase
-- ============================================================

BEGIN;

-- ─── 1. table_floors ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.table_floors (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID          NOT NULL,
  branch_id       UUID          NOT NULL,
  name            TEXT          NOT NULL,
  sort_order      INTEGER       NOT NULL DEFAULT 0,
  version_num     INTEGER       NOT NULL DEFAULT 1,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ
);

CREATE INDEX idx_table_floors_branch ON public.table_floors(tenant_id, branch_id) WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS handle_table_floors_updated_at ON public.table_floors;
CREATE TRIGGER handle_table_floors_updated_at
  BEFORE UPDATE ON public.table_floors
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS increment_table_floors_version ON public.table_floors;
CREATE TRIGGER increment_table_floors_version
  BEFORE UPDATE ON public.table_floors
  FOR EACH ROW EXECUTE FUNCTION public.increment_version_num();


-- ─── 2. table_sections ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.table_sections (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID          NOT NULL,
  branch_id       UUID          NOT NULL,
  name            TEXT          NOT NULL,
  sort_order      INTEGER       NOT NULL DEFAULT 0,
  version_num     INTEGER       NOT NULL DEFAULT 1,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ
);

CREATE INDEX idx_table_sections_branch ON public.table_sections(tenant_id, branch_id) WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS handle_table_sections_updated_at ON public.table_sections;
CREATE TRIGGER handle_table_sections_updated_at
  BEFORE UPDATE ON public.table_sections
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS increment_table_sections_version ON public.table_sections;
CREATE TRIGGER increment_table_sections_version
  BEFORE UPDATE ON public.table_sections
  FOR EACH ROW EXECUTE FUNCTION public.increment_version_num();


-- ─── 3. Alter tables ──────────────────────────────────────────

-- Add floor_id and section_id
ALTER TABLE public.tables
  ADD COLUMN IF NOT EXISTS floor_id UUID REFERENCES public.table_floors(id),
  ADD COLUMN IF NOT EXISTS section_id UUID REFERENCES public.table_sections(id),
  ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

-- Drop mutable status (operational state must be a projection)
ALTER TABLE public.tables DROP COLUMN IF EXISTS status;
ALTER TABLE public.table_state_history DROP COLUMN IF EXISTS from_status;
ALTER TABLE public.table_state_history DROP COLUMN IF EXISTS to_status;


-- ─── 4. table_qr_tokens ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.table_qr_tokens (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID          NOT NULL,
  table_id        UUID          NOT NULL REFERENCES public.tables(id) ON DELETE CASCADE,
  public_token    TEXT          NOT NULL UNIQUE,
  is_active       BOOLEAN       NOT NULL DEFAULT true,
  rotated_at      TIMESTAMPTZ,
  expires_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Unique active token per table
CREATE UNIQUE INDEX idx_table_qr_tokens_active
  ON public.table_qr_tokens (table_id)
  WHERE is_active = TRUE;

CREATE INDEX idx_table_qr_tokens_public_token ON public.table_qr_tokens(public_token);
CREATE INDEX idx_table_qr_tokens_tenant ON public.table_qr_tokens(tenant_id);


-- ─── 5. table_runtime_projections ─────────────────────────────

CREATE TABLE IF NOT EXISTS public.table_runtime_projections (
  table_id                 UUID          PRIMARY KEY REFERENCES public.tables(id) ON DELETE CASCADE,
  tenant_id                UUID          NOT NULL,
  active_guest_count       INTEGER       NOT NULL DEFAULT 0,
  active_order_count       INTEGER       NOT NULL DEFAULT 0,
  assistance_request_count INTEGER       NOT NULL DEFAULT 0,
  runtime_state            TEXT          NOT NULL DEFAULT 'FREE',
  updated_at               TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_table_runtime_projections_tenant ON public.table_runtime_projections(tenant_id);

DROP TRIGGER IF EXISTS handle_table_runtime_projections_updated_at ON public.table_runtime_projections;
CREATE TRIGGER handle_table_runtime_projections_updated_at
  BEFORE UPDATE ON public.table_runtime_projections
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


-- ─── 6. Rename qr_sessions to guest_sessions ──────────────────

DO $$ 
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'qr_sessions') THEN
    ALTER TABLE public.qr_sessions RENAME TO guest_sessions;
  END IF;
END $$;

-- ─── 7. RLS ───────────────────────────────────────────────────

ALTER TABLE public.table_floors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.table_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.table_qr_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.table_runtime_projections ENABLE ROW LEVEL SECURITY;
-- (guest_sessions is assumed to already have RLS or we will add it)

DROP POLICY IF EXISTS "tenant_isolation_floors" ON public.table_floors;
CREATE POLICY "tenant_isolation_floors" ON public.table_floors AS RESTRICTIVE FOR ALL USING (auth.jwt() ->> 'tenant_id' = tenant_id::text);

DROP POLICY IF EXISTS "tenant_isolation_sections" ON public.table_sections;
CREATE POLICY "tenant_isolation_sections" ON public.table_sections AS RESTRICTIVE FOR ALL USING (auth.jwt() ->> 'tenant_id' = tenant_id::text);

DROP POLICY IF EXISTS "tenant_isolation_qr_tokens" ON public.table_qr_tokens;
CREATE POLICY "tenant_isolation_qr_tokens" ON public.table_qr_tokens AS RESTRICTIVE FOR ALL USING (auth.jwt() ->> 'tenant_id' = tenant_id::text);

DROP POLICY IF EXISTS "tenant_isolation_projections" ON public.table_runtime_projections;
CREATE POLICY "tenant_isolation_projections" ON public.table_runtime_projections AS RESTRICTIVE FOR ALL USING (auth.jwt() ->> 'tenant_id' = tenant_id::text);

-- Public access to active qr tokens for runtime initialization (safe because token is cryptographic)
DROP POLICY IF EXISTS "public_qr_token_read" ON public.table_qr_tokens;
CREATE POLICY "public_qr_token_read" ON public.table_qr_tokens FOR SELECT USING (is_active = TRUE AND (expires_at IS NULL OR expires_at > NOW()));

COMMIT;
