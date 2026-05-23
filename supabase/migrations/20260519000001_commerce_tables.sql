-- ============================================================
-- Migration: 20260519000001_commerce_tables.sql
-- Phase 5: Table Service — occupancy lifecycle, QR assignment,
-- reservation foundation, waiter assignment, and full audit trail.
-- ============================================================

BEGIN;

-- ─── SECTION 1: Enums ─────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE public.table_status AS ENUM (
    'available',
    'reserved',
    'occupied',
    'ordering',
    'payment_pending',
    'dirty'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.reservation_status AS ENUM (
    'pending',
    'confirmed',
    'seated',
    'cancelled',
    'no_show'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── SECTION 2: tables ────────────────────────────────────────
-- Physical restaurant tables per branch.

CREATE TABLE IF NOT EXISTS public.tables (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID          NOT NULL,
  branch_id       UUID          NOT NULL,
  table_number    TEXT          NOT NULL,
  display_name    TEXT,
  capacity        SMALLINT      NOT NULL DEFAULT 4 CHECK (capacity > 0),
  status          public.table_status NOT NULL DEFAULT 'available',
  qr_code_id      UUID,         -- FK assigned after qr_codes table exists
  assigned_waiter_id UUID,      -- nullable; future waiter assignment
  notes           TEXT,
  is_active       BOOLEAN       NOT NULL DEFAULT true,
  version_num     INTEGER       NOT NULL DEFAULT 1,
  created_by      UUID,
  updated_by      UUID,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ
);

-- Unique active table number per branch
CREATE UNIQUE INDEX IF NOT EXISTS idx_tables_branch_number_active
  ON public.tables (tenant_id, branch_id, table_number)
  WHERE (deleted_at IS NULL);

CREATE INDEX IF NOT EXISTS idx_tables_tenant_id
  ON public.tables (tenant_id);

CREATE INDEX IF NOT EXISTS idx_tables_branch_id
  ON public.tables (branch_id);

CREATE INDEX IF NOT EXISTS idx_tables_status
  ON public.tables (branch_id, status)
  WHERE (deleted_at IS NULL);

-- Updated-at trigger
DROP TRIGGER IF EXISTS handle_tables_updated_at ON public.tables;
CREATE TRIGGER handle_tables_updated_at
  BEFORE UPDATE ON public.tables
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Version increment trigger
DROP TRIGGER IF EXISTS increment_tables_version ON public.tables;
CREATE TRIGGER increment_tables_version
  BEFORE UPDATE ON public.tables
  FOR EACH ROW EXECUTE FUNCTION public.increment_version_num();

-- Immutability: tenant_id cannot change
CREATE OR REPLACE FUNCTION public.enforce_tables_immutability()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.tenant_id <> OLD.tenant_id THEN
    RAISE EXCEPTION 'tenant_id is immutable on tables';
  END IF;
  IF NEW.branch_id <> OLD.branch_id THEN
    RAISE EXCEPTION 'branch_id is immutable on tables';
  END IF;
  IF NEW.created_by IS DISTINCT FROM OLD.created_by AND OLD.created_by IS NOT NULL THEN
    RAISE EXCEPTION 'created_by is immutable on tables';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_tables_immutability ON public.tables;
CREATE TRIGGER enforce_tables_immutability
  BEFORE UPDATE ON public.tables
  FOR EACH ROW EXECUTE FUNCTION public.enforce_tables_immutability();

-- ─── SECTION 3: table_state_history ──────────────────────────
-- Append-only audit log of every table state transition.

CREATE TABLE IF NOT EXISTS public.table_state_history (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID        NOT NULL,
  branch_id       UUID        NOT NULL,
  table_id        UUID        NOT NULL REFERENCES public.tables (id),
  from_status     public.table_status,   -- NULL for initial creation
  to_status       public.table_status    NOT NULL,
  changed_by      UUID,                  -- actor (user or system)
  reason          TEXT,
  metadata        JSONB       NOT NULL DEFAULT '{}',
  occurred_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_table_state_history_table_id
  ON public.table_state_history (table_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_table_state_history_tenant_id
  ON public.table_state_history (tenant_id);

-- Immutability trigger — history rows are never updated
CREATE OR REPLACE FUNCTION public.enforce_table_state_history_immutability()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'table_state_history rows are immutable';
END;
$$;

DROP TRIGGER IF EXISTS enforce_table_state_history_immutability ON public.table_state_history;
CREATE TRIGGER enforce_table_state_history_immutability
  BEFORE UPDATE ON public.table_state_history
  FOR EACH ROW EXECUTE FUNCTION public.enforce_table_state_history_immutability();

-- ─── SECTION 4: table_reservations ───────────────────────────
-- Foundation for future reservation management.

CREATE TABLE IF NOT EXISTS public.table_reservations (
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID          NOT NULL,
  branch_id           UUID          NOT NULL,
  table_id            UUID          NOT NULL REFERENCES public.tables (id),
  customer_name       TEXT          NOT NULL,
  customer_phone      TEXT,
  party_size          SMALLINT      NOT NULL CHECK (party_size > 0),
  reserved_at         TIMESTAMPTZ   NOT NULL,
  notes               TEXT,
  status              public.reservation_status NOT NULL DEFAULT 'pending',
  confirmed_by        UUID,
  seated_at           TIMESTAMPTZ,
  cancelled_at        TIMESTAMPTZ,
  cancellation_reason TEXT,
  version_num         INTEGER       NOT NULL DEFAULT 1,
  created_by          UUID,
  updated_by          UUID,
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  deleted_at          TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_table_reservations_table_id
  ON public.table_reservations (table_id);

CREATE INDEX IF NOT EXISTS idx_table_reservations_branch_reserved_at
  ON public.table_reservations (branch_id, reserved_at)
  WHERE (deleted_at IS NULL AND status NOT IN ('cancelled', 'no_show'));

CREATE INDEX IF NOT EXISTS idx_table_reservations_tenant_id
  ON public.table_reservations (tenant_id);

DROP TRIGGER IF EXISTS handle_table_reservations_updated_at ON public.table_reservations;
CREATE TRIGGER handle_table_reservations_updated_at
  BEFORE UPDATE ON public.table_reservations
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS increment_table_reservations_version ON public.table_reservations;
CREATE TRIGGER increment_table_reservations_version
  BEFORE UPDATE ON public.table_reservations
  FOR EACH ROW EXECUTE FUNCTION public.increment_version_num();

-- ─── SECTION 5: RLS ───────────────────────────────────────────

ALTER TABLE public.tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.table_state_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.table_reservations ENABLE ROW LEVEL SECURITY;

-- tables
DROP POLICY IF EXISTS "tables_tenant_isolation" ON public.tables;
CREATE POLICY "tables_tenant_isolation" ON public.tables
  AS RESTRICTIVE FOR ALL
  USING (auth.jwt() ->> 'tenant_id' = tenant_id::text);

DROP POLICY IF EXISTS "tables_authenticated_access" ON public.tables;
CREATE POLICY "tables_authenticated_access" ON public.tables
  AS PERMISSIVE FOR ALL
  USING (auth.role() = 'authenticated');

-- table_state_history
DROP POLICY IF EXISTS "table_state_history_tenant_isolation" ON public.table_state_history;
CREATE POLICY "table_state_history_tenant_isolation" ON public.table_state_history
  AS RESTRICTIVE FOR ALL
  USING (auth.jwt() ->> 'tenant_id' = tenant_id::text);

DROP POLICY IF EXISTS "table_state_history_authenticated_access" ON public.table_state_history;
CREATE POLICY "table_state_history_authenticated_access" ON public.table_state_history
  AS PERMISSIVE FOR ALL
  USING (auth.role() = 'authenticated');

-- table_reservations
DROP POLICY IF EXISTS "table_reservations_tenant_isolation" ON public.table_reservations;
CREATE POLICY "table_reservations_tenant_isolation" ON public.table_reservations
  AS RESTRICTIVE FOR ALL
  USING (auth.jwt() ->> 'tenant_id' = tenant_id::text);

DROP POLICY IF EXISTS "table_reservations_authenticated_access" ON public.table_reservations;
CREATE POLICY "table_reservations_authenticated_access" ON public.table_reservations
  AS PERMISSIVE FOR ALL
  USING (auth.role() = 'authenticated');

COMMIT;
