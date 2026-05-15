-- ============================================================
-- Migration: 010_tenant_hardening
-- Applies composite foreign keys and linking tables to strictly enforce isolation.
-- ============================================================

-- ─── 1. Tenant User Branches ──────────────────────────────────
CREATE TABLE public.tenant_user_branches (
  tenant_id UUID NOT NULL,
  user_id UUID NOT NULL,
  branch_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  PRIMARY KEY (tenant_id, user_id, branch_id),
  CONSTRAINT fk_tenant_user_branches_user 
    FOREIGN KEY (tenant_id, user_id) REFERENCES public.tenant_users(tenant_id, user_id) ON DELETE CASCADE,
  CONSTRAINT fk_tenant_user_branches_branch
    FOREIGN KEY (tenant_id, branch_id) REFERENCES public.branches(tenant_id, id) ON DELETE CASCADE
);

ALTER TABLE public.tenant_user_branches ENABLE ROW LEVEL SECURITY;
CREATE POLICY tub_isolation_policy ON public.tenant_user_branches
  FOR ALL TO authenticated
  USING (
    public.is_super_admin() OR 
    tenant_id = public.current_tenant_id()
  );

CREATE INDEX idx_tub_user_tenant ON public.tenant_user_branches(user_id, tenant_id);

-- ─── 2. Composite FKs for Entities ─────────────────────────────
-- By using composite FKs on (tenant_id, branch_id), we ensure at the DB schema
-- level that a branch assigned to an entity actually belongs to the same tenant.

ALTER TABLE public.staff 
  ADD CONSTRAINT fk_staff_tenant_branch 
  FOREIGN KEY (tenant_id, branch_id) REFERENCES public.branches(tenant_id, id) ON DELETE CASCADE;

ALTER TABLE public.devices 
  ADD CONSTRAINT fk_devices_tenant_branch 
  FOREIGN KEY (tenant_id, branch_id) REFERENCES public.branches(tenant_id, id) ON DELETE CASCADE;

ALTER TABLE public.qr_sessions 
  ADD CONSTRAINT fk_qr_sessions_tenant_branch 
  FOREIGN KEY (tenant_id, branch_id) REFERENCES public.branches(tenant_id, id) ON DELETE CASCADE;

-- ─── 3. Indexes ────────────────────────────────────────────────
CREATE INDEX idx_staff_tenant_branch ON public.staff(tenant_id, branch_id);
CREATE INDEX idx_devices_tenant_branch ON public.devices(tenant_id, branch_id);
CREATE INDEX idx_qr_sessions_tenant_branch ON public.qr_sessions(tenant_id, branch_id);
