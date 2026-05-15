-- ============================================================
-- Migration: 008_operational_entities
-- Rest of the database schema (auth infrastructure, rbac, app entities)
-- ============================================================

-- Device Sessions
CREATE TABLE public.device_sessions (
  id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id UUID,
  supabase_session_id TEXT,
  device_fingerprint TEXT NOT NULL,
  user_agent TEXT,
  ip_address TEXT,
  country_code CHAR(2),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_token_hash TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  revoke_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_device_sessions_user_id ON public.device_sessions(user_id) WHERE is_active = TRUE;
CREATE TRIGGER trg_device_sessions_updated_at BEFORE UPDATE ON public.device_sessions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Auth Audit Logs
CREATE TABLE public.auth_audit_logs (
  id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  tenant_id UUID,
  device_session_id UUID,
  event_type public.auth_event_type NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  device_fingerprint TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  failure_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE OR REPLACE RULE no_update_auth_audit_logs AS ON UPDATE TO public.auth_audit_logs DO INSTEAD NOTHING;
CREATE OR REPLACE RULE no_delete_auth_audit_logs AS ON DELETE TO public.auth_audit_logs DO INSTEAD NOTHING;

-- Auth Rate Limits
CREATE TABLE public.auth_rate_limits (
  key TEXT NOT NULL PRIMARY KEY,
  window_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  attempt_count INTEGER NOT NULL DEFAULT 1,
  blocked_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_attempt_count_positive CHECK (attempt_count > 0)
);
CREATE TRIGGER trg_auth_rate_limits_updated_at BEFORE UPDATE ON public.auth_rate_limits FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RBAC Permissions
CREATE TABLE public.role_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role TEXT NOT NULL,
  permission_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(role, permission_key)
);
INSERT INTO public.role_permissions (id, role, permission_key) VALUES
(gen_random_uuid(), 'restaurant_admin', 'MANAGE_MENU'),
(gen_random_uuid(), 'restaurant_admin', 'VIEW_MENU'),
(gen_random_uuid(), 'restaurant_admin', 'MANAGE_VARIANTS'),
(gen_random_uuid(), 'restaurant_admin', 'VIEW_ORDERS'),
(gen_random_uuid(), 'restaurant_admin', 'CREATE_ORDER'),
(gen_random_uuid(), 'restaurant_admin', 'CANCEL_ORDER'),
(gen_random_uuid(), 'restaurant_admin', 'ADVANCE_ORDER'),
(gen_random_uuid(), 'restaurant_admin', 'VOID_ORDER_ITEM'),
(gen_random_uuid(), 'restaurant_admin', 'MANAGE_TABLES'),
(gen_random_uuid(), 'restaurant_admin', 'VIEW_TABLES'),
(gen_random_uuid(), 'restaurant_admin', 'OPEN_TABLE'),
(gen_random_uuid(), 'restaurant_admin', 'CLOSE_TABLE'),
(gen_random_uuid(), 'restaurant_admin', 'MERGE_TABLES'),
(gen_random_uuid(), 'restaurant_admin', 'HANDLE_BILLING'),
(gen_random_uuid(), 'restaurant_admin', 'APPLY_DISCOUNT'),
(gen_random_uuid(), 'restaurant_admin', 'PROCESS_PAYMENT'),
(gen_random_uuid(), 'restaurant_admin', 'VOID_BILL'),
(gen_random_uuid(), 'restaurant_admin', 'VIEW_PAYMENTS'),
(gen_random_uuid(), 'restaurant_admin', 'MANAGE_STAFF'),
(gen_random_uuid(), 'restaurant_admin', 'VIEW_STAFF'),
(gen_random_uuid(), 'restaurant_admin', 'MANAGE_ROLES'),
(gen_random_uuid(), 'restaurant_admin', 'VIEW_ANALYTICS'),
(gen_random_uuid(), 'restaurant_admin', 'EXPORT_REPORTS'),
(gen_random_uuid(), 'restaurant_admin', 'VIEW_ITEM_METRICS'),
(gen_random_uuid(), 'restaurant_admin', 'MANAGE_SETTINGS'),
(gen_random_uuid(), 'restaurant_admin', 'MANAGE_DEVICES'),
(gen_random_uuid(), 'restaurant_admin', 'VIEW_AUDIT_LOG'),
(gen_random_uuid(), 'restaurant_admin', 'MANAGE_INTEGRATIONS'),
(gen_random_uuid(), 'manager', 'VIEW_MENU'),
(gen_random_uuid(), 'manager', 'VIEW_ORDERS'),
(gen_random_uuid(), 'manager', 'CREATE_ORDER'),
(gen_random_uuid(), 'manager', 'CANCEL_ORDER'),
(gen_random_uuid(), 'manager', 'ADVANCE_ORDER'),
(gen_random_uuid(), 'manager', 'VOID_ORDER_ITEM'),
(gen_random_uuid(), 'manager', 'VIEW_TABLES'),
(gen_random_uuid(), 'manager', 'OPEN_TABLE'),
(gen_random_uuid(), 'manager', 'CLOSE_TABLE'),
(gen_random_uuid(), 'manager', 'MERGE_TABLES'),
(gen_random_uuid(), 'manager', 'HANDLE_BILLING'),
(gen_random_uuid(), 'manager', 'APPLY_DISCOUNT'),
(gen_random_uuid(), 'manager', 'PROCESS_PAYMENT'),
(gen_random_uuid(), 'manager', 'VIEW_PAYMENTS'),
(gen_random_uuid(), 'manager', 'VIEW_STAFF'),
(gen_random_uuid(), 'manager', 'VIEW_ANALYTICS'),
(gen_random_uuid(), 'manager', 'VIEW_ITEM_METRICS'),
(gen_random_uuid(), 'staff', 'VIEW_MENU'),
(gen_random_uuid(), 'staff', 'VIEW_ORDERS'),
(gen_random_uuid(), 'staff', 'CREATE_ORDER'),
(gen_random_uuid(), 'staff', 'ADVANCE_ORDER'),
(gen_random_uuid(), 'staff', 'VIEW_TABLES'),
(gen_random_uuid(), 'staff', 'OPEN_TABLE'),
(gen_random_uuid(), 'staff', 'PROCESS_PAYMENT');

CREATE OR REPLACE FUNCTION public.get_user_permissions(p_user_id UUID, p_tenant_id UUID DEFAULT NULL)
RETURNS TABLE (permission_key TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
    SELECT rp.permission_key
    FROM public.admin_profiles ap
    INNER JOIN public.role_permissions rp
      ON LOWER(ap.role::TEXT) = LOWER(rp.role::TEXT)
    WHERE ap.id = p_user_id
      AND ap.is_active = TRUE
      AND ap.deleted_at IS NULL
      AND (
        ap.tenant_id IS NULL
        OR p_tenant_id IS NULL
        OR ap.tenant_id = p_tenant_id
      );
END;
$$;
REVOKE ALL ON FUNCTION public.get_user_permissions(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_permissions(UUID, UUID) TO service_role;

-- App Entities (created without branch FK yet, wait! we can create them without the simple FK and apply composite in step 10)

CREATE TABLE public.staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL,
  user_id UUID REFERENCES public.platform_users(id) ON DELETE SET NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  pin_code_hash TEXT,
  role TEXT NOT NULL DEFAULT 'SERVER',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'deleted')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);
CREATE TRIGGER set_staff_updated_at BEFORE UPDATE ON public.staff FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL,
  name TEXT NOT NULL,
  device_type TEXT NOT NULL CHECK (device_type IN ('POS', 'KDS', 'KIOSK', 'TABLET')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'offline', 'maintenance', 'deleted')),
  last_ping_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);
CREATE TRIGGER set_devices_updated_at BEFORE UPDATE ON public.devices FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.qr_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL,
  table_id UUID,
  session_token TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed', 'expired')),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);
CREATE TRIGGER set_qr_sessions_updated_at BEFORE UPDATE ON public.qr_sessions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.domain_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  aggregate_type TEXT NOT NULL,
  aggregate_id UUID NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID
);
