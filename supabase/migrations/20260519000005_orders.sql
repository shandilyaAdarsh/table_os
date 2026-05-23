-- ============================================================
-- Migration: 20260519000005_orders.sql
-- Phase 5: Order Service — order lifecycle, FSM state transitions,
-- idempotency keys, OCC enforcement, and full audit history.
-- ============================================================

BEGIN;

-- ─── SECTION 1: Enums ─────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE public.order_status AS ENUM (
    'pending',
    'accepted',
    'preparing',
    'ready',
    'delivered',
    'completed',
    'cancelled',
    'sync_conflict'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.order_source AS ENUM (
    'qr_scan',
    'staff_pos',
    'admin'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── SECTION 2: orders ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.orders (
  id                      UUID                  PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               UUID                  NOT NULL,
  branch_id               UUID                  NOT NULL,
  table_id                UUID                  NOT NULL REFERENCES public.tables (id),
  session_id              UUID                  REFERENCES public.qr_sessions (id),
  cart_id                 UUID                  REFERENCES public.carts (id),
  -- The locked, immutable financial snapshot for this order
  order_snapshot_id       UUID                  REFERENCES public.order_snapshots (id),
  -- Human-readable order sequence number per branch (set by trigger/service)
  order_number            TEXT                  NOT NULL,
  status                  public.order_status   NOT NULL DEFAULT 'pending',
  source                  public.order_source   NOT NULL DEFAULT 'qr_scan',
  -- Idempotency key supplied by the client at checkout
  idempotency_key         TEXT,
  -- Customer / order metadata
  order_notes             TEXT,
  -- Cancellation fields
  cancellation_reason     TEXT,
  cancelled_by            UUID,
  cancelled_at            TIMESTAMPTZ,
  -- Lifecycle timestamps
  accepted_at             TIMESTAMPTZ,
  preparing_at            TIMESTAMPTZ,
  ready_at                TIMESTAMPTZ,
  delivered_at            TIMESTAMPTZ,
  completed_at            TIMESTAMPTZ,
  -- OCC
  version_num             INTEGER               NOT NULL DEFAULT 1,
  created_by              UUID,
  updated_by              UUID,
  created_at              TIMESTAMPTZ           NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ           NOT NULL DEFAULT NOW()
);

-- Idempotency: unique key per tenant prevents duplicate order creation
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_idempotency_key
  ON public.orders (tenant_id, idempotency_key)
  WHERE (idempotency_key IS NOT NULL);

-- Unique order number per branch
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_branch_number
  ON public.orders (branch_id, order_number);

CREATE INDEX IF NOT EXISTS idx_orders_tenant_id
  ON public.orders (tenant_id);

CREATE INDEX IF NOT EXISTS idx_orders_branch_id
  ON public.orders (branch_id);

CREATE INDEX IF NOT EXISTS idx_orders_table_id
  ON public.orders (table_id);

CREATE INDEX IF NOT EXISTS idx_orders_session_id
  ON public.orders (session_id);

CREATE INDEX IF NOT EXISTS idx_orders_status
  ON public.orders (branch_id, status)
  WHERE (status NOT IN ('completed', 'cancelled'));

CREATE INDEX IF NOT EXISTS idx_orders_created_at
  ON public.orders (branch_id, created_at DESC);

DROP TRIGGER IF EXISTS handle_orders_updated_at ON public.orders;
CREATE TRIGGER handle_orders_updated_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS increment_orders_version ON public.orders;
CREATE TRIGGER increment_orders_version
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.increment_version_num();

-- Immutability: financial identity fields cannot change
CREATE OR REPLACE FUNCTION public.enforce_orders_immutability()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.tenant_id <> OLD.tenant_id THEN
    RAISE EXCEPTION 'tenant_id is immutable on orders';
  END IF;
  IF NEW.branch_id <> OLD.branch_id THEN
    RAISE EXCEPTION 'branch_id is immutable on orders';
  END IF;
  IF NEW.order_number <> OLD.order_number THEN
    RAISE EXCEPTION 'order_number is immutable on orders';
  END IF;
  IF NEW.order_snapshot_id IS DISTINCT FROM OLD.order_snapshot_id
     AND OLD.order_snapshot_id IS NOT NULL THEN
    RAISE EXCEPTION 'order_snapshot_id is immutable once set on orders';
  END IF;
  IF NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
     AND OLD.idempotency_key IS NOT NULL THEN
    RAISE EXCEPTION 'idempotency_key is immutable once set on orders';
  END IF;
  IF NEW.created_by IS DISTINCT FROM OLD.created_by
     AND OLD.created_by IS NOT NULL THEN
    RAISE EXCEPTION 'created_by is immutable on orders';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_orders_immutability ON public.orders;
CREATE TRIGGER enforce_orders_immutability
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.enforce_orders_immutability();

-- Now add FK from order_snapshots → orders (circular — added here after orders exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'order_snapshots_order_id_fk'
      AND conrelid = 'public.order_snapshots'::regclass
  ) THEN
    ALTER TABLE public.order_snapshots
      ADD CONSTRAINT order_snapshots_order_id_fk
      FOREIGN KEY (order_id) REFERENCES public.orders (id);
  END IF;
END $$;

-- ─── SECTION 3: order_state_history ───────────────────────────
-- Append-only audit log of every order status transition.

CREATE TABLE IF NOT EXISTS public.order_state_history (
  id              UUID                PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID                NOT NULL,
  branch_id       UUID                NOT NULL,
  order_id        UUID                NOT NULL REFERENCES public.orders (id),
  from_status     public.order_status,
  to_status       public.order_status NOT NULL,
  changed_by      UUID,
  reason          TEXT,
  metadata        JSONB               NOT NULL DEFAULT '{}',
  occurred_at     TIMESTAMPTZ         NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_state_history_order_id
  ON public.order_state_history (order_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_order_state_history_tenant_id
  ON public.order_state_history (tenant_id);

-- State history rows are immutable
CREATE OR REPLACE FUNCTION public.enforce_order_state_history_immutability()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'order_state_history rows are immutable';
END;
$$;

DROP TRIGGER IF EXISTS enforce_order_state_history_immutability ON public.order_state_history;
CREATE TRIGGER enforce_order_state_history_immutability
  BEFORE UPDATE ON public.order_state_history
  FOR EACH ROW EXECUTE FUNCTION public.enforce_order_state_history_immutability();

-- ─── SECTION 4: RLS ───────────────────────────────────────────

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_state_history ENABLE ROW LEVEL SECURITY;

-- orders
DROP POLICY IF EXISTS "orders_tenant_isolation" ON public.orders;
CREATE POLICY "orders_tenant_isolation" ON public.orders
  AS RESTRICTIVE FOR ALL
  USING (auth.jwt() ->> 'tenant_id' = tenant_id::text);

DROP POLICY IF EXISTS "orders_authenticated_access" ON public.orders;
CREATE POLICY "orders_authenticated_access" ON public.orders
  AS PERMISSIVE FOR ALL
  USING (auth.role() = 'authenticated');

-- order_state_history
DROP POLICY IF EXISTS "order_state_history_tenant_isolation" ON public.order_state_history;
CREATE POLICY "order_state_history_tenant_isolation" ON public.order_state_history
  AS RESTRICTIVE FOR ALL
  USING (auth.jwt() ->> 'tenant_id' = tenant_id::text);

DROP POLICY IF EXISTS "order_state_history_authenticated_access" ON public.order_state_history;
CREATE POLICY "order_state_history_authenticated_access" ON public.order_state_history
  AS PERMISSIVE FOR ALL
  USING (auth.role() = 'authenticated');

COMMIT;
