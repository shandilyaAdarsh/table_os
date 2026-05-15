-- ============================================================
-- Migration: 006_platform_users
-- Global identity & legacy admin_profiles
-- ============================================================

CREATE TABLE public.platform_users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  phone TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'deleted')),
  is_super_admin BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_platform_users_email ON public.platform_users(email);
CREATE INDEX idx_platform_users_status ON public.platform_users(status);

CREATE TRIGGER set_platform_users_updated_at 
  BEFORE UPDATE ON public.platform_users 
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Legacy admin_profiles (still used by backend)
CREATE TABLE public.admin_profiles (
  id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE RESTRICT,
  role public.admin_role NOT NULL,
  full_name TEXT NOT NULL,
  phone TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  is_locked BOOLEAN NOT NULL DEFAULT FALSE,
  locked_until TIMESTAMPTZ,
  lock_reason TEXT,
  last_login_at TIMESTAMPTZ,
  last_login_ip TEXT,
  must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
  failed_login_count INTEGER NOT NULL DEFAULT 0,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT chk_failed_login_count_non_negative CHECK (failed_login_count >= 0),
  CONSTRAINT chk_super_admin_no_tenant CHECK (role != 'SUPER_ADMIN' OR tenant_id IS NULL)
);

CREATE INDEX idx_admin_profiles_tenant_id ON public.admin_profiles (tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_admin_profiles_role ON public.admin_profiles (role) WHERE deleted_at IS NULL;

CREATE TRIGGER trg_admin_profiles_updated_at
  BEFORE UPDATE ON public.admin_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
