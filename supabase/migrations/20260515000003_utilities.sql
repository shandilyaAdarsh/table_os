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
