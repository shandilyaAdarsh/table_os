-- ============================================================
-- Migration: 20260519000013_claim_procedure.sql
-- Installs the claim_next_outbox_event database function for
-- concurrent-safe and deadlock-free event processing.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.claim_next_outbox_event(p_worker_name TEXT, p_lock_duration_sec INTEGER)
RETURNS SETOF public.domain_events AS $$
DECLARE
  v_event_id UUID;
BEGIN
  -- Dequeue exactly one eligible outbox event under SKIP LOCKED protection
  SELECT id INTO v_event_id
  FROM public.domain_events
  WHERE (delivery_status = 'pending' OR (delivery_status = 'failed' AND retry_count < 5 AND (locked_until IS NULL OR locked_until < NOW())))
  ORDER BY occurred_at ASC
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF v_event_id IS NOT NULL THEN
    RETURN QUERY
    UPDATE public.domain_events
    SET delivery_status = 'processing',
        locked_by = p_worker_name,
        locked_until = NOW() + (p_lock_duration_sec || ' seconds')::interval,
        last_attempt_at = NOW()
    WHERE id = v_event_id
    RETURNING *;
  END IF;
END;
$$ LANGUAGE plpgsql;

COMMIT;
