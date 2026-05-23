-- ============================================================
-- Migration: 20260519000015_queue_partitioning.sql
-- Implements branch-aware database-level queue partitioning
-- with O(log N) partition index.
-- ============================================================

BEGIN;

-- 1. Add partition_key field
ALTER TABLE public.domain_events
  ADD COLUMN IF NOT EXISTS partition_key VARCHAR(64) NOT NULL DEFAULT 'default';

-- 2. Populate partition_key for existing rows using md5 hash of tenant_id + branch_id
UPDATE public.domain_events
SET partition_key = COALESCE(md5(tenant_id::text || COALESCE(branch_id::text, 'global')), 'default')
WHERE partition_key = 'default';

-- 3. Automatic partition key assignment trigger
CREATE OR REPLACE FUNCTION public.assign_outbox_partition_key()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.partition_key := COALESCE(md5(NEW.tenant_id::text || COALESCE(NEW.branch_id::text, 'global')), 'default');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assign_outbox_partition_key ON public.domain_events;
CREATE TRIGGER trg_assign_outbox_partition_key
  BEFORE INSERT ON public.domain_events
  FOR EACH ROW EXECUTE FUNCTION public.assign_outbox_partition_key();

-- 4. O(log N) claim Index targeting partition keys
CREATE INDEX IF NOT EXISTS idx_domain_events_partition_claim
  ON public.domain_events (partition_key, delivery_status, occurred_at ASC);

-- 5. Stored claim function overloaded to accept a partition_key
CREATE OR REPLACE FUNCTION public.claim_next_outbox_event(
  p_worker_name TEXT,
  p_lock_duration_sec INTEGER,
  p_partition_key TEXT
)
RETURNS SETOF public.domain_events AS $$
DECLARE
  v_event_id UUID;
BEGIN
  -- Dequeue exactly one eligible outbox event from the designated partition key
  SELECT id INTO v_event_id
  FROM public.domain_events
  WHERE partition_key = p_partition_key
    AND (delivery_status = 'pending' OR (delivery_status = 'failed' AND retry_count < 5 AND (locked_until IS NULL OR locked_until < NOW())))
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

-- 6. Helper function to fetch active partitions
CREATE OR REPLACE FUNCTION public.get_active_outbox_partitions()
RETURNS TABLE(partition_key VARCHAR, pending_count BIGINT) AS $$
BEGIN
  RETURN QUERY
  SELECT e.partition_key, COUNT(*) as pending_count
  FROM public.domain_events e
  WHERE e.delivery_status IN ('pending', 'failed') AND e.retry_count < 5
  GROUP BY e.partition_key
  ORDER BY pending_count DESC;
END;
$$ LANGUAGE plpgsql;

COMMIT;
