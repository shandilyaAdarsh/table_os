-- ============================================================
-- Migration: 011_auth_functions
-- Table-dependent auth helpers moved from 003_utilities
-- to ensure proper dependency ordering.
-- ============================================================

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

-- Grouped logical permissions & grants
REVOKE ALL ON FUNCTION public.increment_failed_login_count(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_admin_profile_by_email(TEXT) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.increment_failed_login_count(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_admin_profile_by_email(TEXT) TO service_role;
