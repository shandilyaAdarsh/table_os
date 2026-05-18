-- 20260518000002_menu_item_prices.sql
BEGIN;

-- Enable btree_gist for exclusion constraints
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- 1. Create Core Pricing Table
CREATE TABLE IF NOT EXISTS public.menu_item_prices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
    menu_item_id UUID NOT NULL REFERENCES public.menu_items(id) ON DELETE RESTRICT,
    
    pricing_tier TEXT NOT NULL DEFAULT 'base',
    currency_code CHAR(3) NOT NULL DEFAULT 'USD',
    amount_minor BIGINT NOT NULL,
    priority INTEGER NOT NULL DEFAULT 0,
    
    effective_from TIMESTAMPTZ NOT NULL DEFAULT now(),
    effective_to TIMESTAMPTZ,
    
    is_active BOOLEAN NOT NULL DEFAULT true,
    version_num INTEGER NOT NULL DEFAULT 1,
    
    created_by UUID REFERENCES public.platform_users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES public.platform_users(id) ON DELETE SET NULL,
    
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    
    -- Constraints
    CONSTRAINT menu_item_prices_amount_minor_check CHECK (amount_minor >= 0),
    CONSTRAINT menu_item_prices_effective_window_check CHECK (effective_to IS NULL OR effective_to > effective_from),
    CONSTRAINT menu_item_prices_priority_check CHECK (priority BETWEEN 0 AND 1000),
    CONSTRAINT menu_item_prices_overlap_excl EXCLUDE USING gist (
        tenant_id WITH =,
        menu_item_id WITH =,
        pricing_tier WITH =,
        currency_code WITH =,
        tstzrange(effective_from, COALESCE(effective_to, 'infinity'::timestamptz)) WITH &&
    ) WHERE (deleted_at IS NULL AND is_active = true)
);

-- Note: We do not DROP base_price from menu_items here to allow seamless 
-- backwards compatibility during deployment. It will be deprecated fully in a subsequent phase.

-- 2. Indexes
-- =====================================================================================
-- ARCHITECTURE NOTE: PRODUCTION INDEXING STRATEGY
-- =====================================================================================
-- For production environments with millions of rows, indexing should use:
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS ...
-- 
-- IMPORTANT: CONCURRENTLY cannot run inside a transaction block (BEGIN/COMMIT).
-- This migration uses standard locking index creation because this module is still
-- in early pre-production, where tables are empty or small. 
-- =====================================================================================

-- Tenant-leading partial index to filter active, non-deleted pricing rows quickly
CREATE INDEX IF NOT EXISTS idx_menu_item_prices_tenant_active 
ON public.menu_item_prices(tenant_id, menu_item_id, is_active) 
WHERE deleted_at IS NULL;

-- Index for resolving effective windows efficiently
CREATE INDEX IF NOT EXISTS idx_menu_item_prices_effective_window
ON public.menu_item_prices(tenant_id, effective_from, effective_to)
WHERE deleted_at IS NULL AND is_active = true;

-- Resolver performance index: matches the exact ORDER BY pattern of the RPC
CREATE INDEX IF NOT EXISTS idx_menu_item_prices_resolver
ON public.menu_item_prices(tenant_id, menu_item_id, currency_code, priority DESC, effective_from DESC)
WHERE deleted_at IS NULL AND is_active = true;

-- Operational index for soft-deleted rows
CREATE INDEX IF NOT EXISTS idx_menu_item_prices_deleted_at
ON public.menu_item_prices(tenant_id, deleted_at)
WHERE deleted_at IS NOT NULL;

-- 3. Audit Trigger
-- Requires the set_updated_at function to be present (already established in earlier migrations)
DROP TRIGGER IF EXISTS handle_menu_item_prices_updated_at ON public.menu_item_prices;
CREATE TRIGGER handle_menu_item_prices_updated_at
    BEFORE UPDATE ON public.menu_item_prices
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

-- Enforce Immutable Financial History
CREATE OR REPLACE FUNCTION public.prevent_menu_item_prices_mutation()
RETURNS trigger AS $$
BEGIN
    IF OLD.amount_minor IS DISTINCT FROM NEW.amount_minor OR
       OLD.currency_code IS DISTINCT FROM NEW.currency_code OR
       OLD.pricing_tier IS DISTINCT FROM NEW.pricing_tier OR
       OLD.effective_from IS DISTINCT FROM NEW.effective_from OR
       OLD.effective_to IS DISTINCT FROM NEW.effective_to THEN
        RAISE EXCEPTION 'Immutable financial fields cannot be modified. Deactivate and create a new price.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS enforce_menu_item_prices_immutability ON public.menu_item_prices;
CREATE TRIGGER enforce_menu_item_prices_immutability
    BEFORE UPDATE ON public.menu_item_prices
    FOR EACH ROW
    EXECUTE FUNCTION public.prevent_menu_item_prices_mutation();

-- 4. RPC Functions for Deterministic Price Resolution

-- Single Item Resolution
CREATE OR REPLACE FUNCTION public.resolve_menu_item_price(
    p_tenant_id UUID,
    p_menu_item_id UUID,
    p_currency_code CHAR(3) DEFAULT 'USD',
    p_as_of TIMESTAMPTZ DEFAULT now()
) RETURNS TABLE (
    price_id UUID,
    menu_item_id UUID,
    amount_minor BIGINT,
    currency_code CHAR(3),
    pricing_tier TEXT,
    priority INTEGER,
    effective_from TIMESTAMPTZ,
    effective_to TIMESTAMPTZ,
    resolved_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
AS $$
    SELECT 
        id as price_id,
        menu_item_id,
        amount_minor,
        currency_code,
        pricing_tier,
        priority,
        effective_from,
        effective_to,
        p_as_of as resolved_at
    FROM public.menu_item_prices
    WHERE tenant_id = p_tenant_id
      AND menu_item_id = p_menu_item_id
      AND currency_code = p_currency_code
      AND is_active = true
      AND deleted_at IS NULL
      AND effective_from <= p_as_of
      AND (effective_to IS NULL OR effective_to > p_as_of)
    ORDER BY priority DESC, effective_from DESC
    LIMIT 1;
$$;

-- Batch Item Resolution (Avoids N+1 queries)
CREATE OR REPLACE FUNCTION public.resolve_menu_item_prices_batch(
    p_tenant_id UUID,
    p_menu_item_ids UUID[],
    p_currency_code CHAR(3) DEFAULT 'USD',
    p_as_of TIMESTAMPTZ DEFAULT now()
) RETURNS TABLE (
    menu_item_id UUID,
    price_id UUID,
    amount_minor BIGINT,
    currency_code CHAR(3),
    pricing_tier TEXT,
    priority INTEGER
)
LANGUAGE sql
STABLE
AS $$
    SELECT DISTINCT ON (mip.menu_item_id)
        mip.menu_item_id,
        mip.id as price_id,
        mip.amount_minor,
        mip.currency_code,
        mip.pricing_tier,
        mip.priority
    FROM public.menu_item_prices mip
    WHERE mip.tenant_id = p_tenant_id
      AND mip.menu_item_id = ANY(p_menu_item_ids)
      AND mip.currency_code = p_currency_code
      AND mip.is_active = true
      AND mip.deleted_at IS NULL
      AND mip.effective_from <= p_as_of
      AND (mip.effective_to IS NULL OR mip.effective_to > p_as_of)
    ORDER BY mip.menu_item_id, mip.priority DESC, mip.effective_from DESC;
$$;

-- 5. RLS Policies
ALTER TABLE public.menu_item_prices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant isolation for menu_item_prices_select" ON public.menu_item_prices;
CREATE POLICY "Tenant isolation for menu_item_prices_select"
    ON public.menu_item_prices
    AS RESTRICTIVE
    FOR SELECT
    TO authenticated
    USING (tenant_id = (current_setting('app.current_tenant_id', true))::uuid);

DROP POLICY IF EXISTS "Tenant isolation for menu_item_prices_insert" ON public.menu_item_prices;
CREATE POLICY "Tenant isolation for menu_item_prices_insert"
    ON public.menu_item_prices
    AS RESTRICTIVE
    FOR INSERT
    TO authenticated
    WITH CHECK (tenant_id = (current_setting('app.current_tenant_id', true))::uuid);

DROP POLICY IF EXISTS "Tenant isolation for menu_item_prices_update" ON public.menu_item_prices;
CREATE POLICY "Tenant isolation for menu_item_prices_update"
    ON public.menu_item_prices
    AS RESTRICTIVE
    FOR UPDATE
    TO authenticated
    USING (tenant_id = (current_setting('app.current_tenant_id', true))::uuid)
    WITH CHECK (tenant_id = (current_setting('app.current_tenant_id', true))::uuid);

DROP POLICY IF EXISTS "Tenant isolation for menu_item_prices_delete" ON public.menu_item_prices;
CREATE POLICY "Tenant isolation for menu_item_prices_delete"
    ON public.menu_item_prices
    AS RESTRICTIVE
    FOR DELETE
    TO authenticated
    USING (tenant_id = (current_setting('app.current_tenant_id', true))::uuid);

COMMIT;
