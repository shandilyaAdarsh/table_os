-- ============================================================
-- Migration: 20260519000016_operational_metrics.sql
-- Implements persistent, append-only, low-overhead metrics tables
-- for total system observability.
-- ============================================================

BEGIN;

-- 1. Worker metrics (throughput and latency)
CREATE TABLE IF NOT EXISTS public.worker_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_name VARCHAR(100) NOT NULL,
  partition_key VARCHAR(64) NOT NULL,
  event_id UUID,
  event_type VARCHAR(100) NOT NULL,
  execution_time_ms INT NOT NULL,
  status VARCHAR(20) NOT NULL, -- 'success', 'failed'
  error_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for partition analysis and latency averages
CREATE INDEX IF NOT EXISTS idx_worker_metrics_query
  ON public.worker_metrics (partition_key, created_at DESC);

-- 2. Queue partition health metrics
CREATE TABLE IF NOT EXISTS public.queue_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partition_key VARCHAR(64) NOT NULL,
  oldest_pending_age_sec INT NOT NULL,
  pending_count INT NOT NULL,
  failed_count INT NOT NULL,
  dlq_count INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_queue_metrics_partition
  ON public.queue_metrics (partition_key, created_at DESC);

-- 3. Replay audits & simulations
CREATE TABLE IF NOT EXISTS public.replay_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL,
  replay_reason TEXT,
  triggered_by VARCHAR(100),
  is_dry_run BOOLEAN NOT NULL DEFAULT FALSE,
  diff_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_replay_metrics_event
  ON public.replay_metrics (event_id, created_at DESC);

-- 4. Reconciliation repair counts
CREATE TABLE IF NOT EXISTS public.reconciliation_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name VARCHAR(100) NOT NULL,
  orders_reconciled INT NOT NULL DEFAULT 0,
  carts_reclaimed INT NOT NULL DEFAULT 0,
  kitchen_tickets_synced INT NOT NULL DEFAULT 0,
  idempotency_keys_freed INT NOT NULL DEFAULT 0,
  execution_time_ms INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reconciliation_metrics_time
  ON public.reconciliation_metrics (created_at DESC);

-- 5. DLQ lifecycles
CREATE TABLE IF NOT EXISTS public.dlq_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL,
  event_type VARCHAR(100) NOT NULL,
  retry_attempts INT NOT NULL,
  last_error TEXT,
  action VARCHAR(50) NOT NULL, -- 'isolated', 'replayed', 'purged'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dlq_metrics_event
  ON public.dlq_metrics (event_id, action);

-- Enable RLS for all metrics tables
ALTER TABLE public.worker_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.queue_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.replay_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reconciliation_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dlq_metrics ENABLE ROW LEVEL SECURITY;

-- Allow system roles (authenticated & service_role) full access for write/read
CREATE POLICY metrics_system_authenticated ON public.worker_metrics FOR ALL USING (auth.role() = 'authenticated' OR auth.role() = 'service_role');
CREATE POLICY metrics_system_queue ON public.queue_metrics FOR ALL USING (auth.role() = 'authenticated' OR auth.role() = 'service_role');
CREATE POLICY metrics_system_replay ON public.replay_metrics FOR ALL USING (auth.role() = 'authenticated' OR auth.role() = 'service_role');
CREATE POLICY metrics_system_reconciliation ON public.reconciliation_metrics FOR ALL USING (auth.role() = 'authenticated' OR auth.role() = 'service_role');
CREATE POLICY metrics_system_dlq ON public.dlq_metrics FOR ALL USING (auth.role() = 'authenticated' OR auth.role() = 'service_role');

-- Pruning/Retention cleanup procedure: deletes records older than 30 days
CREATE OR REPLACE FUNCTION public.prune_operational_metrics(p_days_to_keep INT)
RETURNS VOID AS $$
BEGIN
  DELETE FROM public.worker_metrics WHERE created_at < NOW() - (p_days_to_keep || ' days')::interval;
  DELETE FROM public.queue_metrics WHERE created_at < NOW() - (p_days_to_keep || ' days')::interval;
  DELETE FROM public.replay_metrics WHERE created_at < NOW() - (p_days_to_keep || ' days')::interval;
  DELETE FROM public.reconciliation_metrics WHERE created_at < NOW() - (p_days_to_keep || ' days')::interval;
  DELETE FROM public.dlq_metrics WHERE created_at < NOW() - (p_days_to_keep || ' days')::interval;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;
