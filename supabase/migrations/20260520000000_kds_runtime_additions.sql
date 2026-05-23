-- ============================================================
-- Migration: 20260520000000_kds_runtime_additions.sql
-- Production-grade table for KDS branch-scoped station routing
-- and reconnect-safe operational event log tracking.
-- ============================================================

BEGIN;

-- 1. Create Station Routing Table (Branch-Scoped)
CREATE TABLE IF NOT EXISTS public.menu_item_station_routes (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID        NOT NULL,
  branch_id       UUID        NOT NULL,
  menu_item_id    UUID        NOT NULL REFERENCES public.menu_items (id) ON DELETE CASCADE,
  station_id      UUID        NOT NULL REFERENCES public.kitchen_stations (id) ON DELETE CASCADE,
  version_num     INTEGER     NOT NULL DEFAULT 1,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  CONSTRAINT menu_item_station_routes_tenant_branch_item_key UNIQUE (branch_id, menu_item_id)
);

CREATE INDEX IF NOT EXISTS idx_menu_item_station_routes_branch ON public.menu_item_station_routes (branch_id);
CREATE INDEX IF NOT EXISTS idx_menu_item_station_routes_tenant ON public.menu_item_station_routes (tenant_id);

-- Add updated_at and version triggers
DROP TRIGGER IF EXISTS handle_menu_item_station_routes_updated_at ON public.menu_item_station_routes;
CREATE TRIGGER handle_menu_item_station_routes_updated_at
  BEFORE UPDATE ON public.menu_item_station_routes
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS increment_menu_item_station_routes_version ON public.menu_item_station_routes;
CREATE TRIGGER increment_menu_item_station_routes_version
  BEFORE UPDATE ON public.menu_item_station_routes
  FOR EACH ROW EXECUTE FUNCTION public.increment_version_num();

-- 2. Create Monotonic Event Sequence for KDS Realtime Sync
CREATE TABLE IF NOT EXISTS public.branch_operational_events (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID        NOT NULL,
  branch_id       UUID        NOT NULL,
  sequence_number BIGSERIAL,   -- Monotonically increasing sequence number per branch (globally unique serial)
  event_type      TEXT        NOT NULL,
  aggregate_id    UUID        NOT NULL,
  aggregate_type  TEXT        NOT NULL,
  payload         JSONB       NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Compound index for fast range-based replay searches
CREATE INDEX IF NOT EXISTS idx_branch_op_events_seq 
  ON public.branch_operational_events (branch_id, sequence_number ASC);
CREATE INDEX IF NOT EXISTS idx_branch_op_events_tenant ON public.branch_operational_events (tenant_id);

-- 3. Row Level Security (RLS) policies
ALTER TABLE public.menu_item_station_routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branch_operational_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "menu_item_station_routes_tenant_isolation" ON public.menu_item_station_routes;
CREATE POLICY "menu_item_station_routes_tenant_isolation" ON public.menu_item_station_routes
  AS RESTRICTIVE FOR ALL USING (auth.jwt() ->> 'tenant_id' = tenant_id::text);

DROP POLICY IF EXISTS "menu_item_station_routes_auth" ON public.menu_item_station_routes;
CREATE POLICY "menu_item_station_routes_auth" ON public.menu_item_station_routes
  AS PERMISSIVE FOR ALL USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "branch_operational_events_tenant_isolation" ON public.branch_operational_events;
CREATE POLICY "branch_operational_events_tenant_isolation" ON public.branch_operational_events
  AS RESTRICTIVE FOR ALL USING (auth.jwt() ->> 'tenant_id' = tenant_id::text);

DROP POLICY IF EXISTS "branch_operational_events_auth" ON public.branch_operational_events;
CREATE POLICY "branch_operational_events_auth" ON public.branch_operational_events
  AS PERMISSIVE FOR ALL USING (auth.role() = 'authenticated');

-- 4. Utility function to log and broadcast KDS sequence events
CREATE OR REPLACE FUNCTION public.log_branch_operational_event(
  p_tenant_id UUID,
  p_branch_id UUID,
  p_event_type TEXT,
  p_aggregate_id UUID,
  p_aggregate_type TEXT,
  p_payload JSONB
) RETURNS BIGINT LANGUAGE plpgsql AS $$
DECLARE
  v_seq BIGINT;
BEGIN
  INSERT INTO public.branch_operational_events (
    tenant_id, branch_id, event_type, aggregate_id, aggregate_type, payload
  ) VALUES (
    p_tenant_id, p_branch_id, p_event_type, p_aggregate_id, p_aggregate_type, p_payload
  ) RETURNING sequence_number INTO v_seq;
  
  RETURN v_seq;
END;
$$;

COMMIT;
