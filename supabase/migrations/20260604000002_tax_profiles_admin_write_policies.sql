-- ================================================================
-- HOTFIX: Tax Profiles RLS
-- Run this in Supabase SQL Editor → New Query → Run All
-- ================================================================

-- 1. Create the admin role checker if it doesn't exist
CREATE OR REPLACE FUNCTION public.is_tenant_menu_admin()
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT (
    public.is_super_admin() OR
    (current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'rbac_role')
      IN ('TENANT_ADMIN', 'RESTAURANT_ADMIN', 'MANAGER', 'OWNER')
  );
$$;
GRANT EXECUTE ON FUNCTION public.is_tenant_menu_admin() TO authenticated;


-- 2. Fix tax_profiles: drop old restrictive policies, recreate with COALESCE fallback
DROP POLICY IF EXISTS "tenant_isolation_tax_profiles_select" ON public.tax_profiles;
DROP POLICY IF EXISTS "tenant_isolation_tax_profiles_insert" ON public.tax_profiles;
DROP POLICY IF EXISTS "tenant_isolation_tax_profiles_update" ON public.tax_profiles;
DROP POLICY IF EXISTS "tenant_isolation_tax_profiles_delete" ON public.tax_profiles;

CREATE POLICY "tenant_isolation_tax_profiles_select" ON public.tax_profiles AS RESTRICTIVE FOR SELECT TO authenticated
  USING (tenant_id = COALESCE(nullif(current_setting('app.current_tenant_id', true), '')::uuid, public.current_tenant_id()));
CREATE POLICY "tenant_isolation_tax_profiles_insert" ON public.tax_profiles AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (tenant_id = COALESCE(nullif(current_setting('app.current_tenant_id', true), '')::uuid, public.current_tenant_id()));
CREATE POLICY "tenant_isolation_tax_profiles_update" ON public.tax_profiles AS RESTRICTIVE FOR UPDATE TO authenticated
  USING  (tenant_id = COALESCE(nullif(current_setting('app.current_tenant_id', true), '')::uuid, public.current_tenant_id()))
  WITH CHECK (tenant_id = COALESCE(nullif(current_setting('app.current_tenant_id', true), '')::uuid, public.current_tenant_id()));
CREATE POLICY "tenant_isolation_tax_profiles_delete" ON public.tax_profiles AS RESTRICTIVE FOR DELETE TO authenticated
  USING (tenant_id = COALESCE(nullif(current_setting('app.current_tenant_id', true), '')::uuid, public.current_tenant_id()));

-- 3. Fix tax_rates: drop old restrictive policies, recreate with COALESCE fallback
DROP POLICY IF EXISTS "tenant_isolation_tax_rates_select" ON public.tax_rates;
DROP POLICY IF EXISTS "tenant_isolation_tax_rates_insert" ON public.tax_rates;
DROP POLICY IF EXISTS "tenant_isolation_tax_rates_update" ON public.tax_rates;
DROP POLICY IF EXISTS "tenant_isolation_tax_rates_delete" ON public.tax_rates;

CREATE POLICY "tenant_isolation_tax_rates_select" ON public.tax_rates AS RESTRICTIVE FOR SELECT TO authenticated
  USING (tenant_id = COALESCE(nullif(current_setting('app.current_tenant_id', true), '')::uuid, public.current_tenant_id()));
CREATE POLICY "tenant_isolation_tax_rates_insert" ON public.tax_rates AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (tenant_id = COALESCE(nullif(current_setting('app.current_tenant_id', true), '')::uuid, public.current_tenant_id()));
CREATE POLICY "tenant_isolation_tax_rates_update" ON public.tax_rates AS RESTRICTIVE FOR UPDATE TO authenticated
  USING  (tenant_id = COALESCE(nullif(current_setting('app.current_tenant_id', true), '')::uuid, public.current_tenant_id()))
  WITH CHECK (tenant_id = COALESCE(nullif(current_setting('app.current_tenant_id', true), '')::uuid, public.current_tenant_id()));
CREATE POLICY "tenant_isolation_tax_rates_delete" ON public.tax_rates AS RESTRICTIVE FOR DELETE TO authenticated
  USING (tenant_id = COALESCE(nullif(current_setting('app.current_tenant_id', true), '')::uuid, public.current_tenant_id()));

-- 4. Fix menu_item_tax_profiles: same treatment
DROP POLICY IF EXISTS "tenant_isolation_mitp_select" ON public.menu_item_tax_profiles;
DROP POLICY IF EXISTS "tenant_isolation_mitp_insert" ON public.menu_item_tax_profiles;
DROP POLICY IF EXISTS "tenant_isolation_mitp_update" ON public.menu_item_tax_profiles;
DROP POLICY IF EXISTS "tenant_isolation_mitp_delete" ON public.menu_item_tax_profiles;

CREATE POLICY "tenant_isolation_mitp_select" ON public.menu_item_tax_profiles AS RESTRICTIVE FOR SELECT TO authenticated
  USING (tenant_id = COALESCE(nullif(current_setting('app.current_tenant_id', true), '')::uuid, public.current_tenant_id()));
CREATE POLICY "tenant_isolation_mitp_insert" ON public.menu_item_tax_profiles AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (tenant_id = COALESCE(nullif(current_setting('app.current_tenant_id', true), '')::uuid, public.current_tenant_id()));
CREATE POLICY "tenant_isolation_mitp_update" ON public.menu_item_tax_profiles AS RESTRICTIVE FOR UPDATE TO authenticated
  USING  (tenant_id = COALESCE(nullif(current_setting('app.current_tenant_id', true), '')::uuid, public.current_tenant_id()))
  WITH CHECK (tenant_id = COALESCE(nullif(current_setting('app.current_tenant_id', true), '')::uuid, public.current_tenant_id()));
CREATE POLICY "tenant_isolation_mitp_delete" ON public.menu_item_tax_profiles AS RESTRICTIVE FOR DELETE TO authenticated
  USING (tenant_id = COALESCE(nullif(current_setting('app.current_tenant_id', true), '')::uuid, public.current_tenant_id()));

-- 5. Add permissive WRITE policies so admin role can actually insert/update/delete
DROP POLICY IF EXISTS "tax_profiles_admin_insert"          ON public.tax_profiles;
DROP POLICY IF EXISTS "tax_profiles_admin_update"          ON public.tax_profiles;
DROP POLICY IF EXISTS "tax_profiles_admin_delete"          ON public.tax_profiles;
DROP POLICY IF EXISTS "tax_profiles_authenticated_select"  ON public.tax_profiles;
DROP POLICY IF EXISTS "tax_rates_admin_insert"             ON public.tax_rates;
DROP POLICY IF EXISTS "tax_rates_admin_update"             ON public.tax_rates;
DROP POLICY IF EXISTS "tax_rates_admin_delete"             ON public.tax_rates;
DROP POLICY IF EXISTS "tax_rates_authenticated_select"     ON public.tax_rates;
DROP POLICY IF EXISTS "mitp_admin_insert"                  ON public.menu_item_tax_profiles;
DROP POLICY IF EXISTS "mitp_admin_update"                  ON public.menu_item_tax_profiles;
DROP POLICY IF EXISTS "mitp_admin_delete"                  ON public.menu_item_tax_profiles;
DROP POLICY IF EXISTS "mitp_authenticated_select"          ON public.menu_item_tax_profiles;

-- tax_profiles permissive
CREATE POLICY "tax_profiles_admin_insert"         ON public.tax_profiles AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (public.is_tenant_menu_admin());
CREATE POLICY "tax_profiles_admin_update"         ON public.tax_profiles AS PERMISSIVE FOR UPDATE TO authenticated USING (public.is_tenant_menu_admin()) WITH CHECK (public.is_tenant_menu_admin());
CREATE POLICY "tax_profiles_admin_delete"         ON public.tax_profiles AS PERMISSIVE FOR DELETE TO authenticated USING (public.is_tenant_menu_admin());
CREATE POLICY "tax_profiles_authenticated_select" ON public.tax_profiles AS PERMISSIVE FOR SELECT TO authenticated USING (true);

-- tax_rates permissive
CREATE POLICY "tax_rates_admin_insert"            ON public.tax_rates AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (public.is_tenant_menu_admin());
CREATE POLICY "tax_rates_admin_update"            ON public.tax_rates AS PERMISSIVE FOR UPDATE TO authenticated USING (public.is_tenant_menu_admin()) WITH CHECK (public.is_tenant_menu_admin());
CREATE POLICY "tax_rates_admin_delete"            ON public.tax_rates AS PERMISSIVE FOR DELETE TO authenticated USING (public.is_tenant_menu_admin());
CREATE POLICY "tax_rates_authenticated_select"    ON public.tax_rates AS PERMISSIVE FOR SELECT TO authenticated USING (true);

-- menu_item_tax_profiles permissive
CREATE POLICY "mitp_admin_insert"                 ON public.menu_item_tax_profiles AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (public.is_tenant_menu_admin());
CREATE POLICY "mitp_admin_update"                 ON public.menu_item_tax_profiles AS PERMISSIVE FOR UPDATE TO authenticated USING (public.is_tenant_menu_admin()) WITH CHECK (public.is_tenant_menu_admin());
CREATE POLICY "mitp_admin_delete"                 ON public.menu_item_tax_profiles AS PERMISSIVE FOR DELETE TO authenticated USING (public.is_tenant_menu_admin());
CREATE POLICY "mitp_authenticated_select"         ON public.menu_item_tax_profiles AS PERMISSIVE FOR SELECT TO authenticated USING (true);
