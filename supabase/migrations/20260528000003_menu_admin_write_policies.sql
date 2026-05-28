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
$$;

-- ─── menu_categories: allow admin writes ─────────────────────

-- Remove the blanket denial for authenticated inserts if it exists
-- (menu_rls.sql did not add one for menu_categories INSERT, so we
-- just need to add permissive write policies)

CREATE POLICY menu_categories_admin_insert ON public.menu_categories
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_tenant_menu_admin() AND
    tenant_id = public.current_tenant_id()
  );

CREATE POLICY menu_categories_admin_update ON public.menu_categories
  FOR UPDATE TO authenticated
  USING (
    public.is_tenant_menu_admin() AND
    tenant_id = public.current_tenant_id()
  )
  WITH CHECK (
    public.is_tenant_menu_admin() AND
    tenant_id = public.current_tenant_id()
  );

CREATE POLICY menu_categories_admin_delete ON public.menu_categories
  FOR DELETE TO authenticated
  USING (
    public.is_tenant_menu_admin() AND
    tenant_id = public.current_tenant_id()
  );

-- ─── menu_items: drop blanket denial, allow admin writes ──────

-- The existing menu_rls.sql added:
--   menu_items_no_write  FOR INSERT WITH CHECK (FALSE)
--   menu_items_no_update FOR UPDATE USING (FALSE)
-- We drop those and replace with scoped admin policies.

DROP POLICY IF EXISTS menu_items_no_write  ON public.menu_items;
DROP POLICY IF EXISTS menu_items_no_update ON public.menu_items;

CREATE POLICY menu_items_admin_insert ON public.menu_items
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_tenant_menu_admin() AND
    tenant_id = public.current_tenant_id()
  );

CREATE POLICY menu_items_admin_update ON public.menu_items
  FOR UPDATE TO authenticated
  USING (
    public.is_tenant_menu_admin() AND
    tenant_id = public.current_tenant_id()
  )
  WITH CHECK (
    public.is_tenant_menu_admin() AND
    tenant_id = public.current_tenant_id()
  );

CREATE POLICY menu_items_admin_delete ON public.menu_items
  FOR DELETE TO authenticated
  USING (
    public.is_tenant_menu_admin() AND
    tenant_id = public.current_tenant_id()
  );

-- Grant execute on helper to authenticated role
GRANT EXECUTE ON FUNCTION public.is_tenant_menu_admin() TO authenticated;
