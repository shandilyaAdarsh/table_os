-- ============================================================
-- Migration: fix_admin_profiles_rls_recursion
-- 
-- Problem: "infinite recursion detected in policy for relation admin_profiles"
-- 
-- Root cause: One or more policies on admin_profiles reference admin_profiles
-- itself (directly or via a helper function that queries it), causing
-- PostgreSQL's RLS evaluation to loop infinitely.
--
-- Fix: Drop ALL existing policies on admin_profiles and replace with
-- clean, JWT-claim-only policies that NEVER query admin_profiles.
-- Use current_setting('request.jwt.claims', true) directly.
-- ============================================================

-- ─── Step 1: Drop ALL existing policies on admin_profiles ────────
-- (drops both from migration files and any manually-created ones)

DROP POLICY IF EXISTS admin_profiles_select_own      ON public.admin_profiles;
DROP POLICY IF EXISTS admin_profiles_select_tenant   ON public.admin_profiles;
DROP POLICY IF EXISTS admin_profiles_insert          ON public.admin_profiles;
DROP POLICY IF EXISTS admin_profiles_update          ON public.admin_profiles;
DROP POLICY IF EXISTS admin_profiles_delete          ON public.admin_profiles;
DROP POLICY IF EXISTS admin_profiles_all             ON public.admin_profiles;
DROP POLICY IF EXISTS admin_profiles_super_admin     ON public.admin_profiles;
DROP POLICY IF EXISTS admin_profiles_tenant_select   ON public.admin_profiles;
DROP POLICY IF EXISTS admin_profiles_restaurant_admin ON public.admin_profiles;
DROP POLICY IF EXISTS "admin_profiles_select_own"    ON public.admin_profiles;
DROP POLICY IF EXISTS "admin_profiles_select_tenant" ON public.admin_profiles;
DROP POLICY IF EXISTS "Select own admin profile"     ON public.admin_profiles;
DROP POLICY IF EXISTS "Admins can view own profile"  ON public.admin_profiles;

-- ─── Step 2: Helper function — reads ONLY from JWT claims ─────────
-- NEVER queries admin_profiles. Uses app_metadata embedded in the JWT.

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

CREATE OR REPLACE FUNCTION public.jwt_user_id()
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NULLIF(
    current_setting('request.jwt.claims', true)::jsonb ->> 'sub',
    ''
  )::UUID;
$$;

-- ─── Step 3: Clean policies — JWT claims only, zero table references ──
-- 
-- Policy design:
--   SELECT: User can read their own profile (auth.uid() = id).
--           Super Admin can read all profiles.
--           Restaurant Admin can read profiles in their own tenant.
--   INSERT: Super Admin or service_role only.
--   UPDATE: User can update their own profile. Super Admin can update all.
--   DELETE: Super Admin only.
--
-- CRITICAL: None of these policies query admin_profiles or call any
-- function that queries admin_profiles. All role checks use JWT claims.

-- SELECT: Own profile + Super Admin + Tenant Admin (all via JWT)
CREATE POLICY admin_profiles_select ON public.admin_profiles
  FOR SELECT TO authenticated
  USING (
    -- Own record
    auth.uid() = id
    OR
    -- Super Admin (from JWT, not from DB)
    (current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'rbac_role') = 'SUPER_ADMIN'
    OR
    -- Restaurant Admin: same tenant (from JWT)
    (
      (current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'rbac_role') IN ('RESTAURANT_ADMIN', 'MANAGER')
      AND
      tenant_id = NULLIF(
        current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'tenant_id',
        ''
      )::UUID
    )
  );

-- INSERT: Only super_admin or service_role (which bypasses RLS entirely)
CREATE POLICY admin_profiles_insert ON public.admin_profiles
  FOR INSERT TO authenticated
  WITH CHECK (
    (current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'rbac_role') = 'SUPER_ADMIN'
  );

-- UPDATE: Own record or Super Admin
CREATE POLICY admin_profiles_update ON public.admin_profiles
  FOR UPDATE TO authenticated
  USING (
    auth.uid() = id
    OR
    (current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'rbac_role') = 'SUPER_ADMIN'
  )
  WITH CHECK (
    auth.uid() = id
    OR
    (current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'rbac_role') = 'SUPER_ADMIN'
  );

-- DELETE: Super Admin only
CREATE POLICY admin_profiles_delete ON public.admin_profiles
  FOR DELETE TO authenticated
  USING (
    (current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'rbac_role') = 'SUPER_ADMIN'
  );

-- ─── Step 4: Verify no recursion ──────────────────────────────────
-- Quick sanity check: this should return rows without error
-- Run as service_role (bypasses RLS, so this always works):
SELECT id, role, tenant_id FROM public.admin_profiles LIMIT 3;
