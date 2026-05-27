-- ============================================================
-- Migration: 20260527000001_multi_surface_convergence.sql
-- Multi-Surface Operational Convergence + Telemetry Metrics
-- ============================================================

BEGIN;

-- ─── 1. Runtime Surface Identities ──────────────────────────────

CREATE TABLE IF NOT EXISTS public.runtime_surface_identities (
  id                          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                   UUID          NOT NULL,
  branch_id                   UUID          NOT NULL,
  surface_type                TEXT          NOT NULL, -- 'ADMIN', 'STAFF', 'POS', 'QR'
  runtime_generation          BIGINT        NOT NULL DEFAULT 0,
  replay_epoch                TEXT          NOT NULL DEFAULT 'epoch_default',
  active_projection_generation BIGINT       NOT NULL DEFAULT 0,
  reconnect_state             TEXT          NOT NULL DEFAULT 'CONNECTED', -- 'CONNECTED', 'DISCONNECTED', 'SYNCHRONIZING'
  deployment_compatibility    TEXT          NOT NULL DEFAULT 'v1.0.0',
  last_seen_at                TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_tenant_branch_surface UNIQUE (tenant_id, branch_id, surface_type, id)
);

CREATE INDEX IF NOT EXISTS idx_surface_identities_tenant ON public.runtime_surface_identities (tenant_id, branch_id);
CREATE INDEX IF NOT EXISTS idx_surface_identities_last_seen ON public.runtime_surface_identities (last_seen_at);

-- ─── 2. Runtime Convergence Metrics ─────────────────────────────

CREATE TABLE IF NOT EXISTS public.runtime_convergence_metrics (
  id                        UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                 UUID          NOT NULL,
  branch_id                 UUID          NOT NULL,
  surface_id                UUID          REFERENCES public.runtime_surface_identities(id) ON DELETE CASCADE,
  replay_lag_ms             INTEGER       NOT NULL DEFAULT 0,
  convergence_latency_ms    INTEGER       NOT NULL DEFAULT 0,
  reconnect_count           INTEGER       NOT NULL DEFAULT 0,
  drift_frequency           INTEGER       NOT NULL DEFAULT 0,
  throughput_events_per_sec NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  created_at                TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_convergence_metrics_tenant ON public.runtime_convergence_metrics (tenant_id, branch_id);
CREATE INDEX IF NOT EXISTS idx_convergence_metrics_created ON public.runtime_convergence_metrics (created_at);

-- ─── 3. Row-Level Security (RLS) Policies ───────────────────────

ALTER TABLE public.runtime_surface_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.runtime_convergence_metrics ENABLE ROW LEVEL SECURITY;

-- Tenant Isolation Policies based on JWT tenant_id
DROP POLICY IF EXISTS "tenant_isolation_surfaces" ON public.runtime_surface_identities;
CREATE POLICY "tenant_isolation_surfaces" ON public.runtime_surface_identities AS RESTRICTIVE FOR ALL USING (auth.jwt() ->> 'tenant_id' = tenant_id::text);

DROP POLICY IF EXISTS "tenant_isolation_metrics" ON public.runtime_convergence_metrics;
CREATE POLICY "tenant_isolation_metrics" ON public.runtime_convergence_metrics AS RESTRICTIVE FOR ALL USING (auth.jwt() ->> 'tenant_id' = tenant_id::text);

-- Support full access for internal service role (system bypasses restriction)
DROP POLICY IF EXISTS "service_role_all_surfaces" ON public.runtime_surface_identities;
CREATE POLICY "service_role_all_surfaces" ON public.runtime_surface_identities FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

DROP POLICY IF EXISTS "service_role_all_metrics" ON public.runtime_convergence_metrics;
CREATE POLICY "service_role_all_metrics" ON public.runtime_convergence_metrics FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

COMMIT;
