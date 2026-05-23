-- ============================================================
-- Migration: 20260519000009_devices.sql
-- Phase 5: Device Service Foundation — registration, authentication,
-- heartbeat tracking, device state, branch-scoped isolation.
-- ============================================================

BEGIN;

-- Drop placeholder table from Phase 2 before recreating with Phase 5 schema
DROP TABLE IF EXISTS public.devices CASCADE;

DO $$ BEGIN
  CREATE TYPE public.device_type AS ENUM ('kds', 'pos', 'staff', 'admin');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.device_status AS ENUM ('online', 'offline', 'suspended');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── devices ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.devices (
  id                  UUID                  PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID                  NOT NULL,
  branch_id           UUID                  NOT NULL,
  device_type         public.device_type    NOT NULL,
  status              public.device_status  NOT NULL DEFAULT 'offline',
  -- Human-readable name set at registration
  display_name        TEXT                  NOT NULL,
  -- Hardware/browser fingerprint hash for binding
  device_fingerprint  TEXT,
  -- Signed device token issued at registration (rotated on re-register)
  device_token_hash   TEXT                  NOT NULL,
  -- Heartbeat tracking
  last_seen_at        TIMESTAMPTZ,
  -- Registration metadata
  registered_by       UUID,
  registered_at       TIMESTAMPTZ           NOT NULL DEFAULT NOW(),
  -- Suspension
  suspended_at        TIMESTAMPTZ,
  suspended_by        UUID,
  suspension_reason   TEXT,
  -- OCC
  version_num         INTEGER               NOT NULL DEFAULT 1,
  created_by          UUID,
  updated_by          UUID,
  created_at          TIMESTAMPTZ           NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ           NOT NULL DEFAULT NOW(),
  deleted_at          TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_devices_token_hash
  ON public.devices (device_token_hash) WHERE (deleted_at IS NULL);

CREATE UNIQUE INDEX IF NOT EXISTS idx_devices_fingerprint_branch
  ON public.devices (branch_id, device_fingerprint)
  WHERE (device_fingerprint IS NOT NULL AND deleted_at IS NULL);

CREATE INDEX IF NOT EXISTS idx_devices_tenant_id  ON public.devices (tenant_id);
CREATE INDEX IF NOT EXISTS idx_devices_branch_id  ON public.devices (branch_id) WHERE (deleted_at IS NULL);
CREATE INDEX IF NOT EXISTS idx_devices_type       ON public.devices (branch_id, device_type) WHERE (deleted_at IS NULL);
CREATE INDEX IF NOT EXISTS idx_devices_status     ON public.devices (branch_id, status) WHERE (deleted_at IS NULL);

DROP TRIGGER IF EXISTS handle_devices_updated_at ON public.devices;
CREATE TRIGGER handle_devices_updated_at
  BEFORE UPDATE ON public.devices
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS increment_devices_version ON public.devices;
CREATE TRIGGER increment_devices_version
  BEFORE UPDATE ON public.devices
  FOR EACH ROW EXECUTE FUNCTION public.increment_version_num();

CREATE OR REPLACE FUNCTION public.enforce_devices_immutability()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.tenant_id <> OLD.tenant_id THEN
    RAISE EXCEPTION 'tenant_id is immutable on devices';
  END IF;
  IF NEW.branch_id <> OLD.branch_id THEN
    RAISE EXCEPTION 'branch_id is immutable on devices';
  END IF;
  IF NEW.created_by IS DISTINCT FROM OLD.created_by AND OLD.created_by IS NOT NULL THEN
    RAISE EXCEPTION 'created_by is immutable on devices';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_devices_immutability ON public.devices;
CREATE TRIGGER enforce_devices_immutability
  BEFORE UPDATE ON public.devices
  FOR EACH ROW EXECUTE FUNCTION public.enforce_devices_immutability();

-- ─── device_heartbeats — append-only heartbeat log ────────────

CREATE TABLE IF NOT EXISTS public.device_heartbeats (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID        NOT NULL,
  device_id   UUID        NOT NULL REFERENCES public.devices (id),
  client_ip   TEXT,
  user_agent  TEXT,
  metadata    JSONB       NOT NULL DEFAULT '{}',
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_device_heartbeats_device_id
  ON public.device_heartbeats (device_id, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_device_heartbeats_tenant_id
  ON public.device_heartbeats (tenant_id);

-- Heartbeats are immutable log entries
CREATE OR REPLACE FUNCTION public.enforce_device_heartbeats_immutability()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'device_heartbeats rows are immutable';
END;
$$;

DROP TRIGGER IF EXISTS enforce_device_heartbeats_immutability ON public.device_heartbeats;
CREATE TRIGGER enforce_device_heartbeats_immutability
  BEFORE UPDATE ON public.device_heartbeats
  FOR EACH ROW EXECUTE FUNCTION public.enforce_device_heartbeats_immutability();

-- ─── RLS ──────────────────────────────────────────────────────

ALTER TABLE public.devices            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.device_heartbeats  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "devices_tenant_isolation"              ON public.devices;
CREATE POLICY "devices_tenant_isolation" ON public.devices
  AS RESTRICTIVE FOR ALL USING (auth.jwt() ->> 'tenant_id' = tenant_id::text);
DROP POLICY IF EXISTS "devices_authenticated_access"          ON public.devices;
CREATE POLICY "devices_authenticated_access" ON public.devices
  AS PERMISSIVE FOR ALL USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "device_heartbeats_tenant_isolation"    ON public.device_heartbeats;
CREATE POLICY "device_heartbeats_tenant_isolation" ON public.device_heartbeats
  AS RESTRICTIVE FOR ALL USING (auth.jwt() ->> 'tenant_id' = tenant_id::text);
DROP POLICY IF EXISTS "device_heartbeats_authenticated_access" ON public.device_heartbeats;
CREATE POLICY "device_heartbeats_authenticated_access" ON public.device_heartbeats
  AS PERMISSIVE FOR ALL USING (auth.role() = 'authenticated');

COMMIT;
