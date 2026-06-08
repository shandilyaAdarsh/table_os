-- ============================================================
-- Migration: fix_login_success_rls
--
-- Problem: POST /api/v1/auth/login returns 500
--   "infinite recursion detected in policy for relation admin_profiles"
--   triggered by direct UPDATE on admin_profiles from supabaseAdmin client.
--
-- Root cause: Even with the service_role key, PostgREST evaluates
--   RLS policy expressions before the bypass takes effect when the
--   UPDATE includes a RETURNING clause or when policies reference
--   admin_profiles recursively during expression evaluation.
--
-- Fix: Replace the direct .update() call with a SECURITY DEFINER
--   function. Functions marked SECURITY DEFINER run as the function
--   OWNER (postgres superuser), which is completely outside the RLS
--   evaluation stack — no recursion possible.
--
-- This mirrors the existing pattern for:
--   - increment_failed_login_count  (SECURITY DEFINER)
--   - get_admin_profile_by_email    (SECURITY DEFINER)
-- ============================================================

-- ─── Step 1: Drop ALL recursive RLS policies on admin_profiles ─
-- Belt-and-suspenders: drop everything that could reference admin_profiles
-- from within a policy expression on admin_profiles.

DROP POLICY IF EXISTS admin_profiles_select_own        ON public.admin_profiles;
DROP POLICY IF EXISTS admin_profiles_select_tenant     ON public.admin_profiles;
DROP POLICY IF EXISTS admin_profiles_insert            ON public.admin_profiles;
DROP POLICY IF EXISTS admin_profiles_update            ON public.admin_profiles;
DROP POLICY IF EXISTS admin_profiles_delete            ON public.admin_profiles;
DROP POLICY IF EXISTS admin_profiles_all               ON public.admin_profiles;
DROP POLICY IF EXISTS admin_profiles_super_admin       ON public.admin_profiles;
DROP POLICY IF EXISTS admin_profiles_tenant_select     ON public.admin_profiles;
DROP POLICY IF EXISTS admin_profiles_restaurant_admin  ON public.admin_profiles;
DROP POLICY IF EXISTS admin_profiles_select            ON public.admin_profiles;
DROP POLICY IF EXISTS "admin_profiles_select_own"      ON public.admin_profiles;
DROP POLICY IF EXISTS "admin_profiles_select_tenant"   ON public.admin_profiles;
DROP POLICY IF EXISTS "Select own admin profile"       ON public.admin_profiles;
DROP POLICY IF EXISTS "Admins can view own profile"    ON public.admin_profiles;

-- ─── Step 2: JWT-only helper functions (no table queries) ─────
-- These read ONLY from the JWT claims embedded in the current request.
-- They NEVER query any table → zero recursion risk.

CREATE OR REPLACE FUNCTION public.jwt_tenant_id()
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NULLIF(
    current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'tenant_id',
    ''
  )::UUID;
$$;

CREATE OR REPLACE FUNCTION public.jwt_role()
RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'rbac_role',
    current_setting('request.jwt.claims', true)::jsonb ->> 'role',
    ''
  );
$$;

-- ─── Step 3: Clean admin_profiles RLS policies (JWT-only) ─────
-- None of these expressions query admin_profiles. All role checks
-- use JWT claims via current_setting() — zero recursion possible.

-- SELECT: own row OR super admin OR same-tenant admin/manager
CREATE POLICY admin_profiles_select ON public.admin_profiles
  FOR SELECT TO authenticated
  USING (
    auth.uid() = id
    OR (current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'rbac_role') = 'SUPER_ADMIN'
    OR (
      (current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'rbac_role') IN ('RESTAURANT_ADMIN', 'MANAGER')
      AND tenant_id = NULLIF(current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'tenant_id', '')::UUID
    )
  );

-- INSERT: super admin only (service_role bypasses RLS entirely)
CREATE POLICY admin_profiles_insert ON public.admin_profiles
  FOR INSERT TO authenticated
  WITH CHECK (
    (current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'rbac_role') = 'SUPER_ADMIN'
  );

-- UPDATE: own row OR super admin
CREATE POLICY admin_profiles_update ON public.admin_profiles
  FOR UPDATE TO authenticated
  USING (
    auth.uid() = id
    OR (current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'rbac_role') = 'SUPER_ADMIN'
  )
  WITH CHECK (
    auth.uid() = id
    OR (current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'rbac_role') = 'SUPER_ADMIN'
  );

-- DELETE: super admin only
CREATE POLICY admin_profiles_delete ON public.admin_profiles
  FOR DELETE TO authenticated
  USING (
    (current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'rbac_role') = 'SUPER_ADMIN'
  );

-- ─── Step 4: SECURITY DEFINER RPC for updateLoginSuccess ──────
-- This runs as the function OWNER (postgres), completely outside
-- the RLS evaluation stack. No policies on admin_profiles are
-- evaluated when this function executes its UPDATE.

CREATE OR REPLACE FUNCTION public.update_login_success(
  p_user_id   UUID,
  p_ip_address TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.admin_profiles
  SET
    last_login_at      = NOW(),
    last_login_ip      = p_ip_address::inet,
    failed_login_count = 0,
    is_locked          = FALSE,
    locked_until       = NULL,
    lock_reason        = NULL,
    updated_at         = NOW()
  WHERE id = p_user_id;
END;
$$;

-- Restrict execution to service_role only (backend server)
REVOKE ALL ON FUNCTION public.update_login_success(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_login_success(UUID, TEXT) TO service_role;

-- ─── Step 5: Verify (run as service_role — bypasses RLS) ──────
-- This SELECT should succeed without recursion error.
SELECT id, role, tenant_id FROM public.admin_profiles LIMIT 3;
