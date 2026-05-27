-- ============================================================
-- Migration: 20260527000003_production_pilot_operations.sql
-- Production Cost Telemetry, Device Trusts & Webhook Signatures
-- ============================================================

BEGIN;

-- ─── 1. Runtime Cost Metrics ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.runtime_cost_metrics (
  id                    UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID          NOT NULL,
  branch_id             UUID          NOT NULL,
  websocket_usage_count INTEGER       NOT NULL DEFAULT 0,
  replay_bandwidth_bytes BIGINT        NOT NULL DEFAULT 0,
  rebuild_cost_microcents BIGINT       NOT NULL DEFAULT 0,
  db_query_cost_microcents BIGINT      NOT NULL DEFAULT 0,
  telemetry_growth_bytes BIGINT        NOT NULL DEFAULT 0,
  ledger_growth_bytes   BIGINT        NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cost_metrics_tenant ON public.runtime_cost_metrics (tenant_id, branch_id);
CREATE INDEX IF NOT EXISTS idx_cost_metrics_created ON public.runtime_cost_metrics (created_at);

-- ─── 2. Device Validation Registry ───────────────────────────────

CREATE TABLE IF NOT EXISTS public.device_validation_registry (
  id                    UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID          NOT NULL,
  device_type           TEXT          NOT NULL, -- 'PRINTER', 'TERMINAL', 'TABLET'
  device_identifier     TEXT          NOT NULL UNIQUE,
  trust_score           NUMERIC(5,2)  NOT NULL DEFAULT 100.00,
  is_authorized         BOOLEAN       NOT NULL DEFAULT true,
  last_seen_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_device_registry_tenant ON public.device_validation_registry (tenant_id);
CREATE INDEX IF NOT EXISTS idx_device_registry_identifier ON public.device_validation_registry (device_identifier);

-- ─── 3. Row-Level Security (RLS) Policies ───────────────────────

ALTER TABLE public.runtime_cost_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.device_validation_registry ENABLE ROW LEVEL SECURITY;

-- Tenant Isolation Policies based on JWT tenant_id
DROP POLICY IF EXISTS "tenant_isolation_costs" ON public.runtime_cost_metrics;
CREATE POLICY "tenant_isolation_costs" ON public.runtime_cost_metrics AS RESTRICTIVE FOR ALL USING (auth.jwt() ->> 'tenant_id' = tenant_id::text);

DROP POLICY IF EXISTS "tenant_isolation_devices" ON public.device_validation_registry;
CREATE POLICY "tenant_isolation_devices" ON public.device_validation_registry AS RESTRICTIVE FOR ALL USING (auth.jwt() ->> 'tenant_id' = tenant_id::text);

-- Support full access for internal service role (system bypasses restriction)
DROP POLICY IF EXISTS "service_role_all_costs" ON public.runtime_cost_metrics;
CREATE POLICY "service_role_all_costs" ON public.runtime_cost_metrics FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

DROP POLICY IF EXISTS "service_role_all_devices" ON public.device_validation_registry;
CREATE POLICY "service_role_all_devices" ON public.device_validation_registry FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

COMMIT;
