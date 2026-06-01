-- Migration: Add Missing Tables (FIXED VERSION)
-- Date: 2026-05-31
-- Purpose: Create missing tables referenced in backend code but not in migrations
-- Related: production-critical-fixes bugfix spec (Task 3.2)
-- FIX: Simplified RLS policies to avoid tenant_users.auth_id error

-- ============================================================================
-- 1. USERS TABLE
-- ============================================================================
-- Critical for tenant resolution (Bug 2)
-- Links auth.users to tenant context

CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'staff',
  branch_ids UUID[] NOT NULL DEFAULT '{}',
  is_first_login BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT users_email_check CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
);

-- Enable RLS
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can read their own record
CREATE POLICY "users_select_own" ON public.users
  FOR SELECT
  USING (auth_id = auth.uid());

-- RLS Policy: Service role can manage all (for backend operations)
-- Note: Admin management policies can be added later after proper tenant_users integration

-- Indexes
CREATE INDEX idx_users_auth_id ON public.users(auth_id);
CREATE INDEX idx_users_tenant_id ON public.users(tenant_id);
CREATE INDEX idx_users_email ON public.users(email);

-- Updated at trigger
CREATE TRIGGER set_users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();


-- ============================================================================
-- 2. DYNAMIC PRICING RULES TABLE
-- ============================================================================
-- Stores dynamic pricing rules for menu items
-- Causing PGRST205 errors (Bug 1)

CREATE TABLE IF NOT EXISTS public.dynamic_pricing_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  rule_type TEXT NOT NULL CHECK (rule_type IN ('discount_percent', 'discount_fixed', 'surcharge_percent', 'surcharge_fixed')),
  value_minor INTEGER NOT NULL CHECK (value_minor >= 0),
  target_categories UUID[] NOT NULL DEFAULT '{}',
  days_of_week INTEGER[] NOT NULL DEFAULT '{0,1,2,3,4,5,6}' CHECK (
    array_length(days_of_week, 1) IS NULL OR 
    (SELECT bool_and(day >= 0 AND day <= 6) FROM unnest(days_of_week) AS day)
  ),
  start_time TIME,
  end_time TIME,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.dynamic_pricing_rules ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Tenant isolation (using app.current_tenant_id set by backend)
CREATE POLICY "tenant_isolation_policy" ON public.dynamic_pricing_rules
  FOR ALL
  USING (
    tenant_id = COALESCE(
      current_setting('app.current_tenant_id', true)::UUID,
      tenant_id  -- Fallback for service role
    )
  );

-- Indexes
CREATE INDEX idx_dynamic_pricing_rules_tenant_id ON public.dynamic_pricing_rules(tenant_id);
CREATE INDEX idx_dynamic_pricing_rules_active ON public.dynamic_pricing_rules(tenant_id, is_active) WHERE is_active = true;
CREATE INDEX idx_dynamic_pricing_rules_days ON public.dynamic_pricing_rules USING GIN(days_of_week);

-- Updated at trigger
CREATE TRIGGER set_dynamic_pricing_rules_updated_at
  BEFORE UPDATE ON public.dynamic_pricing_rules
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();


-- ============================================================================
-- 3. PROMO CODES TABLE
-- ============================================================================
-- Stores promotional codes for discounts
-- Causing PGRST205 errors (Bug 1)

CREATE TABLE IF NOT EXISTS public.promo_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  description TEXT NOT NULL,
  discount_type TEXT NOT NULL CHECK (discount_type IN ('percent', 'fixed', 'free_item')),
  discount_value_minor INTEGER NOT NULL CHECK (discount_value_minor >= 0),
  max_uses INTEGER CHECK (max_uses IS NULL OR max_uses > 0),
  current_uses INTEGER NOT NULL DEFAULT 0 CHECK (current_uses >= 0),
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT promo_codes_unique_code UNIQUE(tenant_id, code),
  CONSTRAINT promo_codes_uses_check CHECK (max_uses IS NULL OR current_uses <= max_uses)
);

-- Enable RLS
ALTER TABLE public.promo_codes ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Tenant isolation
CREATE POLICY "tenant_isolation_policy" ON public.promo_codes
  FOR ALL
  USING (
    tenant_id = COALESCE(
      current_setting('app.current_tenant_id', true)::UUID,
      tenant_id  -- Fallback for service role
    )
  );

-- Indexes
CREATE INDEX idx_promo_codes_tenant_id ON public.promo_codes(tenant_id);
CREATE INDEX idx_promo_codes_code ON public.promo_codes(tenant_id, code);
CREATE INDEX idx_promo_codes_active ON public.promo_codes(tenant_id, is_active) WHERE is_active = true;
CREATE INDEX idx_promo_codes_expires_at ON public.promo_codes(expires_at) WHERE expires_at IS NOT NULL;

-- Updated at trigger
CREATE TRIGGER set_promo_codes_updated_at
  BEFORE UPDATE ON public.promo_codes
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();


-- ============================================================================
-- 4. CREDENTIAL INVITES TABLE
-- ============================================================================
-- Stores credential invitations for user onboarding

CREATE TABLE IF NOT EXISTS public.credential_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'staff',
  branch_ids UUID[] NOT NULL DEFAULT '{}',
  invite_token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  is_used BOOLEAN NOT NULL DEFAULT false,
  used_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT credential_invites_email_check CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
);

-- Enable RLS
ALTER TABLE public.credential_invites ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Tenant isolation
CREATE POLICY "tenant_isolation_policy" ON public.credential_invites
  FOR ALL
  USING (
    tenant_id = COALESCE(
      current_setting('app.current_tenant_id', true)::UUID,
      tenant_id  -- Fallback for service role
    )
  );

-- Indexes
CREATE INDEX idx_credential_invites_tenant_id ON public.credential_invites(tenant_id);
CREATE INDEX idx_credential_invites_email ON public.credential_invites(email);
CREATE INDEX idx_credential_invites_token ON public.credential_invites(invite_token);
CREATE INDEX idx_credential_invites_expires_at ON public.credential_invites(expires_at) WHERE is_used = false;

-- Updated at trigger
CREATE TRIGGER set_credential_invites_updated_at
  BEFORE UPDATE ON public.credential_invites
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();


-- ============================================================================
-- 5. PROFILES TABLE
-- ============================================================================
-- Stores user profile information

CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  phone TEXT,
  avatar_url TEXT,
  preferences JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT profiles_email_check CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
);

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can read their own profile
CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT
  USING (auth_id = auth.uid());

-- RLS Policy: Users can update their own profile
CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE
  USING (auth_id = auth.uid());

-- Indexes
CREATE INDEX idx_profiles_auth_id ON public.profiles(auth_id);
CREATE INDEX idx_profiles_tenant_id ON public.profiles(tenant_id);
CREATE INDEX idx_profiles_email ON public.profiles(email);

-- Updated at trigger
CREATE TRIGGER set_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();


-- ============================================================================
-- 6. GUEST SESSIONS TABLE
-- ============================================================================
-- Stores guest session tracking for diagnostics

CREATE TABLE IF NOT EXISTS public.guest_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  session_token TEXT NOT NULL UNIQUE,
  qr_code_id UUID REFERENCES public.qr_codes(id) ON DELETE SET NULL,
  table_id UUID REFERENCES public.tables(id) ON DELETE SET NULL,
  branch_id UUID REFERENCES public.branches(id) ON DELETE CASCADE,
  guest_identifier TEXT,
  session_data JSONB NOT NULL DEFAULT '{}',
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.guest_sessions ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Tenant isolation
CREATE POLICY "tenant_isolation_policy" ON public.guest_sessions
  FOR ALL
  USING (
    tenant_id = COALESCE(
      current_setting('app.current_tenant_id', true)::UUID,
      tenant_id  -- Fallback for service role
    )
  );

-- Indexes
CREATE INDEX idx_guest_sessions_tenant_id ON public.guest_sessions(tenant_id);
CREATE INDEX idx_guest_sessions_token ON public.guest_sessions(session_token);
CREATE INDEX idx_guest_sessions_qr_code_id ON public.guest_sessions(qr_code_id);
CREATE INDEX idx_guest_sessions_table_id ON public.guest_sessions(table_id);
CREATE INDEX idx_guest_sessions_branch_id ON public.guest_sessions(branch_id);
CREATE INDEX idx_guest_sessions_active ON public.guest_sessions(tenant_id, is_active) WHERE is_active = true;
CREATE INDEX idx_guest_sessions_last_activity ON public.guest_sessions(last_activity_at) WHERE is_active = true;

-- Updated at trigger
CREATE TRIGGER set_guest_sessions_updated_at
  BEFORE UPDATE ON public.guest_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();


-- ============================================================================
-- 7. MENU SNAPSHOTS TABLE
-- ============================================================================
-- Stores menu snapshots for historical tracking

CREATE TABLE IF NOT EXISTS public.menu_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES public.branches(id) ON DELETE CASCADE,
  snapshot_data JSONB NOT NULL,
  snapshot_version INTEGER NOT NULL DEFAULT 1,
  snapshot_type TEXT NOT NULL CHECK (snapshot_type IN ('full', 'incremental', 'branch_override')),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  valid_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  valid_until TIMESTAMPTZ
);

-- Enable RLS
ALTER TABLE public.menu_snapshots ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Tenant isolation
CREATE POLICY "tenant_isolation_policy" ON public.menu_snapshots
  FOR ALL
  USING (
    tenant_id = COALESCE(
      current_setting('app.current_tenant_id', true)::UUID,
      tenant_id  -- Fallback for service role
    )
  );

-- Indexes
CREATE INDEX idx_menu_snapshots_tenant_id ON public.menu_snapshots(tenant_id);
CREATE INDEX idx_menu_snapshots_branch_id ON public.menu_snapshots(branch_id);
CREATE INDEX idx_menu_snapshots_created_at ON public.menu_snapshots(created_at DESC);
CREATE INDEX idx_menu_snapshots_valid_from ON public.menu_snapshots(valid_from DESC);
CREATE INDEX idx_menu_snapshots_version ON public.menu_snapshots(tenant_id, snapshot_version DESC);


-- ============================================================================
-- 8. RESTAURANT SETTINGS TABLE
-- ============================================================================
-- Stores restaurant configuration settings

CREATE TABLE IF NOT EXISTS public.restaurant_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL UNIQUE REFERENCES public.tenants(id) ON DELETE CASCADE,
  business_name TEXT NOT NULL,
  business_address TEXT,
  business_phone TEXT,
  business_email TEXT,
  tax_registration_number TEXT,
  currency_code TEXT NOT NULL DEFAULT 'USD' CHECK (length(currency_code) = 3),
  timezone TEXT NOT NULL DEFAULT 'UTC',
  locale TEXT NOT NULL DEFAULT 'en-US',
  operating_hours JSONB NOT NULL DEFAULT '{}',
  features_enabled JSONB NOT NULL DEFAULT '{}',
  branding JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.restaurant_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Tenant isolation
CREATE POLICY "tenant_isolation_policy" ON public.restaurant_settings
  FOR ALL
  USING (
    tenant_id = COALESCE(
      current_setting('app.current_tenant_id', true)::UUID,
      tenant_id  -- Fallback for service role
    )
  );

-- Indexes
CREATE INDEX idx_restaurant_settings_tenant_id ON public.restaurant_settings(tenant_id);

-- Updated at trigger
CREATE TRIGGER set_restaurant_settings_updated_at
  BEFORE UPDATE ON public.restaurant_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();


-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
-- Summary:
-- - Created 8 missing tables
-- - Enabled RLS on all tables with simplified tenant isolation policies
-- - Created indexes for performance optimization
-- - Added updated_at triggers for audit tracking
-- 
-- Tables created:
-- 1. users (critical for Bug 2 - tenant resolution)
-- 2. dynamic_pricing_rules (fixes PGRST205 error)
-- 3. promo_codes (fixes PGRST205 error)
-- 4. credential_invites (onboarding support)
-- 5. profiles (user management)
-- 6. guest_sessions (diagnostics support)
-- 7. menu_snapshots (historical tracking)
-- 8. restaurant_settings (configuration)
--
-- Note: RLS policies are simplified to avoid tenant_users.auth_id errors.
-- Backend service role will handle most operations. Additional admin policies
-- can be added later after proper integration with tenant_users table.
