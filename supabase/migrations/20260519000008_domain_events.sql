-- ============================================================
-- Migration: 20260519000008_domain_events.sql
-- Phase 5: Realtime Event Foundation — outbox pattern,
-- append-only domain events, retry-safe delivery tracking.
-- ============================================================

BEGIN;

-- Drop placeholder table from Phase 2 before recreating with Phase 5 schema
DROP TABLE IF EXISTS public.domain_events CASCADE;

-- ─── domain_events ────────────────────────────────────────────
-- Append-only outbox table. Written in the same DB transaction
-- as the mutation that caused the event. A worker reads and delivers.

CREATE TABLE IF NOT EXISTS public.domain_events (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID        NOT NULL,
  branch_id       UUID,
  event_type      TEXT        NOT NULL,
  aggregate_id    UUID        NOT NULL,
  aggregate_type  TEXT        NOT NULL,
  -- Monotonically increasing sequence per aggregate for ordering
  sequence_num    BIGINT      NOT NULL DEFAULT 0,
  payload         JSONB       NOT NULL DEFAULT '{}',
  occurred_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ordering per aggregate
CREATE INDEX IF NOT EXISTS idx_domain_events_aggregate
  ON public.domain_events (aggregate_type, aggregate_id, sequence_num ASC);

-- Worker pickup: undelivered events ordered by occurrence
CREATE INDEX IF NOT EXISTS idx_domain_events_occurred_at
  ON public.domain_events (occurred_at ASC);

CREATE INDEX IF NOT EXISTS idx_domain_events_tenant_id
  ON public.domain_events (tenant_id);

CREATE INDEX IF NOT EXISTS idx_domain_events_event_type
  ON public.domain_events (event_type, occurred_at ASC);

-- Domain events are immutable — the outbox is a ledger
CREATE OR REPLACE FUNCTION public.enforce_domain_events_immutability()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'domain_events rows are immutable — events are a permanent audit ledger';
END;
$$;

DROP TRIGGER IF EXISTS enforce_domain_events_immutability ON public.domain_events;
CREATE TRIGGER enforce_domain_events_immutability
  BEFORE UPDATE ON public.domain_events
  FOR EACH ROW EXECUTE FUNCTION public.enforce_domain_events_immutability();

-- Auto-assign sequence_num per aggregate (prevents application-layer races)
CREATE OR REPLACE FUNCTION public.assign_domain_event_sequence()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  SELECT COALESCE(MAX(sequence_num), 0) + 1
    INTO NEW.sequence_num
    FROM public.domain_events
   WHERE aggregate_type = NEW.aggregate_type
     AND aggregate_id   = NEW.aggregate_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS assign_domain_event_sequence ON public.domain_events;
CREATE TRIGGER assign_domain_event_sequence
  BEFORE INSERT ON public.domain_events
  FOR EACH ROW EXECUTE FUNCTION public.assign_domain_event_sequence();

-- ─── event_deliveries ─────────────────────────────────────────
-- Tracks which events have been delivered to which channels.
-- Supports retry-safe, at-least-once delivery.

CREATE TABLE IF NOT EXISTS public.event_deliveries (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        UUID        NOT NULL REFERENCES public.domain_events (id),
  tenant_id       UUID        NOT NULL,
  -- Channel: 'supabase_realtime' | 'webhook' | 'push'
  channel         TEXT        NOT NULL,
  channel_target  TEXT,       -- e.g. webhook URL or topic name
  -- Delivery state
  status          TEXT        NOT NULL DEFAULT 'pending',
  attempt_count   SMALLINT    NOT NULL DEFAULT 0,
  last_attempted_at TIMESTAMPTZ,
  delivered_at    TIMESTAMPTZ,
  next_retry_at   TIMESTAMPTZ,
  error_detail    TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Unique delivery target per event + channel
CREATE UNIQUE INDEX IF NOT EXISTS idx_event_deliveries_event_channel
  ON public.event_deliveries (event_id, channel, COALESCE(channel_target, ''));

-- Worker: pending deliveries due for retry
CREATE INDEX IF NOT EXISTS idx_event_deliveries_pending
  ON public.event_deliveries (next_retry_at ASC)
  WHERE (status IN ('pending', 'retry'));

CREATE INDEX IF NOT EXISTS idx_event_deliveries_tenant_id
  ON public.event_deliveries (tenant_id);

DROP TRIGGER IF EXISTS handle_event_deliveries_updated_at ON public.event_deliveries;
CREATE TRIGGER handle_event_deliveries_updated_at
  BEFORE UPDATE ON public.event_deliveries
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ─── idempotency_keys ─────────────────────────────────────────
-- Global idempotency store for POST operations.

CREATE TABLE IF NOT EXISTS public.idempotency_keys (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID        NOT NULL,
  idempotency_key TEXT        NOT NULL,
  request_path    TEXT        NOT NULL,
  -- Cached response for duplicate requests
  response_status INTEGER     NOT NULL,
  response_body   JSONB       NOT NULL DEFAULT '{}',
  expires_at      TIMESTAMPTZ NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_idempotency_keys_tenant_key
  ON public.idempotency_keys (tenant_id, idempotency_key);

CREATE INDEX IF NOT EXISTS idx_idempotency_keys_expires_at
  ON public.idempotency_keys (expires_at);

-- Idempotency records are immutable
CREATE OR REPLACE FUNCTION public.enforce_idempotency_keys_immutability()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'idempotency_keys rows are immutable';
END;
$$;

DROP TRIGGER IF EXISTS enforce_idempotency_keys_immutability ON public.idempotency_keys;
CREATE TRIGGER enforce_idempotency_keys_immutability
  BEFORE UPDATE ON public.idempotency_keys
  FOR EACH ROW EXECUTE FUNCTION public.enforce_idempotency_keys_immutability();

-- ─── RLS ──────────────────────────────────────────────────────

ALTER TABLE public.domain_events     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_deliveries  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.idempotency_keys  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "domain_events_tenant_isolation"         ON public.domain_events;
CREATE POLICY "domain_events_tenant_isolation" ON public.domain_events
  AS RESTRICTIVE FOR ALL USING (auth.jwt() ->> 'tenant_id' = tenant_id::text);
DROP POLICY IF EXISTS "domain_events_authenticated_access"     ON public.domain_events;
CREATE POLICY "domain_events_authenticated_access" ON public.domain_events
  AS PERMISSIVE FOR ALL USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "event_deliveries_tenant_isolation"      ON public.event_deliveries;
CREATE POLICY "event_deliveries_tenant_isolation" ON public.event_deliveries
  AS RESTRICTIVE FOR ALL USING (auth.jwt() ->> 'tenant_id' = tenant_id::text);
DROP POLICY IF EXISTS "event_deliveries_authenticated_access"  ON public.event_deliveries;
CREATE POLICY "event_deliveries_authenticated_access" ON public.event_deliveries
  AS PERMISSIVE FOR ALL USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "idempotency_keys_tenant_isolation"      ON public.idempotency_keys;
CREATE POLICY "idempotency_keys_tenant_isolation" ON public.idempotency_keys
  AS RESTRICTIVE FOR ALL USING (auth.jwt() ->> 'tenant_id' = tenant_id::text);
DROP POLICY IF EXISTS "idempotency_keys_authenticated_access"  ON public.idempotency_keys;
CREATE POLICY "idempotency_keys_authenticated_access" ON public.idempotency_keys
  AS PERMISSIVE FOR ALL USING (auth.role() = 'authenticated');

COMMIT;
