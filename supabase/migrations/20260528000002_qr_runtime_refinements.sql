-- ============================================================
-- Migration: 20260528000002_qr_runtime_refinements.sql
-- Production Runtime Fixes for QR Bootstrapping
-- ============================================================

BEGIN;

-- 1. Create customer_identities table
CREATE TABLE IF NOT EXISTS public.customer_identities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.customer_identities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "customer_identities_tenant_isolation" ON public.customer_identities;
CREATE POLICY "customer_identities_tenant_isolation" ON public.customer_identities
  AS RESTRICTIVE FOR ALL
  USING (auth.jwt() ->> 'tenant_id' = tenant_id::text);

-- 2. Add Guest Session Enums & Columns
ALTER TYPE public.qr_session_status ADD VALUE IF NOT EXISTS 'closed';
ALTER TYPE public.qr_session_status ADD VALUE IF NOT EXISTS 'abandoned';

ALTER TABLE public.guest_sessions
  ADD COLUMN IF NOT EXISTS customer_identity_id UUID REFERENCES public.customer_identities(id),
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;

-- 3. Drop qr_scan_nonces and its references
ALTER TABLE public.guest_sessions DROP COLUMN IF EXISTS nonce_id;
DROP TABLE IF EXISTS public.qr_scan_nonces CASCADE;

-- 4. Add user_agent_hash to table_qr_tokens
ALTER TABLE public.table_qr_tokens
  ADD COLUMN IF NOT EXISTS user_agent_hash TEXT;

-- 5. Immutability Trigger for snapshot_id
CREATE OR REPLACE FUNCTION public.enforce_guest_sessions_snapshot_immutability()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.snapshot_id IS NOT NULL AND NEW.snapshot_id <> OLD.snapshot_id THEN
    RAISE EXCEPTION 'snapshot_id is immutable once set on guest_sessions';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_guest_sessions_snapshot_immutability_trigger ON public.guest_sessions;
CREATE TRIGGER enforce_guest_sessions_snapshot_immutability_trigger
  BEFORE UPDATE ON public.guest_sessions
  FOR EACH ROW EXECUTE FUNCTION public.enforce_guest_sessions_snapshot_immutability();

COMMIT;
