-- ============================================================
-- Migration: 20260519000017_relax_outbox_immutability.sql
-- Optimizes the outbox immutability trigger to permit updates
-- solely on tracking columns (status, locks, retries) while
-- completely blocking mutations to core payload/event fields.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.enforce_domain_events_immutability()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.id IS DISTINCT FROM NEW.id OR
     OLD.tenant_id IS DISTINCT FROM NEW.tenant_id OR
     OLD.branch_id IS DISTINCT FROM NEW.branch_id OR
     OLD.event_type IS DISTINCT FROM NEW.event_type OR
     OLD.aggregate_id IS DISTINCT FROM NEW.aggregate_id OR
     OLD.aggregate_type IS DISTINCT FROM NEW.aggregate_type OR
     OLD.sequence_num IS DISTINCT FROM NEW.sequence_num OR
     OLD.payload IS DISTINCT FROM NEW.payload OR
     OLD.occurred_at IS DISTINCT FROM NEW.occurred_at THEN
    RAISE EXCEPTION 'domain_events core payload is immutable — events are a permanent audit ledger';
  END IF;
  RETURN NEW;
END;
$$;

COMMIT;
