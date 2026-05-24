-- ============================================================
-- Migration: 20260519000006_kitchen_workflow.sql
-- Phase 5: Kitchen Workflow — stations, KDS routing, prep queues.
-- ============================================================

BEGIN;

DO $$ BEGIN
  CREATE TYPE public.kitchen_order_status AS ENUM (
    'pending', 'accepted', 'preparing', 'ready', 'delivered'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── kitchen_stations ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.kitchen_stations (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID        NOT NULL,
  branch_id     UUID        NOT NULL,
  name          TEXT        NOT NULL,
  description   TEXT,
  is_default    BOOLEAN     NOT NULL DEFAULT false,
  is_active     BOOLEAN     NOT NULL DEFAULT true,
  display_order INTEGER     NOT NULL DEFAULT 0,
  version_num   INTEGER     NOT NULL DEFAULT 1,
  created_by    UUID,
  updated_by    UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at    TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_kitchen_stations_branch_name_active
  ON public.kitchen_stations (branch_id, name) WHERE (deleted_at IS NULL);

CREATE UNIQUE INDEX IF NOT EXISTS idx_kitchen_stations_branch_default
  ON public.kitchen_stations (branch_id) WHERE (is_default = true AND deleted_at IS NULL);

CREATE INDEX IF NOT EXISTS idx_kitchen_stations_tenant_id ON public.kitchen_stations (tenant_id);
CREATE INDEX IF NOT EXISTS idx_kitchen_stations_branch_id ON public.kitchen_stations (branch_id) WHERE (deleted_at IS NULL);

DROP TRIGGER IF EXISTS handle_kitchen_stations_updated_at ON public.kitchen_stations;
CREATE TRIGGER handle_kitchen_stations_updated_at
  BEFORE UPDATE ON public.kitchen_stations
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS increment_kitchen_stations_version ON public.kitchen_stations;
CREATE TRIGGER increment_kitchen_stations_version
  BEFORE UPDATE ON public.kitchen_stations
  FOR EACH ROW EXECUTE FUNCTION public.increment_version_num();

-- ─── kitchen_orders ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.kitchen_orders (
  id                     UUID                        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              UUID                        NOT NULL,
  branch_id              UUID                        NOT NULL,
  order_id               UUID                        NOT NULL REFERENCES public.orders (id),
  station_id             UUID                        REFERENCES public.kitchen_stations (id),
  status                 public.kitchen_order_status NOT NULL DEFAULT 'pending',
  priority               SMALLINT                    NOT NULL DEFAULT 10 CHECK (priority > 0),
  estimated_prep_seconds INTEGER,
  kitchen_notes          TEXT,
  accepted_at            TIMESTAMPTZ,
  preparing_at           TIMESTAMPTZ,
  ready_at               TIMESTAMPTZ,
  delivered_at           TIMESTAMPTZ,
  version_num            INTEGER                     NOT NULL DEFAULT 1,
  created_by             UUID,
  updated_by             UUID,
  created_at             TIMESTAMPTZ                 NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ                 NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_kitchen_orders_order_id ON public.kitchen_orders (order_id);
CREATE INDEX IF NOT EXISTS idx_kitchen_orders_tenant_id ON public.kitchen_orders (tenant_id);
CREATE INDEX IF NOT EXISTS idx_kitchen_orders_branch_id ON public.kitchen_orders (branch_id);
CREATE INDEX IF NOT EXISTS idx_kitchen_orders_station_id ON public.kitchen_orders (station_id);
CREATE INDEX IF NOT EXISTS idx_kitchen_orders_queue
  ON public.kitchen_orders (branch_id, priority ASC, created_at ASC)
  WHERE (status NOT IN ('delivered'));

DROP TRIGGER IF EXISTS handle_kitchen_orders_updated_at ON public.kitchen_orders;
CREATE TRIGGER handle_kitchen_orders_updated_at
  BEFORE UPDATE ON public.kitchen_orders
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS increment_kitchen_orders_version ON public.kitchen_orders;
CREATE TRIGGER increment_kitchen_orders_version
  BEFORE UPDATE ON public.kitchen_orders
  FOR EACH ROW EXECUTE FUNCTION public.increment_version_num();

CREATE OR REPLACE FUNCTION public.enforce_kitchen_orders_immutability()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.tenant_id <> OLD.tenant_id THEN
    RAISE EXCEPTION 'tenant_id is immutable on kitchen_orders';
  END IF;
  IF NEW.order_id <> OLD.order_id THEN
    RAISE EXCEPTION 'order_id is immutable on kitchen_orders';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_kitchen_orders_immutability ON public.kitchen_orders;
CREATE TRIGGER enforce_kitchen_orders_immutability
  BEFORE UPDATE ON public.kitchen_orders
  FOR EACH ROW EXECUTE FUNCTION public.enforce_kitchen_orders_immutability();

-- ─── kitchen_order_items ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.kitchen_order_items (
  id                     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              UUID        NOT NULL,
  kitchen_order_id       UUID        NOT NULL REFERENCES public.kitchen_orders (id),
  order_item_snapshot_id UUID        NOT NULL REFERENCES public.order_item_snapshots (id),
  item_name              TEXT        NOT NULL,
  quantity               SMALLINT    NOT NULL,
  item_notes             TEXT,
  modifier_summary       TEXT,
  display_order          INTEGER     NOT NULL DEFAULT 0,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kitchen_order_items_kitchen_order_id
  ON public.kitchen_order_items (kitchen_order_id);
CREATE INDEX IF NOT EXISTS idx_kitchen_order_items_tenant_id
  ON public.kitchen_order_items (tenant_id);

CREATE OR REPLACE FUNCTION public.enforce_kitchen_order_items_immutability()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'kitchen_order_items rows are immutable';
END;
$$;

DROP TRIGGER IF EXISTS enforce_kitchen_order_items_immutability ON public.kitchen_order_items;
CREATE TRIGGER enforce_kitchen_order_items_immutability
  BEFORE UPDATE ON public.kitchen_order_items
  FOR EACH ROW EXECUTE FUNCTION public.enforce_kitchen_order_items_immutability();

-- ─── RLS ──────────────────────────────────────────────────────

ALTER TABLE public.kitchen_stations   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kitchen_orders     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kitchen_order_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "kitchen_stations_tenant_isolation"    ON public.kitchen_stations;
CREATE POLICY "kitchen_stations_tenant_isolation" ON public.kitchen_stations
  AS RESTRICTIVE FOR ALL USING (auth.jwt() ->> 'tenant_id' = tenant_id::text);
DROP POLICY IF EXISTS "kitchen_stations_authenticated_access" ON public.kitchen_stations;
CREATE POLICY "kitchen_stations_authenticated_access" ON public.kitchen_stations
  AS PERMISSIVE FOR ALL USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "kitchen_orders_tenant_isolation"      ON public.kitchen_orders;
CREATE POLICY "kitchen_orders_tenant_isolation" ON public.kitchen_orders
  AS RESTRICTIVE FOR ALL USING (auth.jwt() ->> 'tenant_id' = tenant_id::text);
DROP POLICY IF EXISTS "kitchen_orders_authenticated_access"  ON public.kitchen_orders;
CREATE POLICY "kitchen_orders_authenticated_access" ON public.kitchen_orders
  AS PERMISSIVE FOR ALL USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "kitchen_order_items_tenant_isolation"     ON public.kitchen_order_items;
CREATE POLICY "kitchen_order_items_tenant_isolation" ON public.kitchen_order_items
  AS RESTRICTIVE FOR ALL USING (auth.jwt() ->> 'tenant_id' = tenant_id::text);
DROP POLICY IF EXISTS "kitchen_order_items_authenticated_access" ON public.kitchen_order_items;
CREATE POLICY "kitchen_order_items_authenticated_access" ON public.kitchen_order_items
  AS PERMISSIVE FOR ALL USING (auth.role() = 'authenticated');

COMMIT;
