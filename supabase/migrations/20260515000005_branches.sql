-- ============================================================
-- Migration: 005_branches
-- Branches within a tenant.
-- ============================================================

CREATE TABLE public.branches (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  timezone        TEXT NOT NULL DEFAULT 'UTC',
  status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'deleted')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ,
  
  -- Composite unique constraint required for composite FKs later
  CONSTRAINT branches_tenant_id_id_key UNIQUE (tenant_id, id)
);

CREATE INDEX idx_branches_tenant_id ON public.branches(tenant_id);
CREATE INDEX idx_branches_status ON public.branches(status);

CREATE TRIGGER set_branches_updated_at
  BEFORE UPDATE ON public.branches
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
