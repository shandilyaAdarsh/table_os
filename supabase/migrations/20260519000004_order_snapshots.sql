-- ============================================================
-- Migration: 20260519000004_order_snapshots.sql
-- Phase 5: Immutable Order Snapshot System.
-- CRITICAL: These tables are append-only and NEVER updated.
-- They are the authoritative financial record for every order.
-- ============================================================

BEGIN;

-- ─── SECTION 1: order_snapshots ───────────────────────────────
-- Top-level immutable header capturing order-level financial state
-- at the exact moment of checkout. Self-contained for receipt reconstruction.

CREATE TABLE IF NOT EXISTS public.order_snapshots (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               UUID        NOT NULL,
  branch_id               UUID        NOT NULL,
  -- Reference back to the order (set when order is created)
  order_id                UUID,       -- FK added after orders table exists
  -- Summary financials — computed at snapshot time, stored as minor units
  subtotal_minor          BIGINT      NOT NULL CHECK (subtotal_minor >= 0),
  tax_total_minor         BIGINT      NOT NULL DEFAULT 0 CHECK (tax_total_minor >= 0),
  discount_total_minor    BIGINT      NOT NULL DEFAULT 0,
  grand_total_minor       BIGINT      NOT NULL CHECK (grand_total_minor >= 0),
  currency_code           CHAR(3)     NOT NULL DEFAULT 'USD',
  -- Snapshot metadata
  item_count              INTEGER     NOT NULL CHECK (item_count > 0),
  snapshot_version        INTEGER     NOT NULL DEFAULT 1,
  -- Timestamps
  snapshotted_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_snapshots_tenant_id
  ON public.order_snapshots (tenant_id);

CREATE INDEX IF NOT EXISTS idx_order_snapshots_order_id
  ON public.order_snapshots (order_id);

-- Full immutability — order snapshots are NEVER mutated
CREATE OR REPLACE FUNCTION public.enforce_order_snapshots_immutability()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'order_snapshots rows are immutable — the snapshot is the financial record';
END;
$$;

DROP TRIGGER IF EXISTS enforce_order_snapshots_immutability ON public.order_snapshots;
CREATE TRIGGER enforce_order_snapshots_immutability
  BEFORE UPDATE ON public.order_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.enforce_order_snapshots_immutability();

-- ─── SECTION 2: order_item_snapshots ──────────────────────────
-- Immutable per-line-item financial record. Contains all pricing
-- information needed to reproduce the receipt without any live table lookups.

CREATE TABLE IF NOT EXISTS public.order_item_snapshots (
  id                        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                 UUID        NOT NULL,
  order_snapshot_id         UUID        NOT NULL REFERENCES public.order_snapshots (id),
  -- Original menu item reference (for reporting/analytics only — NOT for re-resolution)
  menu_item_id              UUID        NOT NULL,
  -- Fully self-contained snapshot fields
  item_name_snapshot        TEXT        NOT NULL,
  item_sku_snapshot         TEXT,
  item_category_name_snapshot TEXT,
  quantity                  SMALLINT    NOT NULL CHECK (quantity > 0),
  unit_price_minor          BIGINT      NOT NULL CHECK (unit_price_minor >= 0),
  line_total_minor          BIGINT      NOT NULL CHECK (line_total_minor >= 0),
  -- Was a branch price override applied?
  is_branch_price_override  BOOLEAN     NOT NULL DEFAULT false,
  -- Customer notes for this line
  item_notes                TEXT,
  display_order             INTEGER     NOT NULL DEFAULT 0,
  snapshotted_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_item_snapshots_snapshot_id
  ON public.order_item_snapshots (order_snapshot_id);

CREATE INDEX IF NOT EXISTS idx_order_item_snapshots_tenant_id
  ON public.order_item_snapshots (tenant_id);

CREATE INDEX IF NOT EXISTS idx_order_item_snapshots_menu_item_id
  ON public.order_item_snapshots (menu_item_id);

CREATE OR REPLACE FUNCTION public.enforce_order_item_snapshots_immutability()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'order_item_snapshots rows are immutable — the snapshot is the financial record';
END;
$$;

DROP TRIGGER IF EXISTS enforce_order_item_snapshots_immutability ON public.order_item_snapshots;
CREATE TRIGGER enforce_order_item_snapshots_immutability
  BEFORE UPDATE ON public.order_item_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.enforce_order_item_snapshots_immutability();

-- ─── SECTION 3: order_modifier_snapshots ──────────────────────
-- Immutable modifier selections per order line item.

CREATE TABLE IF NOT EXISTS public.order_modifier_snapshots (
  id                            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                     UUID        NOT NULL,
  order_item_snapshot_id        UUID        NOT NULL REFERENCES public.order_item_snapshots (id),
  -- Original references (analytics only)
  modifier_group_id             UUID        NOT NULL,
  modifier_option_id            UUID        NOT NULL,
  -- Fully self-contained snapshot
  modifier_group_name_snapshot  TEXT        NOT NULL,
  modifier_option_name_snapshot TEXT        NOT NULL,
  price_delta_minor             BIGINT      NOT NULL DEFAULT 0,
  snapshotted_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_modifier_snapshots_item_id
  ON public.order_modifier_snapshots (order_item_snapshot_id);

CREATE INDEX IF NOT EXISTS idx_order_modifier_snapshots_tenant_id
  ON public.order_modifier_snapshots (tenant_id);

CREATE OR REPLACE FUNCTION public.enforce_order_modifier_snapshots_immutability()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'order_modifier_snapshots rows are immutable';
END;
$$;

DROP TRIGGER IF EXISTS enforce_order_modifier_snapshots_immutability ON public.order_modifier_snapshots;
CREATE TRIGGER enforce_order_modifier_snapshots_immutability
  BEFORE UPDATE ON public.order_modifier_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.enforce_order_modifier_snapshots_immutability();

-- ─── SECTION 4: order_tax_snapshots ───────────────────────────
-- Immutable tax computation record. Captures the exact tax strategy,
-- rate, and computed amounts applied at checkout.

CREATE TABLE IF NOT EXISTS public.order_tax_snapshots (
  id                        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                 UUID        NOT NULL,
  order_snapshot_id         UUID        NOT NULL REFERENCES public.order_snapshots (id),
  -- Tax profile metadata (self-contained)
  tax_profile_name_snapshot TEXT        NOT NULL,
  tax_strategy_id           UUID        NOT NULL, -- Analytics ref to tax_strategies
  rate_basis_points         INTEGER     NOT NULL CHECK (rate_basis_points >= 0),
  calc_mode_snapshot        TEXT        NOT NULL, -- 'inclusive' | 'exclusive'
  -- Computed tax amounts
  taxable_amount_minor      BIGINT      NOT NULL CHECK (taxable_amount_minor >= 0),
  tax_amount_minor          BIGINT      NOT NULL CHECK (tax_amount_minor >= 0),
  jurisdiction_snapshot     TEXT,
  snapshotted_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_tax_snapshots_snapshot_id
  ON public.order_tax_snapshots (order_snapshot_id);

CREATE INDEX IF NOT EXISTS idx_order_tax_snapshots_tenant_id
  ON public.order_tax_snapshots (tenant_id);

CREATE OR REPLACE FUNCTION public.enforce_order_tax_snapshots_immutability()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'order_tax_snapshots rows are immutable';
END;
$$;

DROP TRIGGER IF EXISTS enforce_order_tax_snapshots_immutability ON public.order_tax_snapshots;
CREATE TRIGGER enforce_order_tax_snapshots_immutability
  BEFORE UPDATE ON public.order_tax_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.enforce_order_tax_snapshots_immutability();

-- ─── SECTION 5: RLS ───────────────────────────────────────────

ALTER TABLE public.order_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_item_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_modifier_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_tax_snapshots ENABLE ROW LEVEL SECURITY;

-- order_snapshots
DROP POLICY IF EXISTS "order_snapshots_tenant_isolation" ON public.order_snapshots;
CREATE POLICY "order_snapshots_tenant_isolation" ON public.order_snapshots
  AS RESTRICTIVE FOR ALL
  USING (auth.jwt() ->> 'tenant_id' = tenant_id::text);

DROP POLICY IF EXISTS "order_snapshots_authenticated_access" ON public.order_snapshots;
CREATE POLICY "order_snapshots_authenticated_access" ON public.order_snapshots
  AS PERMISSIVE FOR ALL
  USING (auth.role() = 'authenticated');

-- order_item_snapshots
DROP POLICY IF EXISTS "order_item_snapshots_tenant_isolation" ON public.order_item_snapshots;
CREATE POLICY "order_item_snapshots_tenant_isolation" ON public.order_item_snapshots
  AS RESTRICTIVE FOR ALL
  USING (auth.jwt() ->> 'tenant_id' = tenant_id::text);

DROP POLICY IF EXISTS "order_item_snapshots_authenticated_access" ON public.order_item_snapshots;
CREATE POLICY "order_item_snapshots_authenticated_access" ON public.order_item_snapshots
  AS PERMISSIVE FOR ALL
  USING (auth.role() = 'authenticated');

-- order_modifier_snapshots
DROP POLICY IF EXISTS "order_modifier_snapshots_tenant_isolation" ON public.order_modifier_snapshots;
CREATE POLICY "order_modifier_snapshots_tenant_isolation" ON public.order_modifier_snapshots
  AS RESTRICTIVE FOR ALL
  USING (auth.jwt() ->> 'tenant_id' = tenant_id::text);

DROP POLICY IF EXISTS "order_modifier_snapshots_authenticated_access" ON public.order_modifier_snapshots;
CREATE POLICY "order_modifier_snapshots_authenticated_access" ON public.order_modifier_snapshots
  AS PERMISSIVE FOR ALL
  USING (auth.role() = 'authenticated');

-- order_tax_snapshots
DROP POLICY IF EXISTS "order_tax_snapshots_tenant_isolation" ON public.order_tax_snapshots;
CREATE POLICY "order_tax_snapshots_tenant_isolation" ON public.order_tax_snapshots
  AS RESTRICTIVE FOR ALL
  USING (auth.jwt() ->> 'tenant_id' = tenant_id::text);

DROP POLICY IF EXISTS "order_tax_snapshots_authenticated_access" ON public.order_tax_snapshots;
CREATE POLICY "order_tax_snapshots_authenticated_access" ON public.order_tax_snapshots
  AS PERMISSIVE FOR ALL
  USING (auth.role() = 'authenticated');

COMMIT;
