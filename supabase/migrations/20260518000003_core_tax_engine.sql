-- ============================================================
-- Migration: 20260518000003_core_tax_engine
-- Replaces old float-based tax system with integer basis-points
-- append-only historical pricing strategy.
-- ============================================================

BEGIN;

-- 1. Drop old tables safely
DROP TABLE IF EXISTS public.tax_rates CASCADE;
DROP TABLE IF EXISTS public.tax_groups CASCADE;

-- 2. Create tax_profiles
CREATE TABLE public.tax_profiles (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  name             TEXT NOT NULL,
  description      TEXT,
  calculation_mode public.tax_calculation_mode NOT NULL DEFAULT 'exclusive',
  priority         INT NOT NULL DEFAULT 100,
  is_active        BOOLEAN NOT NULL DEFAULT true,
  created_by       UUID REFERENCES public.platform_users(id),
  updated_by       UUID REFERENCES public.platform_users(id),
  version_num      INT NOT NULL DEFAULT 1,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at       TIMESTAMPTZ,
  
  CONSTRAINT chk_tax_profiles_priority CHECK (priority >= 0 AND priority <= 1000)
);

CREATE INDEX idx_tax_profiles_tenant_id ON public.tax_profiles(tenant_id) WHERE deleted_at IS NULL;

CREATE TRIGGER set_tax_profiles_updated_at
  BEFORE UPDATE ON public.tax_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3. Create tax_rates
CREATE TABLE public.tax_rates (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  tax_profile_id     UUID NOT NULL REFERENCES public.tax_profiles(id) ON DELETE RESTRICT,
  name               TEXT NOT NULL,
  rate_basis_points  INT NOT NULL,
  priority           INT NOT NULL DEFAULT 100,
  effective_from     TIMESTAMPTZ NOT NULL DEFAULT now(),
  effective_to       TIMESTAMPTZ,
  is_active          BOOLEAN NOT NULL DEFAULT true,
  created_by         UUID REFERENCES public.platform_users(id),
  updated_by         UUID REFERENCES public.platform_users(id),
  version_num        INT NOT NULL DEFAULT 1,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at         TIMESTAMPTZ,
  
  CONSTRAINT chk_tax_rates_basis_points CHECK (rate_basis_points >= 0),
  CONSTRAINT chk_tax_rates_priority CHECK (priority >= 0 AND priority <= 1000),
  CONSTRAINT chk_tax_rates_effective_dates CHECK (effective_to IS NULL OR effective_from < effective_to)
);

-- Enable btree_gist extension (likely already enabled in utilities, but just in case we need it for exclusion)
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Prevent overlapping active windows for the same component name within a tax profile
ALTER TABLE public.tax_rates ADD CONSTRAINT tax_rates_overlap_excl
  EXCLUDE USING gist (
    tenant_id WITH =,
    tax_profile_id WITH =,
    name WITH =,
    tstzrange(effective_from, effective_to, '[)') WITH &&
  ) WHERE (is_active = TRUE AND deleted_at IS NULL);

CREATE INDEX idx_tax_rates_profile ON public.tax_rates(tax_profile_id) WHERE is_active = true AND deleted_at IS NULL;
CREATE INDEX idx_tax_rates_tenant ON public.tax_rates(tenant_id) WHERE is_active = true AND deleted_at IS NULL;
CREATE INDEX idx_tax_rates_deleted ON public.tax_rates(tenant_id) WHERE deleted_at IS NOT NULL;

CREATE TRIGGER set_tax_rates_updated_at
  BEFORE UPDATE ON public.tax_rates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Immutable history trigger for tax_rates
CREATE OR REPLACE FUNCTION public.prevent_tax_rates_mutation()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.rate_basis_points IS DISTINCT FROM NEW.rate_basis_points OR
     OLD.effective_from IS DISTINCT FROM NEW.effective_from OR
     OLD.effective_to IS DISTINCT FROM NEW.effective_to OR
     OLD.tax_profile_id IS DISTINCT FROM NEW.tax_profile_id OR
     OLD.name IS DISTINCT FROM NEW.name
  THEN
    RAISE EXCEPTION 'Immutable financial fields cannot be modified. Deactivate and create a new tax rate.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_tax_rates_immutability
  BEFORE UPDATE ON public.tax_rates
  FOR EACH ROW
  WHEN (NEW.is_active = true AND OLD.is_active = true AND NEW.deleted_at IS NULL)
  EXECUTE FUNCTION public.prevent_tax_rates_mutation();

-- 4. Create menu_item_tax_profiles mapping
CREATE TABLE public.menu_item_tax_profiles (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  menu_item_id     UUID NOT NULL REFERENCES public.menu_items(id) ON DELETE RESTRICT,
  tax_profile_id   UUID NOT NULL REFERENCES public.tax_profiles(id) ON DELETE RESTRICT,
  is_active        BOOLEAN NOT NULL DEFAULT true,
  created_by       UUID REFERENCES public.platform_users(id),
  updated_by       UUID REFERENCES public.platform_users(id),
  version_num      INT NOT NULL DEFAULT 1,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at       TIMESTAMPTZ,
  
  -- Item can only have one active tax profile at a time
  CONSTRAINT menu_item_tax_profiles_unique UNIQUE (tenant_id, menu_item_id)
);

-- We only enforce uniqueness on active rows without using a partial unique index directly if we want constraint.
-- Actually, a partial unique index is safer for soft-delete. Let's drop the constraint and use an index.
ALTER TABLE public.menu_item_tax_profiles DROP CONSTRAINT menu_item_tax_profiles_unique;

CREATE UNIQUE INDEX idx_menu_item_tax_profiles_unique_active 
  ON public.menu_item_tax_profiles(tenant_id, menu_item_id) 
  WHERE is_active = true AND deleted_at IS NULL;

CREATE INDEX idx_menu_item_tax_profiles_item ON public.menu_item_tax_profiles(menu_item_id) WHERE is_active = true;

CREATE TRIGGER set_menu_item_tax_profiles_updated_at
  BEFORE UPDATE ON public.menu_item_tax_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 5. RLS Policies

ALTER TABLE public.tax_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tax_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_item_tax_profiles ENABLE ROW LEVEL SECURITY;

-- tax_profiles RLS
CREATE POLICY "tenant_isolation_tax_profiles_select" ON public.tax_profiles AS RESTRICTIVE FOR SELECT TO authenticated
USING (tenant_id = (current_setting('app.current_tenant_id', true))::uuid);

CREATE POLICY "tenant_isolation_tax_profiles_insert" ON public.tax_profiles AS RESTRICTIVE FOR INSERT TO authenticated
WITH CHECK (tenant_id = (current_setting('app.current_tenant_id', true))::uuid);

CREATE POLICY "tenant_isolation_tax_profiles_update" ON public.tax_profiles AS RESTRICTIVE FOR UPDATE TO authenticated
USING (tenant_id = (current_setting('app.current_tenant_id', true))::uuid)
WITH CHECK (tenant_id = (current_setting('app.current_tenant_id', true))::uuid);

CREATE POLICY "tenant_isolation_tax_profiles_delete" ON public.tax_profiles AS RESTRICTIVE FOR DELETE TO authenticated
USING (tenant_id = (current_setting('app.current_tenant_id', true))::uuid);

-- Basic authenticated access
CREATE POLICY "authenticated_access_tax_profiles" ON public.tax_profiles FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- tax_rates RLS
CREATE POLICY "tenant_isolation_tax_rates_select" ON public.tax_rates AS RESTRICTIVE FOR SELECT TO authenticated
USING (tenant_id = (current_setting('app.current_tenant_id', true))::uuid);

CREATE POLICY "tenant_isolation_tax_rates_insert" ON public.tax_rates AS RESTRICTIVE FOR INSERT TO authenticated
WITH CHECK (tenant_id = (current_setting('app.current_tenant_id', true))::uuid);

CREATE POLICY "tenant_isolation_tax_rates_update" ON public.tax_rates AS RESTRICTIVE FOR UPDATE TO authenticated
USING (tenant_id = (current_setting('app.current_tenant_id', true))::uuid)
WITH CHECK (tenant_id = (current_setting('app.current_tenant_id', true))::uuid);

CREATE POLICY "tenant_isolation_tax_rates_delete" ON public.tax_rates AS RESTRICTIVE FOR DELETE TO authenticated
USING (tenant_id = (current_setting('app.current_tenant_id', true))::uuid);

-- Basic authenticated access
CREATE POLICY "authenticated_access_tax_rates" ON public.tax_rates FOR ALL TO authenticated USING (true) WITH CHECK (true);


-- menu_item_tax_profiles RLS
CREATE POLICY "tenant_isolation_mitp_select" ON public.menu_item_tax_profiles AS RESTRICTIVE FOR SELECT TO authenticated
USING (tenant_id = (current_setting('app.current_tenant_id', true))::uuid);

CREATE POLICY "tenant_isolation_mitp_insert" ON public.menu_item_tax_profiles AS RESTRICTIVE FOR INSERT TO authenticated
WITH CHECK (tenant_id = (current_setting('app.current_tenant_id', true))::uuid);

CREATE POLICY "tenant_isolation_mitp_update" ON public.menu_item_tax_profiles AS RESTRICTIVE FOR UPDATE TO authenticated
USING (tenant_id = (current_setting('app.current_tenant_id', true))::uuid)
WITH CHECK (tenant_id = (current_setting('app.current_tenant_id', true))::uuid);

CREATE POLICY "tenant_isolation_mitp_delete" ON public.menu_item_tax_profiles AS RESTRICTIVE FOR DELETE TO authenticated
USING (tenant_id = (current_setting('app.current_tenant_id', true))::uuid);

-- Basic authenticated access
CREATE POLICY "authenticated_access_mitp" ON public.menu_item_tax_profiles FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 6. RPC Resolvers

-- resolve_tax_for_menu_item
CREATE OR REPLACE FUNCTION public.resolve_tax_for_menu_item(
  p_tenant_id UUID,
  p_menu_item_id UUID,
  p_effective_at TIMESTAMPTZ DEFAULT now()
)
RETURNS TABLE (
  tax_profile_id UUID,
  calculation_mode public.tax_calculation_mode,
  total_basis_points INT
) AS $$
DECLARE
  v_tax_profile_id UUID;
  v_calculation_mode public.tax_calculation_mode;
  v_total_bp INT;
BEGIN
  -- 1. Find the active tax profile for the item
  SELECT tp.id, tp.calculation_mode
  INTO v_tax_profile_id, v_calculation_mode
  FROM public.menu_item_tax_profiles mitp
  JOIN public.tax_profiles tp ON mitp.tax_profile_id = tp.id
  WHERE mitp.tenant_id = p_tenant_id
    AND mitp.menu_item_id = p_menu_item_id
    AND mitp.is_active = true
    AND mitp.deleted_at IS NULL
    AND tp.is_active = true
    AND tp.deleted_at IS NULL
  LIMIT 1;

  IF v_tax_profile_id IS NULL THEN
    RETURN; -- No active tax profile mapped
  END IF;

  -- 2. Sum up all active tax rates for the profile at the effective time
  SELECT COALESCE(SUM(tr.rate_basis_points), 0)
  INTO v_total_bp
  FROM public.tax_rates tr
  WHERE tr.tenant_id = p_tenant_id
    AND tr.tax_profile_id = v_tax_profile_id
    AND tr.is_active = true
    AND tr.deleted_at IS NULL
    AND tr.effective_from <= p_effective_at
    AND (tr.effective_to IS NULL OR tr.effective_to > p_effective_at);

  RETURN QUERY SELECT v_tax_profile_id, v_calculation_mode, v_total_bp;
END;
$$ LANGUAGE plpgsql STABLE;

-- resolve_tax_for_menu_items_batch
CREATE OR REPLACE FUNCTION public.resolve_tax_for_menu_items_batch(
  p_tenant_id UUID,
  p_menu_item_ids UUID[],
  p_effective_at TIMESTAMPTZ DEFAULT now()
)
RETURNS TABLE (
  menu_item_id UUID,
  tax_profile_id UUID,
  calculation_mode public.tax_calculation_mode,
  total_basis_points INT
) AS $$
BEGIN
  RETURN QUERY
  WITH item_profiles AS (
    SELECT 
      mitp.menu_item_id,
      tp.id AS tax_profile_id,
      tp.calculation_mode
    FROM public.menu_item_tax_profiles mitp
    JOIN public.tax_profiles tp ON mitp.tax_profile_id = tp.id
    WHERE mitp.tenant_id = p_tenant_id
      AND mitp.menu_item_id = ANY(p_menu_item_ids)
      AND mitp.is_active = true
      AND mitp.deleted_at IS NULL
      AND tp.is_active = true
      AND tp.deleted_at IS NULL
  ),
  aggregated_rates AS (
    SELECT 
      tr.tax_profile_id,
      COALESCE(SUM(tr.rate_basis_points)::INT, 0) AS total_basis_points
    FROM public.tax_rates tr
    WHERE tr.tenant_id = p_tenant_id
      AND tr.is_active = true
      AND tr.deleted_at IS NULL
      AND tr.effective_from <= p_effective_at
      AND (tr.effective_to IS NULL OR tr.effective_to > p_effective_at)
    GROUP BY tr.tax_profile_id
  )
  SELECT 
    ip.menu_item_id,
    ip.tax_profile_id,
    ip.calculation_mode,
    COALESCE(ar.total_basis_points, 0) AS total_basis_points
  FROM item_profiles ip
  LEFT JOIN aggregated_rates ar ON ip.tax_profile_id = ar.tax_profile_id;
END;
$$ LANGUAGE plpgsql STABLE;


COMMIT;
