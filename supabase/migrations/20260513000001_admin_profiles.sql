-- ============================================================
-- Migration: 001_admin_profiles
-- Table: admin_profiles
-- Owns role + permissions for all admin users.
-- Linked 1:1 to auth.users by id.
-- SUPER_ADMIN has tenant_id = NULL.
-- ============================================================

-- ─── Role enum ───────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE public.admin_role AS ENUM (
    'SUPER_ADMIN',
    'RESTAURANT_ADMIN',
    'MANAGER',
    'STAFF'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ─── Table ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.admin_profiles (
  -- Identity — mirrors auth.users.id exactly
  id                    UUID          NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Tenant scoping — NULL for SUPER_ADMIN
  -- FK to tenants added later when tenants table exists
  tenant_id             UUID,

  -- Role & status
  role                  public.admin_role NOT NULL,
  full_name             TEXT          NOT NULL,
  phone                 TEXT,

  is_active             BOOLEAN       NOT NULL DEFAULT TRUE,
  is_locked             BOOLEAN       NOT NULL DEFAULT FALSE,
  locked_until          TIMESTAMPTZ,
  lock_reason           TEXT,

  -- Login tracking
  last_login_at         TIMESTAMPTZ,
  last_login_ip         TEXT,
  must_change_password  BOOLEAN       NOT NULL DEFAULT FALSE,
  failed_login_count    INTEGER       NOT NULL DEFAULT 0,

  -- Audit
  created_by            UUID          REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  -- Soft delete
  deleted_at            TIMESTAMPTZ,

  -- Constraints
  CONSTRAINT chk_failed_login_count_non_negative CHECK (failed_login_count >= 0),
  CONSTRAINT chk_super_admin_no_tenant CHECK (
    role != 'SUPER_ADMIN' OR tenant_id IS NULL
  )
);

-- ─── Indexes ─────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_admin_profiles_tenant_id
  ON public.admin_profiles (tenant_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_admin_profiles_role
  ON public.admin_profiles (role)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_admin_profiles_is_active
  ON public.admin_profiles (is_active)
  WHERE is_active = TRUE AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_admin_profiles_is_locked
  ON public.admin_profiles (is_locked)
  WHERE is_locked = TRUE AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_admin_profiles_deleted_at
  ON public.admin_profiles (deleted_at)
  WHERE deleted_at IS NULL;

-- ─── updated_at trigger ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_admin_profiles_updated_at ON public.admin_profiles;
CREATE TRIGGER trg_admin_profiles_updated_at
  BEFORE UPDATE ON public.admin_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ─── RLS ─────────────────────────────────────────────────────
ALTER TABLE public.admin_profiles ENABLE ROW LEVEL SECURITY;

-- Backend uses service_role — bypasses RLS entirely.
-- These policies protect direct client-side access.
CREATE POLICY "admin_profiles_select_own"
  ON public.admin_profiles
  FOR SELECT
  USING (auth.uid() = id);

-- Only service role can insert/update/delete (backend-controlled)
-- No client-side write policies intentionally.

COMMENT ON TABLE public.admin_profiles IS
  'Admin user profiles. Linked 1:1 to auth.users. '
  'SUPER_ADMIN has tenant_id = NULL. '
  'Backend (service_role) owns all writes — RLS blocks direct client writes.';
