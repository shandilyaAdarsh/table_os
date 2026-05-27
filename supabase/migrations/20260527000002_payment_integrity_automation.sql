-- ============================================================
-- Migration: 20260527000002_payment_integrity_automation.sql
-- Payment Integrity Ledger, Idempotency Registry, Capacity Metrics
-- ============================================================

BEGIN;

-- ─── 1. Payment Ledger (Immutable Financial Ledger) ─────────────

CREATE TABLE IF NOT EXISTS public.payment_ledger (
  id                    UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID          NOT NULL,
  branch_id             UUID          NOT NULL,
  order_id              UUID          NOT NULL,
  payment_provider      TEXT          NOT NULL,
  payment_reference     TEXT          NOT NULL UNIQUE,
  payment_status        TEXT          NOT NULL,
  payment_amount_minor  INTEGER       NOT NULL,
  currency_code         TEXT          NOT NULL DEFAULT 'USD',
  idempotency_key       TEXT          NOT NULL UNIQUE,
  replay_generation     BIGINT        NOT NULL DEFAULT 0,
  initiated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  finalized_at          TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_payment_ledger_tenant ON public.payment_ledger (tenant_id, branch_id);
CREATE INDEX IF NOT EXISTS idx_payment_ledger_order ON public.payment_ledger (order_id);

-- Enforce absolute append-only trigger rules on payment_ledger
CREATE OR REPLACE FUNCTION public.block_payment_ledger_mutations()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Financial Ledger entries are strictly immutable. Updates and deletions are forbidden.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_block_payment_ledger_mutations ON public.payment_ledger;
CREATE TRIGGER trg_block_payment_ledger_mutations
  BEFORE UPDATE OR DELETE ON public.payment_ledger
  FOR EACH ROW EXECUTE FUNCTION public.block_payment_ledger_mutations();

-- ─── 2. Idempotency Registry ──────────────────────────────────

CREATE TABLE IF NOT EXISTS public.idempotency_registry (
  idempotency_key       TEXT          PRIMARY KEY,
  tenant_id             UUID          NOT NULL,
  response_payload      JSONB         NOT NULL DEFAULT '{}'::jsonb,
  expires_at            TIMESTAMPTZ   NOT NULL,
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_idempotency_expiry ON public.idempotency_registry (expires_at);

-- ─── 3. Runtime Capacity Metrics ─────────────────────────────

CREATE TABLE IF NOT EXISTS public.runtime_capacity_metrics (
  id                    UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID          NOT NULL,
  branch_id             UUID          NOT NULL,
  replay_throughput     INTEGER       NOT NULL DEFAULT 0,
  queue_pressure        INTEGER       NOT NULL DEFAULT 0,
  websocket_load        INTEGER       NOT NULL DEFAULT 0,
  worker_utilization    NUMERIC(5,2)  NOT NULL DEFAULT 0.00,
  replay_saturation     NUMERIC(5,2)  NOT NULL DEFAULT 0.00,
  rebuild_pressure      INTEGER       NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_capacity_metrics_tenant ON public.runtime_capacity_metrics (tenant_id, branch_id);
CREATE INDEX IF NOT EXISTS idx_capacity_metrics_created ON public.runtime_capacity_metrics (created_at);

-- ─── 4. Row-Level Security (RLS) Policies ───────────────────────

ALTER TABLE public.payment_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.idempotency_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.runtime_capacity_metrics ENABLE ROW LEVEL SECURITY;

-- Tenant Isolation Policies based on JWT tenant_id
DROP POLICY IF EXISTS "tenant_isolation_payments" ON public.payment_ledger;
CREATE POLICY "tenant_isolation_payments" ON public.payment_ledger AS RESTRICTIVE FOR ALL USING (auth.jwt() ->> 'tenant_id' = tenant_id::text);

DROP POLICY IF EXISTS "tenant_isolation_idempotency" ON public.idempotency_registry;
CREATE POLICY "tenant_isolation_idempotency" ON public.idempotency_registry AS RESTRICTIVE FOR ALL USING (auth.jwt() ->> 'tenant_id' = tenant_id::text);

DROP POLICY IF EXISTS "tenant_isolation_capacity" ON public.runtime_capacity_metrics;
CREATE POLICY "tenant_isolation_capacity" ON public.runtime_capacity_metrics AS RESTRICTIVE FOR ALL USING (auth.jwt() ->> 'tenant_id' = tenant_id::text);

-- Support full access for internal service role (system bypasses restriction)
DROP POLICY IF EXISTS "service_role_all_payments" ON public.payment_ledger;
CREATE POLICY "service_role_all_payments" ON public.payment_ledger FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

DROP POLICY IF EXISTS "service_role_all_idempotency" ON public.idempotency_registry;
CREATE POLICY "service_role_all_idempotency" ON public.idempotency_registry FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

DROP POLICY IF EXISTS "service_role_all_capacity" ON public.runtime_capacity_metrics;
CREATE POLICY "service_role_all_capacity" ON public.runtime_capacity_metrics FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

COMMIT;
