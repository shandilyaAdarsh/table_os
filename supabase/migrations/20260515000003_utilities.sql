-- ============================================================
-- Migration: 003_utilities
-- Helper functions for timestamps, JWT parsing, and auth limits.
-- ============================================================

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.current_tenant_id()
RETURNS UUID
LANGUAGE sql STABLE
AS $$
  SELECT NULLIF(current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'tenant_id', '')::UUID;
$$;

CREATE OR REPLACE FUNCTION public.current_user_id()
RETURNS UUID
LANGUAGE sql STABLE
AS $$
  SELECT NULLIF(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::UUID;
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN
LANGUAGE sql STABLE
AS $$
  SELECT (current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'rbac_role') = 'SUPER_ADMIN';
$$;

CREATE OR REPLACE FUNCTION public.current_branch_ids()
RETURNS UUID[]
LANGUAGE sql STABLE
AS $$
  SELECT ARRAY(
    SELECT elem::UUID
    FROM jsonb_array_elements_text(
      COALESCE(
        (current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' -> 'branch_ids'),
        '[]'::jsonb
      )
    ) AS elem
  );
$$;

-- Auth RPCs
CREATE OR REPLACE FUNCTION public.increment_failed_login_count(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_count INTEGER;
BEGIN
  UPDATE public.admin_profiles
  SET failed_login_count = failed_login_count + 1,
      updated_at = NOW()
  WHERE id = p_user_id
  RETURNING failed_login_count INTO v_new_count;
  
  RETURN v_new_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_admin_profile_by_email(p_email TEXT)
RETURNS SETOF public.admin_profiles
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT p.*
  FROM public.admin_profiles p
  JOIN auth.users u ON p.id = u.id
  WHERE LOWER(u.email) = p_email
    AND p.deleted_at IS NULL;
$$;

REVOKE ALL ON FUNCTION public.increment_failed_login_count(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_admin_profile_by_email(TEXT) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.increment_failed_login_count(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_admin_profile_by_email(TEXT) TO service_role;
