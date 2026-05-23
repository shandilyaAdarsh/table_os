-- ============================================================
-- Migration: 20260519000019_kitchen_item_preparations.sql
-- Production-grade table for KDS item-level preparation tracking.
-- ============================================================

BEGIN;

DO $$ BEGIN
  CREATE TYPE public.kitchen_item_status AS ENUM (
    'pending', 'preparing', 'ready', 'completed', 'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.kitchen_item_preparations (
  id                     UUID                       PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              UUID                       NOT NULL,
  branch_id              UUID                       NOT NULL,
  kitchen_order_id       UUID                       NOT NULL REFERENCES public.kitchen_orders (id) ON DELETE CASCADE,
  kitchen_order_item_id  UUID                       NOT NULL REFERENCES public.kitchen_order_items (id) ON DELETE CASCADE,
  station_id             UUID                       REFERENCES public.kitchen_stations (id),
  status                 public.kitchen_item_status NOT NULL DEFAULT 'pending',
  quantity               SMALLINT                   NOT NULL CHECK (quantity > 0),
  completed_quantity     SMALLINT                   NOT NULL DEFAULT 0 CHECK (completed_quantity <= quantity),
  prepared_at            TIMESTAMPTZ,
  completed_at           TIMESTAMPTZ,
  version_num            INTEGER                    NOT NULL DEFAULT 1,
  created_at             TIMESTAMPTZ                NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ                NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kitchen_item_preps_tenant_id ON public.kitchen_item_preparations (tenant_id);
CREATE INDEX IF NOT EXISTS idx_kitchen_item_preps_branch_id ON public.kitchen_item_preparations (branch_id);
CREATE INDEX IF NOT EXISTS idx_kitchen_item_preps_kitchen_order_id ON public.kitchen_item_preparations (kitchen_order_id);
CREATE INDEX IF NOT EXISTS idx_kitchen_item_preps_station_status ON public.kitchen_item_preparations (station_id, status);

DROP TRIGGER IF EXISTS handle_kitchen_item_preps_updated_at ON public.kitchen_item_preparations;
CREATE TRIGGER handle_kitchen_item_preps_updated_at
  BEFORE UPDATE ON public.kitchen_item_preparations
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS increment_kitchen_item_preps_version ON public.kitchen_item_preparations;
CREATE TRIGGER increment_kitchen_item_preps_version
  BEFORE UPDATE ON public.kitchen_item_preparations
  FOR EACH ROW EXECUTE FUNCTION public.increment_version_num();

-- Enable RLS
ALTER TABLE public.kitchen_item_preparations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "kitchen_item_preps_tenant_isolation" ON public.kitchen_item_preparations;
CREATE POLICY "kitchen_item_preps_tenant_isolation" ON public.kitchen_item_preparations
  AS RESTRICTIVE FOR ALL
  USING (auth.jwt() ->> 'tenant_id' = tenant_id::text);

DROP POLICY IF EXISTS "kitchen_item_preps_authenticated_access" ON public.kitchen_item_preparations;
CREATE POLICY "kitchen_item_preps_authenticated_access" ON public.kitchen_item_preparations
  AS PERMISSIVE FOR ALL
  USING (auth.role() = 'authenticated');

COMMIT;
