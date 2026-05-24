-- ============================================================
-- Migration: 20260519000010_commerce_hardening.sql
-- Commerce Hardening Pass: Idempotency status, checkout freeze metadata,
-- event consumer deduplication, and transactional boundaries.
-- ============================================================

BEGIN;

-- ─── STEP 2 Hardening: Idempotency Table Status ────────────────
-- Drop old trigger first so we can modify the table structure
DROP TRIGGER IF EXISTS enforce_idempotency_keys_immutability ON public.idempotency_keys;
DROP FUNCTION IF EXISTS public.enforce_idempotency_keys_immutability();

-- Add status column if not already present
ALTER TABLE public.idempotency_keys
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'started';

-- Add check constraint to ensure valid states
ALTER TABLE public.idempotency_keys
  DROP CONSTRAINT IF EXISTS chk_idempotency_keys_status,
  ADD CONSTRAINT chk_idempotency_keys_status CHECK (status IN ('started', 'completed'));

-- Allow updating the response status, body, and status when transitioning from started to completed,
-- but block any mutations once status is 'completed'.
CREATE OR REPLACE FUNCTION public.enforce_idempotency_rules()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'completed' THEN
    RAISE EXCEPTION 'Completed idempotency keys are strictly immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_idempotency_rules
  BEFORE UPDATE ON public.idempotency_keys
  FOR EACH ROW EXECUTE FUNCTION public.enforce_idempotency_rules();


-- ─── STEP 5 Hardening: Checkout Freeze Metadata ────────────────
-- Drop old order snapshots trigger to alter table structure
DROP TRIGGER IF EXISTS enforce_order_snapshots_immutability ON public.order_snapshots;
DROP FUNCTION IF EXISTS public.enforce_order_snapshots_immutability();

-- Add freeze metadata columns to order_snapshots
ALTER TABLE public.order_snapshots
  ADD COLUMN IF NOT EXISTS pricing_version      TEXT NOT NULL DEFAULT 'v1',
  ADD COLUMN IF NOT EXISTS tax_version          TEXT NOT NULL DEFAULT 'v1',
  ADD COLUMN IF NOT EXISTS override_version     TEXT NOT NULL DEFAULT 'v1',
  ADD COLUMN IF NOT EXISTS availability_version TEXT NOT NULL DEFAULT 'v1',
  ADD COLUMN IF NOT EXISTS menu_snapshot_hash   TEXT,
  ADD COLUMN IF NOT EXISTS checkout_timestamp   TIMESTAMPTZ;

-- Re-implement immutable check trigger:
-- Enforces absolute immutability EXCEPT for a single UPDATE setting order_id when it was NULL.
CREATE OR REPLACE FUNCTION public.enforce_order_snapshots_immutability()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- Check if order_id is the only updated field and it transitions from NULL to a UUID
  IF OLD.order_id IS NULL AND NEW.order_id IS NOT NULL THEN
    IF OLD.tenant_id = NEW.tenant_id AND
       OLD.branch_id = NEW.branch_id AND
       OLD.subtotal_minor = NEW.subtotal_minor AND
       OLD.tax_total_minor = NEW.tax_total_minor AND
       OLD.discount_total_minor = NEW.discount_total_minor AND
       OLD.grand_total_minor = NEW.grand_total_minor AND
       OLD.currency_code = NEW.currency_code AND
       OLD.item_count = NEW.item_count AND
       OLD.snapshot_version = NEW.snapshot_version AND
       OLD.pricing_version = NEW.pricing_version AND
       OLD.tax_version = NEW.tax_version AND
       OLD.override_version = NEW.override_version AND
       OLD.availability_version = NEW.availability_version THEN
      RETURN NEW;
    END IF;
  END IF;
  
  RAISE EXCEPTION 'order_snapshots rows are immutable — the snapshot is the frozen financial record';
END;
$$;

CREATE TRIGGER enforce_order_snapshots_immutability
  BEFORE UPDATE ON public.order_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.enforce_order_snapshots_immutability();


-- ─── STEP 4 Hardening: Event Consumers Deduplication ────────────
-- Dedupes outbox events consumed by downstream handlers
CREATE TABLE IF NOT EXISTS public.event_consumers (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID        NOT NULL,
  consumer_name   TEXT        NOT NULL,
  event_id        UUID        NOT NULL REFERENCES public.domain_events (id),
  processed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_event_consumers_consumer_event
  ON public.event_consumers (tenant_id, consumer_name, event_id);

ALTER TABLE public.event_consumers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "event_consumers_tenant_isolation" ON public.event_consumers;
CREATE POLICY "event_consumers_tenant_isolation" ON public.event_consumers
  AS RESTRICTIVE FOR ALL USING (auth.jwt() ->> 'tenant_id' = tenant_id::text);

DROP POLICY IF EXISTS "event_consumers_authenticated_access" ON public.event_consumers;
CREATE POLICY "event_consumers_authenticated_access" ON public.event_consumers
  AS PERMISSIVE FOR ALL USING (auth.role() = 'authenticated');

COMMIT;
