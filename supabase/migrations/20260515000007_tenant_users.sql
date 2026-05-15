-- ============================================================
-- Migration: 007_tenant_users
-- Tenant-scoped user access
-- ============================================================

CREATE TABLE public.tenant_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.platform_users(id) ON DELETE CASCADE,
  role public.admin_role NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  UNIQUE(tenant_id, user_id)
);

CREATE INDEX idx_tenant_users_tenant_id ON public.tenant_users(tenant_id);
CREATE INDEX idx_tenant_users_user_id ON public.tenant_users(user_id);

CREATE TRIGGER set_tenant_users_updated_at 
  BEFORE UPDATE ON public.tenant_users 
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
