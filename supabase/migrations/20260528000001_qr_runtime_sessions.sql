-- ============================================================
-- Migration: 20260528000001_customer_session_telemetry.sql
-- Customer Session Telemetry and Snapshot Pinning
-- ============================================================

BEGIN;

-- 1. Add Telemetry Fields to table_qr_tokens
ALTER TABLE public.table_qr_tokens
  ADD COLUMN IF NOT EXISTS access_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS suspicious_access_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_ip_hash TEXT;

-- (revoked_at and last_accessed_at were already added in 20260528000000_qr_token_lifecycle.sql)

-- 2. Add Snapshot Pinning to guest_sessions
ALTER TABLE public.guest_sessions
  ADD COLUMN IF NOT EXISTS snapshot_id UUID;

-- Optional constraint if menu_snapshots exists
-- We do not strictly enforce the FK yet in case menu_snapshots is missing from this stage of DB reset
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'menu_snapshots') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'guest_sessions_snapshot_id_fk'
        AND conrelid = 'public.guest_sessions'::regclass
    ) THEN
      ALTER TABLE public.guest_sessions
        ADD CONSTRAINT guest_sessions_snapshot_id_fk
        FOREIGN KEY (snapshot_id) REFERENCES public.menu_snapshots (id);
    END IF;
  END IF;
END $$;

COMMIT;
