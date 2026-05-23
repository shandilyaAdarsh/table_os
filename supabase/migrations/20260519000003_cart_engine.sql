-- ============================================================
-- Migration: 20260519000003_cart_engine.sql
-- Phase 5: Cart Engine — snapshot-aware carts, item snapshots,
-- modifier captures, OCC, idempotency, and branch-aware validation.
-- ============================================================

BEGIN;

-- ─── SECTION 1: Enums ─────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE public.cart_status AS ENUM (
    'open',
    'locked',
    'submitted',
    'abandoned'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── SECTION 2: carts ─────────────────────────────────────────
-- One active cart per QR session.

CREATE TABLE IF NOT EXISTS public.carts (
  id              UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID              NOT NULL,
  branch_id       UUID              NOT NULL,
  table_id        UUID              NOT NULL REFERENCES public.tables (id),
  session_id      UUID              NOT NULL REFERENCES public.qr_sessions (id),
  status          public.cart_status NOT NULL DEFAULT 'open',
  -- Idempotency key for checkout
  checkout_idempotency_key TEXT,
  -- Snapshot of the menu version at cart creation (for staleness detection)
  -- Timestamps for lifecycle tracking
  locked_at       TIMESTAMPTZ,
  submitted_at    TIMESTAMPTZ,
  abandoned_at    TIMESTAMPTZ,
  -- Customer notes for the entire order
  order_notes     TEXT,
  version_num     INTEGER           NOT NULL DEFAULT 1,
  created_at      TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ       NOT NULL DEFAULT NOW()
);

-- One active cart per session (open or locked)
CREATE UNIQUE INDEX IF NOT EXISTS idx_carts_session_active
  ON public.carts (session_id)
  WHERE (status IN ('open', 'locked'));

CREATE INDEX IF NOT EXISTS idx_carts_tenant_id
  ON public.carts (tenant_id);

CREATE INDEX IF NOT EXISTS idx_carts_branch_id
  ON public.carts (branch_id);

CREATE INDEX IF NOT EXISTS idx_carts_session_id
  ON public.carts (session_id);

DROP TRIGGER IF EXISTS handle_carts_updated_at ON public.carts;
CREATE TRIGGER handle_carts_updated_at
  BEFORE UPDATE ON public.carts
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS increment_carts_version ON public.carts;
CREATE TRIGGER increment_carts_version
  BEFORE UPDATE ON public.carts
  FOR EACH ROW EXECUTE FUNCTION public.increment_version_num();

-- Immutability: session and tenant cannot change
CREATE OR REPLACE FUNCTION public.enforce_carts_immutability()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.tenant_id <> OLD.tenant_id THEN
    RAISE EXCEPTION 'tenant_id is immutable on carts';
  END IF;
  IF NEW.branch_id <> OLD.branch_id THEN
    RAISE EXCEPTION 'branch_id is immutable on carts';
  END IF;
  IF NEW.session_id <> OLD.session_id THEN
    RAISE EXCEPTION 'session_id is immutable on carts';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_carts_immutability ON public.carts;
CREATE TRIGGER enforce_carts_immutability
  BEFORE UPDATE ON public.carts
  FOR EACH ROW EXECUTE FUNCTION public.enforce_carts_immutability();

-- ─── SECTION 3: cart_items ────────────────────────────────────
-- Each line item in the cart. Captures a price snapshot at add time.

CREATE TABLE IF NOT EXISTS public.cart_items (
  id                        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                 UUID        NOT NULL,
  cart_id                   UUID        NOT NULL REFERENCES public.carts (id),
  -- Reference to the live menu item (for branch validation at lock time)
  menu_item_id              UUID        NOT NULL,
  -- Snapshot values captured at add-to-cart time
  item_name_snapshot        TEXT        NOT NULL,
  item_sku_snapshot         TEXT,
  -- Price snapshot in minor units (cents) — NOT the final invoice price
  unit_price_minor_snapshot BIGINT      NOT NULL CHECK (unit_price_minor_snapshot >= 0),
  -- Live quantity (mutable until cart LOCKED)
  quantity                  SMALLINT    NOT NULL DEFAULT 1 CHECK (quantity > 0),
  -- Customer notes per line item
  item_notes                TEXT,
  -- Sorting for display
  display_order             INTEGER     NOT NULL DEFAULT 0,
  version_num               INTEGER     NOT NULL DEFAULT 1,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cart_items_cart_id
  ON public.cart_items (cart_id);

CREATE INDEX IF NOT EXISTS idx_cart_items_tenant_id
  ON public.cart_items (tenant_id);

CREATE INDEX IF NOT EXISTS idx_cart_items_menu_item_id
  ON public.cart_items (menu_item_id);

DROP TRIGGER IF EXISTS handle_cart_items_updated_at ON public.cart_items;
CREATE TRIGGER handle_cart_items_updated_at
  BEFORE UPDATE ON public.cart_items
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS increment_cart_items_version ON public.cart_items;
CREATE TRIGGER increment_cart_items_version
  BEFORE UPDATE ON public.cart_items
  FOR EACH ROW EXECUTE FUNCTION public.increment_version_num();

-- Immutability: price and item snapshots never change once set
CREATE OR REPLACE FUNCTION public.enforce_cart_items_immutability()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.tenant_id <> OLD.tenant_id THEN
    RAISE EXCEPTION 'tenant_id is immutable on cart_items';
  END IF;
  IF NEW.cart_id <> OLD.cart_id THEN
    RAISE EXCEPTION 'cart_id is immutable on cart_items';
  END IF;
  IF NEW.menu_item_id <> OLD.menu_item_id THEN
    RAISE EXCEPTION 'menu_item_id is immutable on cart_items';
  END IF;
  IF NEW.item_name_snapshot <> OLD.item_name_snapshot THEN
    RAISE EXCEPTION 'item_name_snapshot is immutable on cart_items';
  END IF;
  IF NEW.unit_price_minor_snapshot <> OLD.unit_price_minor_snapshot THEN
    RAISE EXCEPTION 'unit_price_minor_snapshot is immutable on cart_items';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_cart_items_immutability ON public.cart_items;
CREATE TRIGGER enforce_cart_items_immutability
  BEFORE UPDATE ON public.cart_items
  FOR EACH ROW EXECUTE FUNCTION public.enforce_cart_items_immutability();

-- ─── SECTION 4: cart_item_modifiers ──────────────────────────
-- Modifier selections per cart item, captured as snapshots.

CREATE TABLE IF NOT EXISTS public.cart_item_modifiers (
  id                              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                       UUID        NOT NULL,
  cart_item_id                    UUID        NOT NULL REFERENCES public.cart_items (id),
  -- Reference for re-validation at checkout
  modifier_group_id               UUID        NOT NULL,
  modifier_option_id              UUID        NOT NULL,
  -- Snapshot values captured at add-to-cart time
  modifier_group_name_snapshot    TEXT        NOT NULL,
  modifier_option_name_snapshot   TEXT        NOT NULL,
  price_delta_minor_snapshot      BIGINT      NOT NULL DEFAULT 0,
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cart_item_modifiers_cart_item_id
  ON public.cart_item_modifiers (cart_item_id);

CREATE INDEX IF NOT EXISTS idx_cart_item_modifiers_tenant_id
  ON public.cart_item_modifiers (tenant_id);

-- Modifier selections are immutable
CREATE OR REPLACE FUNCTION public.enforce_cart_item_modifiers_immutability()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'cart_item_modifiers rows are immutable';
END;
$$;

DROP TRIGGER IF EXISTS enforce_cart_item_modifiers_immutability ON public.cart_item_modifiers;
CREATE TRIGGER enforce_cart_item_modifiers_immutability
  BEFORE UPDATE ON public.cart_item_modifiers
  FOR EACH ROW EXECUTE FUNCTION public.enforce_cart_item_modifiers_immutability();

-- ─── SECTION 5: RLS ───────────────────────────────────────────

ALTER TABLE public.carts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cart_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cart_item_modifiers ENABLE ROW LEVEL SECURITY;

-- carts
DROP POLICY IF EXISTS "carts_tenant_isolation" ON public.carts;
CREATE POLICY "carts_tenant_isolation" ON public.carts
  AS RESTRICTIVE FOR ALL
  USING (auth.jwt() ->> 'tenant_id' = tenant_id::text);

DROP POLICY IF EXISTS "carts_authenticated_access" ON public.carts;
CREATE POLICY "carts_authenticated_access" ON public.carts
  AS PERMISSIVE FOR ALL
  USING (auth.role() = 'authenticated');

-- cart_items
DROP POLICY IF EXISTS "cart_items_tenant_isolation" ON public.cart_items;
CREATE POLICY "cart_items_tenant_isolation" ON public.cart_items
  AS RESTRICTIVE FOR ALL
  USING (auth.jwt() ->> 'tenant_id' = tenant_id::text);

DROP POLICY IF EXISTS "cart_items_authenticated_access" ON public.cart_items;
CREATE POLICY "cart_items_authenticated_access" ON public.cart_items
  AS PERMISSIVE FOR ALL
  USING (auth.role() = 'authenticated');

-- cart_item_modifiers
DROP POLICY IF EXISTS "cart_item_modifiers_tenant_isolation" ON public.cart_item_modifiers;
CREATE POLICY "cart_item_modifiers_tenant_isolation" ON public.cart_item_modifiers
  AS RESTRICTIVE FOR ALL
  USING (auth.jwt() ->> 'tenant_id' = tenant_id::text);

DROP POLICY IF EXISTS "cart_item_modifiers_authenticated_access" ON public.cart_item_modifiers;
CREATE POLICY "cart_item_modifiers_authenticated_access" ON public.cart_item_modifiers
  AS PERMISSIVE FOR ALL
  USING (auth.role() = 'authenticated');

COMMIT;
