-- ============================================================
-- Migration: 20260527000000_multi_surface_integration.sql
-- Multi-Surface Operational Coordination + Replay Fencing
-- ============================================================

BEGIN;

-- ─── 1. Runtime Replay Fences ───────────────────────────────────

CREATE TABLE IF NOT EXISTS public.runtime_replay_fences (
  id                    UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID          NOT NULL,
  branch_id             UUID          NOT NULL,
  projection_generation BIGINT        NOT NULL DEFAULT 0,
  active_deployment_id  UUID          NOT NULL,
  replay_epoch          TEXT          NOT NULL DEFAULT 'epoch_default',
  compatibility_window  INTERVAL      NOT NULL DEFAULT '1 hour'::interval,
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  expires_at            TIMESTAMPTZ   NOT NULL
);

CREATE INDEX idx_replay_fences_tenant ON public.runtime_replay_fences (tenant_id, branch_id);
CREATE INDEX idx_replay_fences_active ON public.runtime_replay_fences (expires_at);

-- ─── 2. Runtime Worker Registry ────────────────────────────────

CREATE TABLE IF NOT EXISTS public.runtime_worker_registry (
  id                    UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id             TEXT          NOT NULL UNIQUE,
  tenant_id             UUID          NOT NULL,
  branch_id             UUID          NOT NULL,
  worker_role           TEXT          NOT NULL,
  replay_ownership      JSONB         NOT NULL DEFAULT '[]'::jsonb,
  projection_ownership  JSONB         NOT NULL DEFAULT '[]'::jsonb,
  heartbeat_status      TEXT          NOT NULL DEFAULT 'HEALTHY',
  deployment_version    TEXT          NOT NULL,
  reconnect_load        INTEGER       NOT NULL DEFAULT 0,
  last_heartbeat        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_worker_registry_tenant ON public.runtime_worker_registry (tenant_id, branch_id);
CREATE INDEX idx_worker_registry_heartbeat ON public.runtime_worker_registry (last_heartbeat);

-- ─── 3. Runtime Projection Ownership (Leases) ───────────────────

CREATE TABLE IF NOT EXISTS public.runtime_projection_ownership (
  projection_name       TEXT          NOT NULL,
  tenant_id             UUID          NOT NULL,
  branch_id             UUID          NOT NULL,
  owner_worker_id       TEXT          NOT NULL REFERENCES public.runtime_worker_registry(worker_id) ON DELETE CASCADE,
  leased_at             TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  expires_at            TIMESTAMPTZ   NOT NULL,
  PRIMARY KEY (projection_name, tenant_id, branch_id)
);

CREATE INDEX idx_projection_ownership_expiry ON public.runtime_projection_ownership (expires_at);

-- ─── 4. Durable Replay Checkpoints ──────────────────────────────

CREATE TABLE IF NOT EXISTS public.runtime_replay_checkpoints (
  id                    UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID          NOT NULL,
  branch_id             UUID          NOT NULL,
  projection_name       TEXT          NOT NULL,
  last_sequence         BIGINT        NOT NULL DEFAULT 0,
  checksum              TEXT          NOT NULL,
  updated_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_tenant_branch_projection UNIQUE (tenant_id, branch_id, projection_name)
);

CREATE INDEX idx_replay_checkpoints_tenant ON public.runtime_replay_checkpoints (tenant_id, branch_id);

-- ─── 5. Row-Level Security (RLS) Policies ───────────────────────

ALTER TABLE public.runtime_replay_fences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.runtime_worker_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.runtime_projection_ownership ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.runtime_replay_checkpoints ENABLE ROW LEVEL SECURITY;

-- Tenant Isolation Policies based on JWT tenant_id
DROP POLICY IF EXISTS "tenant_isolation_fences" ON public.runtime_replay_fences;
CREATE POLICY "tenant_isolation_fences" ON public.runtime_replay_fences AS RESTRICTIVE FOR ALL USING (auth.jwt() ->> 'tenant_id' = tenant_id::text);

DROP POLICY IF EXISTS "tenant_isolation_workers" ON public.runtime_worker_registry;
CREATE POLICY "tenant_isolation_workers" ON public.runtime_worker_registry AS RESTRICTIVE FOR ALL USING (auth.jwt() ->> 'tenant_id' = tenant_id::text);

DROP POLICY IF EXISTS "tenant_isolation_locks" ON public.runtime_projection_ownership;
CREATE POLICY "tenant_isolation_locks" ON public.runtime_projection_ownership AS RESTRICTIVE FOR ALL USING (auth.jwt() ->> 'tenant_id' = tenant_id::text);

DROP POLICY IF EXISTS "tenant_isolation_checkpoints" ON public.runtime_replay_checkpoints;
CREATE POLICY "tenant_isolation_checkpoints" ON public.runtime_replay_checkpoints AS RESTRICTIVE FOR ALL USING (auth.jwt() ->> 'tenant_id' = tenant_id::text);

-- Support full access for internal service role (system bypasses restriction)
DROP POLICY IF EXISTS "service_role_all_fences" ON public.runtime_replay_fences;
CREATE POLICY "service_role_all_fences" ON public.runtime_replay_fences FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

DROP POLICY IF EXISTS "service_role_all_workers" ON public.runtime_worker_registry;
CREATE POLICY "service_role_all_workers" ON public.runtime_worker_registry FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

DROP POLICY IF EXISTS "service_role_all_locks" ON public.runtime_projection_ownership;
CREATE POLICY "service_role_all_locks" ON public.runtime_projection_ownership FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

DROP POLICY IF EXISTS "service_role_all_checkpoints" ON public.runtime_replay_checkpoints;
CREATE POLICY "service_role_all_checkpoints" ON public.runtime_replay_checkpoints FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

COMMIT;
