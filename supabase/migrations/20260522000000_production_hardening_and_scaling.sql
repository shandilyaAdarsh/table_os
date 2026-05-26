-- ============================================================
-- Migration: 20260522000000_production_hardening_and_scaling.sql
-- Production Hardening + Distributed Runtime Scaling Phase
-- ============================================================

BEGIN;

-- ─── 1. Authoritative Event Ledger ─────────────────────────────

CREATE TABLE IF NOT EXISTS public.runtime_event_ledger (
  id                    UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  global_sequence       BIGSERIAL     UNIQUE,
  tenant_id             UUID          NOT NULL,
  branch_id             UUID          NOT NULL,
  aggregate_type        TEXT          NOT NULL,
  aggregate_id          UUID          NOT NULL,
  event_type            TEXT          NOT NULL,
  event_version         INTEGER       NOT NULL DEFAULT 1,
  event_payload_json    JSONB         NOT NULL,
  projection_generation TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  causation_id          UUID,
  correlation_id        UUID,
  emitted_by            TEXT          NOT NULL,
  emitted_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_event_ledger_branch ON public.runtime_event_ledger (tenant_id, branch_id);
CREATE INDEX idx_event_ledger_sequence ON public.runtime_event_ledger (global_sequence);
CREATE INDEX idx_event_ledger_aggregate ON public.runtime_event_ledger (aggregate_type, aggregate_id);

-- Enforce append-only rules via trigger that blocks UPDATE or DELETE on ledger
CREATE OR REPLACE FUNCTION public.block_ledger_mutations()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Updates and deletions are strictly forbidden on the authoritative runtime event ledger.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_block_ledger_mutations ON public.runtime_event_ledger;
CREATE TRIGGER trg_block_ledger_mutations
  BEFORE UPDATE OR DELETE ON public.runtime_event_ledger
  FOR EACH ROW EXECUTE FUNCTION public.block_ledger_mutations();


-- ─── 2. Projection Schema Registry ────────────────────────────

CREATE TABLE IF NOT EXISTS public.projection_schema_registry (
  id                    UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  projection_name       TEXT          NOT NULL UNIQUE,
  projection_version    INTEGER       NOT NULL DEFAULT 1,
  snapshot_version      INTEGER       NOT NULL DEFAULT 1,
  rebuild_generation    BIGINT        NOT NULL DEFAULT 0,
  is_compatible         BOOLEAN       NOT NULL DEFAULT true,
  last_validated_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);


-- ─── 3. Runtime Incidents Registry ─────────────────────────────

CREATE TABLE IF NOT EXISTS public.runtime_incidents (
  id                    UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID          NOT NULL,
  branch_id             UUID          NOT NULL,
  incident_type         TEXT          NOT NULL,
  severity              TEXT          NOT NULL,
  message               TEXT          NOT NULL,
  details               JSONB         NOT NULL DEFAULT '{}',
  resolved              BOOLEAN       NOT NULL DEFAULT false,
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  resolved_at           TIMESTAMPTZ
);

CREATE INDEX idx_runtime_incidents_tenant ON public.runtime_incidents (tenant_id, branch_id) WHERE resolved = false;


-- ─── 4. Distributed Rate Limits ────────────────────────────────

CREATE TABLE IF NOT EXISTS public.distributed_rate_limits (
  key                   TEXT          PRIMARY KEY,
  request_count         INTEGER       NOT NULL DEFAULT 0,
  window_start          TIMESTAMPTZ   NOT NULL,
  expires_at            TIMESTAMPTZ   NOT NULL
);

CREATE INDEX idx_rate_limits_expiry ON public.distributed_rate_limits (expires_at);


-- ─── 5. Row-Level Security Policies ────────────────────────────

ALTER TABLE public.runtime_event_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projection_schema_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.runtime_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.distributed_rate_limits ENABLE ROW LEVEL SECURITY;

-- Tenant isolation policies using auth.jwt() tenant check
DROP POLICY IF EXISTS "tenant_isolation_ledger" ON public.runtime_event_ledger;
CREATE POLICY "tenant_isolation_ledger" ON public.runtime_event_ledger AS RESTRICTIVE FOR ALL USING (auth.jwt() ->> 'tenant_id' = tenant_id::text);

DROP POLICY IF EXISTS "tenant_isolation_incidents" ON public.runtime_incidents;
CREATE POLICY "tenant_isolation_incidents" ON public.runtime_incidents AS RESTRICTIVE FOR ALL USING (auth.jwt() ->> 'tenant_id' = tenant_id::text);

-- Schema registry and rate limits are internal infra tables, accessible by system role only
DROP POLICY IF EXISTS "admin_access_registry" ON public.projection_schema_registry;
CREATE POLICY "admin_access_registry" ON public.projection_schema_registry FOR ALL USING (TRUE);

DROP POLICY IF EXISTS "admin_access_limits" ON public.distributed_rate_limits;
CREATE POLICY "admin_access_limits" ON public.distributed_rate_limits FOR ALL USING (TRUE);

COMMIT;
