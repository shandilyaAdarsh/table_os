-- ============================================================
-- Migration: 20260519000012_commerce_reliability.sql
-- Commerce Reliability Pass: Hardened idempotency, outbox queueing,
-- dead-letter queue, event sequencing triggers, and worker heartbeats.
-- ============================================================

BEGIN;

-- ────────────────────────────────────────────────────────────
-- 1. HARDEN IDEMPOTENCY STATES & TRANSITIONS
-- ────────────────────────────────────────────────────────────

-- Drop old trigger
DROP TRIGGER IF EXISTS enforce_idempotency_rules ON public.idempotency_keys;
DROP FUNCTION IF EXISTS public.enforce_idempotency_rules();

-- Add request_hash if not exists
ALTER TABLE public.idempotency_keys
  ADD COLUMN IF NOT EXISTS request_hash TEXT;

-- Update constraints
ALTER TABLE public.idempotency_keys
  DROP CONSTRAINT IF EXISTS chk_idempotency_keys_status;

ALTER TABLE public.idempotency_keys
  ADD CONSTRAINT chk_idempotency_keys_status CHECK (status IN ('started', 'completed', 'failed', 'expired'));

-- Hardened Trigger function enforcing FSM transitions and complete immutability after completion
CREATE OR REPLACE FUNCTION public.enforce_idempotency_rules()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- 1. Immutable Fields Protection
  IF OLD.idempotency_key IS DISTINCT FROM NEW.idempotency_key OR
     OLD.tenant_id IS DISTINCT FROM NEW.tenant_id OR
     OLD.request_path IS DISTINCT FROM NEW.request_path OR
     (OLD.request_hash IS NOT NULL AND OLD.request_hash IS DISTINCT FROM NEW.request_hash) THEN
    RAISE EXCEPTION 'Idempotency key metadata (key, tenant, path, hash) is strictly immutable';
  END IF;

  -- 2. Prevent any modification of completed states
  IF OLD.status = 'completed' THEN
    RAISE EXCEPTION 'Idempotency key in completed status is strictly immutable';
  END IF;

  -- 3. Transition validation (started -> completed, started -> failed, failed -> expired)
  IF OLD.status = 'started' AND NEW.status NOT IN ('completed', 'failed') THEN
    RAISE EXCEPTION 'Invalid transition from started. Allowed: completed, failed';
  END IF;

  IF OLD.status = 'failed' AND NEW.status NOT IN ('expired') THEN
    RAISE EXCEPTION 'Invalid transition from failed. Allowed: expired';
  END IF;

  IF OLD.status = 'expired' THEN
    RAISE EXCEPTION 'Idempotency key in expired status is strictly immutable';
  END IF;

  -- 4. Response Immutability Protection after completion
  IF NEW.status = 'completed' AND (NEW.response_status IS NULL OR NEW.response_body IS NULL) THEN
    RAISE EXCEPTION 'Completed idempotency records must contain valid response status and body';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_idempotency_rules
  BEFORE UPDATE ON public.idempotency_keys
  FOR EACH ROW EXECUTE FUNCTION public.enforce_idempotency_rules();


-- ────────────────────────────────────────────────────────────
-- 2. DOMAIN EVENT OUTBOX COLUMNS & DEAD-LETTER QUEUE (DLQ)
-- ────────────────────────────────────────────────────────────

-- Add reliability tracking columns to domain_events
ALTER TABLE public.domain_events
  ADD COLUMN IF NOT EXISTS delivery_status  TEXT NOT NULL DEFAULT 'pending' CHECK (delivery_status IN ('pending', 'processing', 'delivered', 'failed', 'dead_letter')),
  ADD COLUMN IF NOT EXISTS retry_count       INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_by         TEXT,
  ADD COLUMN IF NOT EXISTS locked_until      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_attempt_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS error_reason      TEXT;

-- Indices for rapid queue querying
CREATE INDEX IF NOT EXISTS idx_domain_events_queue_lookup
  ON public.domain_events (delivery_status, locked_until)
  WHERE (delivery_status IN ('pending', 'failed'));

-- Dead letter events
CREATE TABLE IF NOT EXISTS public.dead_letter_events (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        UUID        NOT NULL REFERENCES public.domain_events (id) ON DELETE CASCADE,
  tenant_id       UUID        NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  aggregate_type  TEXT        NOT NULL,
  aggregate_id    UUID        NOT NULL,
  event_type      TEXT        NOT NULL,
  payload         JSONB       NOT NULL,
  reason          TEXT,
  failed_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at     TIMESTAMPTZ,
  resolved_by     UUID
);

-- Failed dispatch attempts log
CREATE TABLE IF NOT EXISTS public.failed_dispatch_attempts (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        UUID        NOT NULL REFERENCES public.domain_events (id) ON DELETE CASCADE,
  attempt_num     INTEGER     NOT NULL,
  error_message   TEXT,
  attempted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS and add basic security policies
ALTER TABLE public.dead_letter_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.failed_dispatch_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "dead_letter_events_isolation" ON public.dead_letter_events;
CREATE POLICY "dead_letter_events_isolation" ON public.dead_letter_events
  AS RESTRICTIVE FOR ALL USING (auth.jwt() ->> 'tenant_id' = tenant_id::text);

DROP POLICY IF EXISTS "dead_letter_events_authenticated" ON public.dead_letter_events;
CREATE POLICY "dead_letter_events_authenticated" ON public.dead_letter_events
  AS PERMISSIVE FOR ALL USING (auth.role() = 'authenticated');

-- ────────────────────────────────────────────────────────────
-- 3. WORKER HEARTBEATS & LEASE TRACKER
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.worker_heartbeats (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_name         TEXT        NOT NULL UNIQUE,
  last_heartbeat_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status              TEXT        NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive'))
);

ALTER TABLE public.worker_heartbeats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "worker_heartbeats_authenticated" ON public.worker_heartbeats;
CREATE POLICY "worker_heartbeats_authenticated" ON public.worker_heartbeats
  AS PERMISSIVE FOR ALL USING (auth.role() = 'authenticated');


-- ────────────────────────────────────────────────────────────
-- 4. MONOTONIC AGGREGATE SEQUENCING TRIGGERS
-- ────────────────────────────────────────────────────────────

-- Helper function to atomically allocate the next sequence number per tenant & branch
CREATE OR REPLACE FUNCTION public.get_next_aggregate_sequence(p_tenant_id UUID, p_branch_id UUID, p_table_name TEXT)
RETURNS BIGINT LANGUAGE plpgsql AS $$
DECLARE
  v_seq BIGINT;
BEGIN
  -- Perform an advisory lock scoped to the tenant, branch and table to serialize assignments perfectly
  -- and prevent race conditions or gaps under extreme concurrent inserts.
  PERFORM pg_advisory_xact_lock(hashtext(p_tenant_id::text || p_branch_id::text || p_table_name));

  -- Get max + 1
  EXECUTE format('
    SELECT COALESCE(MAX(sequence_num), 0) + 1
    FROM public.%I
    WHERE tenant_id = $1 AND branch_id = $2
  ', p_table_name)
  INTO v_seq
  USING p_tenant_id, p_branch_id;

  RETURN v_seq;
END;
$$;

-- Add sequence_num column and triggers to: orders, invoices, kitchen_orders, tables, qr_sessions
-- Wait, let's check kitchen_orders vs kitchen_tickets. The kitchen table is kitchen_orders. Let's make sure it is correct.
-- First, add columns safely
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS sequence_num BIGINT;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS sequence_num BIGINT;
ALTER TABLE public.kitchen_orders ADD COLUMN IF NOT EXISTS sequence_num BIGINT;
ALTER TABLE public.tables ADD COLUMN IF NOT EXISTS sequence_num BIGINT;
ALTER TABLE public.qr_sessions ADD COLUMN IF NOT EXISTS sequence_num BIGINT;

-- Unique indices per tenant/branch sequence
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_seq ON public.orders (tenant_id, branch_id, sequence_num);
CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_seq ON public.invoices (tenant_id, branch_id, sequence_num);
CREATE UNIQUE INDEX IF NOT EXISTS idx_kitchen_orders_seq ON public.kitchen_orders (tenant_id, branch_id, sequence_num);
CREATE UNIQUE INDEX IF NOT EXISTS idx_tables_seq ON public.tables (tenant_id, branch_id, sequence_num);
CREATE UNIQUE INDEX IF NOT EXISTS idx_qr_sessions_seq ON public.qr_sessions (tenant_id, branch_id, sequence_num);

-- Triggers for sequencing
CREATE OR REPLACE FUNCTION public.trigger_assign_sequence()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.sequence_num IS NULL THEN
    NEW.sequence_num := public.get_next_aggregate_sequence(NEW.tenant_id, NEW.branch_id, TG_TABLE_NAME);
  END IF;
  RETURN NEW;
END;
$$;

-- Apply triggers
DROP TRIGGER IF EXISTS trg_orders_sequence ON public.orders;
CREATE TRIGGER trg_orders_sequence
  BEFORE INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.trigger_assign_sequence();

DROP TRIGGER IF EXISTS trg_invoices_sequence ON public.invoices;
CREATE TRIGGER trg_invoices_sequence
  BEFORE INSERT ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.trigger_assign_sequence();

DROP TRIGGER IF EXISTS trg_kitchen_orders_sequence ON public.kitchen_orders;
CREATE TRIGGER trg_kitchen_orders_sequence
  BEFORE INSERT ON public.kitchen_orders
  FOR EACH ROW EXECUTE FUNCTION public.trigger_assign_sequence();

DROP TRIGGER IF EXISTS trg_tables_sequence ON public.tables;
CREATE TRIGGER trg_tables_sequence
  BEFORE INSERT ON public.tables
  FOR EACH ROW EXECUTE FUNCTION public.trigger_assign_sequence();

DROP TRIGGER IF EXISTS trg_qr_sessions_sequence ON public.qr_sessions;
CREATE TRIGGER trg_qr_sessions_sequence
  BEFORE INSERT ON public.qr_sessions
  FOR EACH ROW EXECUTE FUNCTION public.trigger_assign_sequence();

COMMIT;
