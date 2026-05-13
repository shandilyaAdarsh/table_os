-- ============================================================
-- Migration: 005_auth_rpcs
-- Required RPC functions called by auth.repository.ts
-- ============================================================

-- ─── get_admin_profile_by_email ───────────────────────────────
-- Joins auth.users (not directly queryable) with admin_profiles.
-- Called by: auth.repository.findAdminProfileByEmail()
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_admin_profile_by_email(p_email TEXT)
RETURNS SETOF public.admin_profiles
LANGUAGE plpgsql
SECURITY DEFINER   -- Runs as function owner, allowing auth schema access
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
    SELECT ap.*
    FROM public.admin_profiles ap
    INNER JOIN auth.users au ON au.id = ap.id
    WHERE LOWER(TRIM(au.email)) = LOWER(TRIM(p_email))
      AND ap.deleted_at IS NULL
    LIMIT 1;
END;
$$;

-- Revoke from public, grant only to service_role
REVOKE ALL ON FUNCTION public.get_admin_profile_by_email(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_admin_profile_by_email(TEXT) TO service_role;

COMMENT ON FUNCTION public.get_admin_profile_by_email IS
  'Looks up admin_profiles by email via auth.users join. '
  'SECURITY DEFINER required to access auth schema. '
  'Called by backend service_role only — never directly by clients.';

-- ─── increment_failed_login_count ────────────────────────────
-- Atomically increments failed_login_count, returns new value.
-- Called by: auth.repository.incrementFailedLoginCount()
-- ──────────────────────────────────────────────────────────────
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
  SET
    failed_login_count = failed_login_count + 1,
    updated_at         = NOW()
  WHERE id = p_user_id
    AND deleted_at IS NULL
  RETURNING failed_login_count INTO v_new_count;

  -- Return 0 if user not found (safe default)
  RETURN COALESCE(v_new_count, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.increment_failed_login_count(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_failed_login_count(UUID) TO service_role;

COMMENT ON FUNCTION public.increment_failed_login_count IS
  'Atomically increments admin_profiles.failed_login_count. '
  'Returns the new count. Called only on failed login attempts.';
