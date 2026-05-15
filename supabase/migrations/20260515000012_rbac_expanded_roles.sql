-- ============================================================
-- Migration: 012_rbac_expanded_roles
-- Adds CASHIER, SERVER, KITCHEN, CUSTOMER_SUPPORT roles.
-- Expands admin_role enum and seeds role_permissions.
-- ============================================================

-- ─── 1. Expand admin_role enum ────────────────────────────────
-- Postgres requires ADD VALUE outside a transaction block for enums,
-- but Supabase migrations run each file as a single transaction.
-- We use a DO block to guard against duplicate_object errors.

DO $$ BEGIN
  ALTER TYPE public.admin_role ADD VALUE IF NOT EXISTS 'CASHIER';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE public.admin_role ADD VALUE IF NOT EXISTS 'SERVER';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE public.admin_role ADD VALUE IF NOT EXISTS 'KITCHEN';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE public.admin_role ADD VALUE IF NOT EXISTS 'CUSTOMER_SUPPORT';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── 2. Seed role_permissions for new roles ───────────────────
-- Using INSERT ... ON CONFLICT DO NOTHING for idempotency.

INSERT INTO public.role_permissions (id, role, permission_key) VALUES
-- CASHIER: billing and payment operations
(gen_random_uuid(), 'cashier', 'VIEW_MENU'),
(gen_random_uuid(), 'cashier', 'VIEW_ORDERS'),
(gen_random_uuid(), 'cashier', 'HANDLE_BILLING'),
(gen_random_uuid(), 'cashier', 'APPLY_DISCOUNT'),
(gen_random_uuid(), 'cashier', 'PROCESS_PAYMENT'),
(gen_random_uuid(), 'cashier', 'VIEW_PAYMENTS'),
(gen_random_uuid(), 'cashier', 'VIEW_TABLES'),

-- SERVER: order-taking and table operations
(gen_random_uuid(), 'server', 'VIEW_MENU'),
(gen_random_uuid(), 'server', 'VIEW_ORDERS'),
(gen_random_uuid(), 'server', 'CREATE_ORDER'),
(gen_random_uuid(), 'server', 'ADVANCE_ORDER'),
(gen_random_uuid(), 'server', 'VIEW_TABLES'),
(gen_random_uuid(), 'server', 'OPEN_TABLE'),
(gen_random_uuid(), 'server', 'PROCESS_PAYMENT'),

-- KITCHEN: kitchen display system operations only
(gen_random_uuid(), 'kitchen', 'VIEW_MENU'),
(gen_random_uuid(), 'kitchen', 'VIEW_ORDERS'),
(gen_random_uuid(), 'kitchen', 'ADVANCE_ORDER'),

-- CUSTOMER_SUPPORT: read-only visibility across tenant scope
(gen_random_uuid(), 'customer_support', 'VIEW_MENU'),
(gen_random_uuid(), 'customer_support', 'VIEW_ORDERS'),
(gen_random_uuid(), 'customer_support', 'VIEW_TABLES'),
(gen_random_uuid(), 'customer_support', 'VIEW_PAYMENTS'),
(gen_random_uuid(), 'customer_support', 'VIEW_STAFF'),
(gen_random_uuid(), 'customer_support', 'VIEW_ANALYTICS')
ON CONFLICT (role, permission_key) DO NOTHING;

-- ─── 3. Add suspicious_activity columns to device_sessions ────
ALTER TABLE public.device_sessions
  ADD COLUMN IF NOT EXISTS suspicious_flags INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS geo_country      CHAR(2);

-- ─── 4. Active sessions index for suspicious activity queries ──
CREATE INDEX IF NOT EXISTS idx_device_sessions_suspicious
  ON public.device_sessions(user_id, suspicious_flags)
  WHERE is_active = TRUE AND suspicious_flags > 0;
