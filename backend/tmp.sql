-- ============================================================
-- Migration: 20260528000003_menu_admin_write_policies
-- Allow tenant admins to directly write menu categories and items
-- via the authenticated client (anon key).
--
-- Background: menu_rls.sql intentionally blocked all authenticated
-- client writes with WITH CHECK (FALSE). That pattern assumed all
-- writes would flow through a backend service_role proxy.
--
-- For the admin Flutter app using the Supabase anon key directly,
-- we need to allow admin-role users to INSERT/UPDATE/DELETE their
-- own tenant's menu data.
-- ============================================================

-- ─── Helper: is current user a tenant admin? ──────────────────
-- Returns TRUE if the JWT's app_metadata.rbac_role is one of the
-- admin roles that should have write access to tenant menu data.
CREATE OR REPLACE FUNCTION public.is_tenant_menu_admin()
RETURNS BOOLEAN
LANGUAGE sql STABLE
AS $$
  SELECT (
    public.is_super_admin() OR
    (current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'rbac_role')
      IN ('TENANT_ADMIN', 'RESTAURANT_ADMIN', 'MANAGER', 'OWNER')
  );