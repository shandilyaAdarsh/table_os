-- ============================================================
-- Migration: Sync rbac_role from admin_profiles into auth.users app_metadata
-- 
-- ROOT CAUSE FIX: The RLS helper function is_tenant_menu_admin() reads
-- app_metadata ->> 'rbac_role' from the JWT. This field was never being
-- populated in auth.users.raw_app_meta_data, causing ALL authenticated
-- writes to menu_categories (and other RLS-protected tables) to fail
-- with error 42501.
--
-- This migration backfills rbac_role for all existing admin users.
-- Going forward, auth.service.ts syncs rbac_role on every login.
-- ============================================================

UPDATE auth.users u
SET raw_app_meta_data = u.raw_app_meta_data || jsonb_build_object('rbac_role', ap.role::text)
FROM public.admin_profiles ap
WHERE u.id = ap.id
  AND ap.is_active = true;
