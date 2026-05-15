-- ============================================================
-- Migration: 009_rls
-- Enable RLS on all tables and create policies.
-- ============================================================

-- Enable RLS
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.device_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auth_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auth_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qr_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.domain_events ENABLE ROW LEVEL SECURITY;

-- ─── Tenants ─────────────────────────────────────────────────
CREATE POLICY tenant_isolation_policy ON public.tenants
  FOR ALL TO authenticated
  USING (public.is_super_admin() OR id = public.current_tenant_id());

-- ─── Branches ────────────────────────────────────────────────
CREATE POLICY branch_isolation_policy ON public.branches
  FOR ALL TO authenticated
  USING (
    public.is_super_admin() OR 
    (
      tenant_id = public.current_tenant_id() AND
      (
        EXISTS (
          SELECT 1 FROM public.tenant_users 
          WHERE tenant_id = public.current_tenant_id() 
          AND user_id = public.current_user_id()
          AND role IN ('RESTAURANT_ADMIN', 'MANAGER')
        ) OR
        id = ANY(public.current_branch_ids())
      )
    )
  );

-- ─── Admin Profiles ──────────────────────────────────────────
CREATE POLICY admin_profiles_select_own ON public.admin_profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = id);

-- ─── Staff ───────────────────────────────────────────────────
CREATE POLICY staff_isolation_policy ON public.staff
  FOR ALL TO authenticated
  USING (
    public.is_super_admin() OR 
    (
      tenant_id = public.current_tenant_id() AND
      (branch_id = ANY(public.current_branch_ids()) OR public.current_branch_ids() IS NULL)
    )
  );

-- ─── Devices ─────────────────────────────────────────────────
CREATE POLICY device_isolation_policy ON public.devices
  FOR ALL TO authenticated
  USING (
    public.is_super_admin() OR 
    (
      tenant_id = public.current_tenant_id() AND
      branch_id = ANY(public.current_branch_ids())
    )
  );

-- ─── Backend Only (service_role) ─────────────────────────────
CREATE POLICY "service_role_only_audit_logs" ON public.auth_audit_logs FOR ALL USING (FALSE);
CREATE POLICY "service_role_only_rate_limits" ON public.auth_rate_limits FOR ALL USING (FALSE);
-- device_sessions has no policy, clients never query it directly
