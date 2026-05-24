-- ============================================================
-- Migration: 20260520000002_infrastructure_hardening.sql
-- Implements production-grade reliability infrastructure tables:
-- - Immutable append-only audit_logs with strict triggers
-- - Distributed worker_leases for failover and partition coordination
-- - Token bucket rate_limit_buckets for tenant-aware quota limits
-- ============================================================

BEGIN;

-- ─── 1. IMMUTABLE AUDIT LOGS ───────────────────────────────────

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID        REFERENCES public.tenants(id) ON DELETE RESTRICT, -- Nullable for system/platform admins
  branch_id       UUID        REFERENCES public.branches(id) ON DELETE RESTRICT, -- Nullable for global actions
  actor_id        UUID,                                                          -- References authenticated user
  actor_type      TEXT        NOT NULL CHECK (actor_type IN ('staff', 'customer', 'system', 'anonymous')),
  action          TEXT        NOT NULL,
  payload         JSONB       NOT NULL DEFAULT '{}',
  correlation_id  UUID        NOT NULL,
  ip_address      TEXT,
  user_agent      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexing for observability lookups
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_action
  ON public.audit_logs (tenant_id, action, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_correlation
  ON public.audit_logs (correlation_id);

CREATE INDEX IF NOT EXISTS idx_audit_logs_actor
  ON public.audit_logs (actor_id, created_at DESC);

-- Enforce strict immutability trigger (No UPDATEs or DELETEs)
CREATE OR REPLACE FUNCTION public.enforce_audit_logs_immutability()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Audit logs are strictly append-only and cannot be updated or deleted';
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_audit_logs_immutability ON public.audit_logs;
CREATE TRIGGER trg_enforce_audit_logs_immutability
  BEFORE UPDATE OR DELETE ON public.audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.enforce_audit_logs_immutability();

-- Row Level Security (RLS) for audit_logs
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_logs_tenant_isolation" ON public.audit_logs
  FOR ALL USING (
    auth.role() = 'service_role' OR 
    (auth.jwt() ->> 'tenant_id' = tenant_id::text)
  );


-- ─── 2. DISTRIBUTED WORKER LEASES ───────────────────────────────

CREATE TABLE IF NOT EXISTS public.worker_leases (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_name         TEXT        NOT NULL UNIQUE,
  node_id             UUID        NOT NULL,
  lease_acquired_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  lease_expires_at    TIMESTAMPTZ NOT NULL,
  status              TEXT        NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'orphaned', 'released')),
  version_num         INTEGER     NOT NULL DEFAULT 1
);

-- Indexing for expiry scanning
CREATE INDEX IF NOT EXISTS idx_worker_leases_expires
  ON public.worker_leases (lease_expires_at, status);

-- Trigger for version bumping on updates
CREATE OR REPLACE FUNCTION public.increment_lease_version()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.version_num := OLD.version_num + 1;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_increment_lease_version ON public.worker_leases;
CREATE TRIGGER trg_increment_lease_version
  BEFORE UPDATE ON public.worker_leases
  FOR EACH ROW EXECUTE FUNCTION public.increment_lease_version();

-- Enable RLS
ALTER TABLE public.worker_leases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "worker_leases_system_isolation" ON public.worker_leases
  FOR ALL USING (auth.role() = 'service_role' OR auth.role() = 'authenticated');


-- ─── 3. RATE LIMITING BUCKETS ──────────────────────────────────

CREATE TABLE IF NOT EXISTS public.rate_limit_buckets (
  key                 TEXT        PRIMARY KEY,
  tokens              NUMERIC     NOT NULL CHECK (tokens >= 0),
  last_refilled_at    TIMESTAMPTZ NOT NULL,
  expires_at          TIMESTAMPTZ NOT NULL
);

-- Index for cleanup of expired rate buckets
CREATE INDEX IF NOT EXISTS idx_rate_limit_buckets_expiry
  ON public.rate_limit_buckets (expires_at);

-- Enable RLS
ALTER TABLE public.rate_limit_buckets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rate_limit_system_isolation" ON public.rate_limit_buckets
  FOR ALL USING (auth.role() = 'service_role' OR auth.role() = 'authenticated');


-- ─── 4. RECOVERY ORCHESTRATION EVENTS ───────────────────────────

CREATE TABLE IF NOT EXISTS public.recovery_jobs (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID        REFERENCES public.tenants(id) ON DELETE CASCADE,
  job_type            TEXT        NOT NULL CHECK (job_type IN ('projection_rebuild', 'reconciliation_repair', 'dead_letter_replay')),
  status              TEXT        NOT NULL CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  parameters          JSONB       NOT NULL DEFAULT '{}',
  result_summary      JSONB,
  error_message       TEXT,
  started_by          UUID,
  started_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at        TIMESTAMPTZ
);

-- Enable RLS
ALTER TABLE public.recovery_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "recovery_jobs_tenant_isolation" ON public.recovery_jobs
  FOR ALL USING (
    auth.role() = 'service_role' OR 
    (auth.jwt() ->> 'tenant_id' = tenant_id::text)
  );

-- ─── 5. ATOMIC TOKEN BUCKET RATE LIMITING FUNCTION ─────────────

CREATE OR REPLACE FUNCTION public.check_rate_limit_raw(
  p_key TEXT,
  p_capacity NUMERIC,
  p_refill_rate NUMERIC,
  p_window_sec INTEGER
)
RETURNS TABLE (allowed BOOLEAN, remaining NUMERIC) AS $$
DECLARE
  v_tokens NUMERIC;
  v_last_refilled_at TIMESTAMPTZ;
  v_new_tokens NUMERIC;
  v_allowed BOOLEAN := FALSE;
BEGIN
  -- Perform advisory locking or standard row locking for strict serialization
  -- First check if row exists
  SELECT tokens, last_refilled_at INTO v_tokens, v_last_refilled_at
  FROM public.rate_limit_buckets
  WHERE key = p_key
  FOR UPDATE;

  IF NOT FOUND THEN
    -- First time insertion
    v_new_tokens := p_capacity - 1;
    INSERT INTO public.rate_limit_buckets (key, tokens, last_refilled_at, expires_at)
    VALUES (p_key, v_new_tokens, NOW(), NOW() + (p_window_sec || ' seconds')::interval)
    ON CONFLICT (key) DO UPDATE SET
      tokens = LEAST(p_capacity - 1, rate_limit_buckets.tokens), -- Safe no-op to resolve race conditions
      last_refilled_at = NOW();
    v_allowed := TRUE;
  ELSE
    -- Calculate refilled tokens
    v_new_tokens := LEAST(p_capacity, v_tokens + (EXTRACT(EPOCH FROM (NOW() - v_last_refilled_at)) * p_refill_rate));
    
    IF v_new_tokens >= 1 THEN
      v_new_tokens := v_new_tokens - 1;
      v_allowed := TRUE;
    END IF;

    UPDATE public.rate_limit_buckets
    SET tokens = v_new_tokens,
        last_refilled_at = NOW(),
        expires_at = NOW() + (p_window_sec || ' seconds')::interval
    WHERE key = p_key;
  END IF;

  RETURN QUERY SELECT v_allowed, v_new_tokens;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;
