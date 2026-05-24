-- ============================================================
-- Migration: 20260519000002_qr_sessions.sql
-- Phase 5: QR Session Service — QR code assignment, signed session
-- tokens, anti-replay nonce tracking, session expiration.
-- ============================================================

BEGIN;

-- Drop placeholder table from Phase 2 before recreating with Phase 5 schema
DROP TABLE IF EXISTS public.qr_sessions CASCADE;

-- ─── SECTION 1: Enums ─────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE public.qr_session_status AS ENUM (
    'active',
    'expired',
    'completed',
    'invalidated'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── SECTION 2: qr_codes ──────────────────────────────────────
-- Static QR codes assigned to tables. One QR per table per branch.
-- Regenerating a QR code creates a new row and invalidates the prior.

CREATE TABLE IF NOT EXISTS public.qr_codes (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID        NOT NULL,
  branch_id       UUID        NOT NULL,
  table_id        UUID        NOT NULL REFERENCES public.tables (id),
  -- Human-readable code embedded in the QR URL slug
  code_slug       TEXT        NOT NULL,
  -- Signed HMAC payload for backend validation (base64url encoded)
  signed_payload  TEXT        NOT NULL,
  is_active       BOOLEAN     NOT NULL DEFAULT true,
  generated_by    UUID,
  generated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  invalidated_at  TIMESTAMPTZ,
  invalidated_by  UUID
);

-- Only one active QR per table
CREATE UNIQUE INDEX IF NOT EXISTS idx_qr_codes_table_active
  ON public.qr_codes (tenant_id, table_id)
  WHERE (is_active = true);

-- Unique slug per branch (for URL routing)
CREATE UNIQUE INDEX IF NOT EXISTS idx_qr_codes_slug_unique
  ON public.qr_codes (branch_id, code_slug);

CREATE INDEX IF NOT EXISTS idx_qr_codes_tenant_id
  ON public.qr_codes (tenant_id);

CREATE INDEX IF NOT EXISTS idx_qr_codes_branch_id
  ON public.qr_codes (branch_id);

-- QR codes are immutable after creation — only invalidated_at may be set
CREATE OR REPLACE FUNCTION public.enforce_qr_codes_immutability()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.tenant_id <> OLD.tenant_id THEN
    RAISE EXCEPTION 'tenant_id is immutable on qr_codes';
  END IF;
  IF NEW.branch_id <> OLD.branch_id THEN
    RAISE EXCEPTION 'branch_id is immutable on qr_codes';
  END IF;
  IF NEW.table_id <> OLD.table_id THEN
    RAISE EXCEPTION 'table_id is immutable on qr_codes';
  END IF;
  IF NEW.code_slug <> OLD.code_slug THEN
    RAISE EXCEPTION 'code_slug is immutable on qr_codes';
  END IF;
  IF NEW.signed_payload <> OLD.signed_payload THEN
    RAISE EXCEPTION 'signed_payload is immutable on qr_codes';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_qr_codes_immutability ON public.qr_codes;
CREATE TRIGGER enforce_qr_codes_immutability
  BEFORE UPDATE ON public.qr_codes
  FOR EACH ROW EXECUTE FUNCTION public.enforce_qr_codes_immutability();

-- ─── SECTION 3: qr_scan_nonces ────────────────────────────────
-- Anti-replay: each QR scan generates a nonce recorded here.
-- Re-submitting a used nonce is rejected at the application layer.

CREATE TABLE IF NOT EXISTS public.qr_scan_nonces (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID        NOT NULL,
  qr_code_id  UUID        NOT NULL REFERENCES public.qr_codes (id),
  nonce       TEXT        NOT NULL,
  used_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  client_ip   TEXT,
  user_agent  TEXT
);

-- Nonce must be globally unique to prevent replay
CREATE UNIQUE INDEX IF NOT EXISTS idx_qr_scan_nonces_nonce
  ON public.qr_scan_nonces (nonce);

CREATE INDEX IF NOT EXISTS idx_qr_scan_nonces_qr_code_id
  ON public.qr_scan_nonces (qr_code_id);

-- Nonces are immutable records
CREATE OR REPLACE FUNCTION public.enforce_qr_scan_nonces_immutability()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'qr_scan_nonces rows are immutable';
END;
$$;

DROP TRIGGER IF EXISTS enforce_qr_scan_nonces_immutability ON public.qr_scan_nonces;
CREATE TRIGGER enforce_qr_scan_nonces_immutability
  BEFORE UPDATE ON public.qr_scan_nonces
  FOR EACH ROW EXECUTE FUNCTION public.enforce_qr_scan_nonces_immutability();

-- ─── SECTION 4: qr_sessions ───────────────────────────────────
-- Active customer sessions created from a QR code scan.
-- One active session per (branch_id, table_id) at a time.

CREATE TABLE IF NOT EXISTS public.qr_sessions (
  id                  UUID                    PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID                    NOT NULL,
  branch_id           UUID                    NOT NULL,
  table_id            UUID                    NOT NULL REFERENCES public.tables (id),
  qr_code_id          UUID                    NOT NULL REFERENCES public.qr_codes (id),
  nonce_id            UUID                    NOT NULL REFERENCES public.qr_scan_nonces (id),
  -- Server-signed session token (JWT or HMAC, managed by QrSessionService)
  session_token       TEXT                    NOT NULL,
  status              public.qr_session_status NOT NULL DEFAULT 'active',
  -- Device fingerprint (browser fingerprint hash for binding)
  device_fingerprint  TEXT,
  client_ip           TEXT,
  user_agent          TEXT,
  -- Session TTL windows (set at creation, evaluated by service layer)
  activated_at        TIMESTAMPTZ             NOT NULL DEFAULT NOW(),
  last_activity_at    TIMESTAMPTZ             NOT NULL DEFAULT NOW(),
  expires_at          TIMESTAMPTZ             NOT NULL,
  completed_at        TIMESTAMPTZ,
  invalidated_at      TIMESTAMPTZ,
  invalidated_by      UUID,
  version_num         INTEGER                 NOT NULL DEFAULT 1,
  created_at          TIMESTAMPTZ             NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ             NOT NULL DEFAULT NOW()
);

-- One active session per table
CREATE UNIQUE INDEX IF NOT EXISTS idx_qr_sessions_table_active
  ON public.qr_sessions (tenant_id, table_id)
  WHERE (status = 'active');

CREATE INDEX IF NOT EXISTS idx_qr_sessions_tenant_id
  ON public.qr_sessions (tenant_id);

CREATE INDEX IF NOT EXISTS idx_qr_sessions_branch_id
  ON public.qr_sessions (branch_id);

CREATE INDEX IF NOT EXISTS idx_qr_sessions_token
  ON public.qr_sessions (session_token);

CREATE INDEX IF NOT EXISTS idx_qr_sessions_expires_at
  ON public.qr_sessions (expires_at)
  WHERE (status = 'active');

DROP TRIGGER IF EXISTS handle_qr_sessions_updated_at ON public.qr_sessions;
CREATE TRIGGER handle_qr_sessions_updated_at
  BEFORE UPDATE ON public.qr_sessions
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS increment_qr_sessions_version ON public.qr_sessions;
CREATE TRIGGER increment_qr_sessions_version
  BEFORE UPDATE ON public.qr_sessions
  FOR EACH ROW EXECUTE FUNCTION public.increment_version_num();

-- Immutability: core identity fields cannot change
CREATE OR REPLACE FUNCTION public.enforce_qr_sessions_immutability()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.tenant_id <> OLD.tenant_id THEN
    RAISE EXCEPTION 'tenant_id is immutable on qr_sessions';
  END IF;
  IF NEW.branch_id <> OLD.branch_id THEN
    RAISE EXCEPTION 'branch_id is immutable on qr_sessions';
  END IF;
  IF NEW.table_id <> OLD.table_id THEN
    RAISE EXCEPTION 'table_id is immutable on qr_sessions';
  END IF;
  IF NEW.qr_code_id <> OLD.qr_code_id THEN
    RAISE EXCEPTION 'qr_code_id is immutable on qr_sessions';
  END IF;
  IF NEW.session_token <> OLD.session_token THEN
    RAISE EXCEPTION 'session_token is immutable on qr_sessions';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_qr_sessions_immutability ON public.qr_sessions;
CREATE TRIGGER enforce_qr_sessions_immutability
  BEFORE UPDATE ON public.qr_sessions
  FOR EACH ROW EXECUTE FUNCTION public.enforce_qr_sessions_immutability();

-- ─── SECTION 5: Now add FK from tables → qr_codes ────────────
-- We do this here since qr_codes now exists.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tables_qr_code_id_fk'
      AND conrelid = 'public.tables'::regclass
  ) THEN
    ALTER TABLE public.tables
      ADD CONSTRAINT tables_qr_code_id_fk
      FOREIGN KEY (qr_code_id) REFERENCES public.qr_codes (id);
  END IF;
END $$;

-- ─── SECTION 6: RLS ───────────────────────────────────────────

ALTER TABLE public.qr_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qr_scan_nonces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qr_sessions ENABLE ROW LEVEL SECURITY;

-- qr_codes
DROP POLICY IF EXISTS "qr_codes_tenant_isolation" ON public.qr_codes;
CREATE POLICY "qr_codes_tenant_isolation" ON public.qr_codes
  AS RESTRICTIVE FOR ALL
  USING (auth.jwt() ->> 'tenant_id' = tenant_id::text);

DROP POLICY IF EXISTS "qr_codes_authenticated_access" ON public.qr_codes;
CREATE POLICY "qr_codes_authenticated_access" ON public.qr_codes
  AS PERMISSIVE FOR ALL
  USING (auth.role() = 'authenticated');

-- qr_scan_nonces
DROP POLICY IF EXISTS "qr_scan_nonces_tenant_isolation" ON public.qr_scan_nonces;
CREATE POLICY "qr_scan_nonces_tenant_isolation" ON public.qr_scan_nonces
  AS RESTRICTIVE FOR ALL
  USING (auth.jwt() ->> 'tenant_id' = tenant_id::text);

DROP POLICY IF EXISTS "qr_scan_nonces_authenticated_access" ON public.qr_scan_nonces;
CREATE POLICY "qr_scan_nonces_authenticated_access" ON public.qr_scan_nonces
  AS PERMISSIVE FOR ALL
  USING (auth.role() = 'authenticated');

-- qr_sessions
DROP POLICY IF EXISTS "qr_sessions_tenant_isolation" ON public.qr_sessions;
CREATE POLICY "qr_sessions_tenant_isolation" ON public.qr_sessions
  AS RESTRICTIVE FOR ALL
  USING (auth.jwt() ->> 'tenant_id' = tenant_id::text);

DROP POLICY IF EXISTS "qr_sessions_authenticated_access" ON public.qr_sessions;
CREATE POLICY "qr_sessions_authenticated_access" ON public.qr_sessions
  AS PERMISSIVE FOR ALL
  USING (auth.role() = 'authenticated');

COMMIT;
