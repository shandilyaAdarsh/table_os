-- ============================================================
-- Migration: 20260518000003_core_tax_engine
-- Replaces old float-based tax system with integer basis-points
-- append-only historical tax strategy.
--
-- HARDENING CHANGELOG (production hardening pass):
--   [1] Removed CASCADE from legacy DROP statements — explicit teardown only
--   [2] Removed permissive authenticated_access_* RLS policies
--   [3] Added `priority` to immutable financial fields in trigger
--   [4] Refactored overlap constraint — v1 single-rate model: one active
--       effective rate per (tenant_id, tax_profile_id) per time window
--   [5] Added deterministic ORDER BY to both RPC resolvers
--   [6] Corrected architecture comments: v1 = single-rate model;
--       SUM retained for forward compatibility only
--   [7] OCC (version_num WHERE + increment) enforced in repository layer
--   [8] Immutability trigger upgraded to SQLSTATE-aware RAISE EXCEPTION USING
-- ============================================================

BEGIN;

-- ============================================================
-- SECTION 1: Teardown of legacy tax tables
-- ============================================================
-- IMPORTANT (pre-production only):
--   These tables/columns are from the old float-based tax_groups / tax_rates schema.
--   In a live environment, DROP TABLE must be replaced with a proper
--   column-by-column migration + data archival step.
--   We intentionally avoid CASCADE: every FK dependency is resolved
--   explicitly in correct dependency order to prevent silent destruction
--   of unrelated objects.
--
--   Since this project is pre-production, we perform a clean slate reset.
--   Re-evaluate this section before any production deployment.
-- ============================================================

-- Step 1: Drop FK constraints that reference tax_groups on dependent tables.
--         These must come first — they are the reason a plain DROP TABLE fails
--         without CASCADE. Explicit drops make the dependency graph visible.
ALTER TABLE IF EXISTS public.menu_items
  DROP CONSTRAINT IF EXISTS fk_menu_items_tax_group;

ALTER TABLE IF EXISTS public.branch_menu_item_overrides
  DROP CONSTRAINT IF EXISTS fk_branch_item_override_tax_group;

-- Step 2: Drop the old tax_rates table (it has its own FK into tax_groups).
--         Now safe because tax_groups has no remaining FK dependents.
DROP TABLE IF EXISTS public.tax_rates;

-- Step 3: Drop the old tax_groups table.
DROP TABLE IF EXISTS public.tax_groups;

-- Note: tax_group_id columns on menu_items and branch_menu_item_overrides are
--       intentionally left in place. They are now FK-orphaned nullable columns.
--       The new tax engine uses menu_item_tax_profiles for item ↔ profile mapping.
--       Those legacy columns can be dropped in a dedicated cleanup migration once
--       the application layer no longer references them.

-- ============================================================
-- SECTION 2: Enum type
-- ============================================================

DO $$ BEGIN
  CREATE TYPE public.tax_calculation_mode AS ENUM ('inclusive', 'exclusive');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- SECTION 3: tax_profiles
-- ============================================================

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
  -- OCC: all updates must present current version_num and increment it atomically
  version_num      INT NOT NULL DEFAULT 1,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at       TIMESTAMPTZ,

  CONSTRAINT chk_tax_profiles_priority CHECK (priority >= 0 AND priority <= 1000)
);

CREATE INDEX idx_tax_profiles_tenant_id
  ON public.tax_profiles(tenant_id)
  WHERE deleted_at IS NULL;

CREATE TRIGGER set_tax_profiles_updated_at
  BEFORE UPDATE ON public.tax_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- SECTION 4: tax_rates (append-only, immutable financial history)
-- ============================================================

CREATE TABLE public.tax_rates (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  -- ON DELETE RESTRICT preserves append-only financial history even if the
  -- parent profile is logically deleted (soft-delete expected instead).
  tax_profile_id     UUID NOT NULL REFERENCES public.tax_profiles(id) ON DELETE RESTRICT,
  name               TEXT NOT NULL,
  rate_basis_points  INT NOT NULL,       -- e.g. 500 = 5.00%
  priority           INT NOT NULL DEFAULT 100,
  effective_from     TIMESTAMPTZ NOT NULL DEFAULT now(),
  effective_to       TIMESTAMPTZ,        -- NULL = open-ended / still active
  is_active          BOOLEAN NOT NULL DEFAULT true,
  created_by         UUID REFERENCES public.platform_users(id),
  updated_by         UUID REFERENCES public.platform_users(id),
  -- OCC: all updates must present current version_num and increment it atomically
  version_num        INT NOT NULL DEFAULT 1,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at         TIMESTAMPTZ,

  CONSTRAINT chk_tax_rates_basis_points  CHECK (rate_basis_points >= 0),
  CONSTRAINT chk_tax_rates_priority      CHECK (priority >= 0 AND priority <= 1000),
  CONSTRAINT chk_tax_rates_effective_dates
    CHECK (effective_to IS NULL OR effective_from < effective_to)
);

-- Required for exclusion constraint with tstzrange
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ── Overlap prevention constraint ───────────────────────────
-- HARDENING FIX [4]: V1 SINGLE-RATE MODEL
--
-- Design decision: the v1 tax engine enforces exactly ONE active effective
-- tax rate per (tenant_id, tax_profile_id) per time window.
--
-- Rationale:
--   • Eliminates accidental tax stacking and operational ambiguity.
--   • Enforces a deterministic, predictable single-rate taxation model.
--   • The name column is NOT part of the exclusion key, so even distinctly
--     named rates cannot overlap within the same profile/window.
--
-- Additive multi-rate layering (v2+):
--   When jurisdiction layering or compound rates are needed in a future
--   version, this constraint must be revisited — likely by introducing a
--   tax_rate_components child table or a separate tax_layer abstraction,
--   rather than relaxing this constraint.
--
-- The resolvers still use SUM(rate_basis_points) which is correct and safe:
--   In v1 only one rate matches per window, so SUM == that single rate.
--   SUM is retained explicitly for forward compatibility without resolver change.
ALTER TABLE public.tax_rates ADD CONSTRAINT tax_rates_no_overlap_excl
  EXCLUDE USING gist (
    tenant_id      WITH =,
    tax_profile_id WITH =,
    tstzrange(effective_from, COALESCE(effective_to, 'infinity'::timestamptz), '[)') WITH &&
  ) WHERE (is_active = TRUE AND deleted_at IS NULL);

CREATE INDEX idx_tax_rates_profile
  ON public.tax_rates(tax_profile_id)
  WHERE is_active = true AND deleted_at IS NULL;

CREATE INDEX idx_tax_rates_tenant
  ON public.tax_rates(tenant_id)
  WHERE is_active = true AND deleted_at IS NULL;

CREATE INDEX idx_tax_rates_deleted
  ON public.tax_rates(tenant_id)
  WHERE deleted_at IS NOT NULL;

CREATE TRIGGER set_tax_rates_updated_at
  BEFORE UPDATE ON public.tax_rates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── Immutability trigger ─────────────────────────────────────
-- HARDENING FIX [3]: Added `priority` to protected fields.
-- Priority determines deterministic tax ordering; mutating it post-creation
-- changes the effective tax calculation history retroactively, which violates
-- the append-only financial record contract.
--
-- Protected immutable fields:
--   rate_basis_points — the actual tax percentage
--   effective_from    — the window open boundary
--   effective_to      — the window close boundary
--   tax_profile_id    — the owning profile (structural link)
--   priority          — determines resolver ordering (HARDENING: newly protected)
--   name              — human identity of the rate component
--
-- Allowed mutations on an active rate (via UPDATE):
--   is_active   → set to false to deactivate (must then create a new rate)
--   updated_by  → audit trail
--   version_num → OCC increment
--   updated_at  → maintained by trigger
CREATE OR REPLACE FUNCTION public.prevent_tax_rates_mutation()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.rate_basis_points IS DISTINCT FROM NEW.rate_basis_points OR
     OLD.effective_from    IS DISTINCT FROM NEW.effective_from    OR
     OLD.effective_to      IS DISTINCT FROM NEW.effective_to      OR
     OLD.tax_profile_id    IS DISTINCT FROM NEW.tax_profile_id    OR
     OLD.priority          IS DISTINCT FROM NEW.priority          OR
     OLD.name              IS DISTINCT FROM NEW.name
  THEN
    -- HARDENING FIX [8]: Structured SQLSTATE-aware exception.
    -- ERRCODE P0001 = raise_exception (application-defined error).
    -- Using RAISE ... USING instead of bare RAISE ensures:
    --   • The SQLSTATE code is predictable and catchable in the service layer.
    --   • Message, detail, and hint are independently queryable in pg_exception_*.
    --   • Observability tools (pg_stat_activity, error logs) surface SQLSTATE cleanly.
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'Immutable financial fields cannot be modified on an active tax rate.',
      DETAIL  = 'Attempted mutation on: rate_basis_points, effective_from, effective_to, '
                'tax_profile_id, priority, or name.',
      HINT    = 'Deactivate the existing tax rate and create a new one with the desired values.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger fires only while the rate remains active and non-deleted.
-- Deactivation (is_active → false) itself is permitted and expected.
CREATE TRIGGER enforce_tax_rates_immutability
  BEFORE UPDATE ON public.tax_rates
  FOR EACH ROW
  WHEN (OLD.is_active = true AND NEW.is_active = true AND OLD.deleted_at IS NULL)
  EXECUTE FUNCTION public.prevent_tax_rates_mutation();

-- ============================================================
-- SECTION 5: menu_item_tax_profiles (item ↔ profile mapping)
-- ============================================================

CREATE TABLE public.menu_item_tax_profiles (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  menu_item_id     UUID NOT NULL REFERENCES public.menu_items(id) ON DELETE RESTRICT,
  tax_profile_id   UUID NOT NULL REFERENCES public.tax_profiles(id) ON DELETE RESTRICT,
  is_active        BOOLEAN NOT NULL DEFAULT true,
  created_by       UUID REFERENCES public.platform_users(id),
  updated_by       UUID REFERENCES public.platform_users(id),
  -- OCC: all updates must present current version_num and increment it atomically
  version_num      INT NOT NULL DEFAULT 1,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at       TIMESTAMPTZ
);

-- Partial unique index enforces one active mapping per item per tenant.
-- Using an index (not a table constraint) allows soft-deleted rows to coexist
-- so historical assignment records are preserved for auditing.
CREATE UNIQUE INDEX idx_menu_item_tax_profiles_unique_active
  ON public.menu_item_tax_profiles(tenant_id, menu_item_id)
  WHERE is_active = true AND deleted_at IS NULL;

CREATE INDEX idx_menu_item_tax_profiles_item
  ON public.menu_item_tax_profiles(menu_item_id)
  WHERE is_active = true;

CREATE TRIGGER set_menu_item_tax_profiles_updated_at
  BEFORE UPDATE ON public.menu_item_tax_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- SECTION 6: Row Level Security
-- ============================================================

ALTER TABLE public.tax_profiles         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tax_rates            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_item_tax_profiles ENABLE ROW LEVEL SECURITY;

-- ── tax_profiles ─────────────────────────────────────────────
-- HARDENING FIX [2]: Removed permissive "authenticated_access_tax_profiles"
-- (FOR ALL ... USING (true)) policy. Only restrictive tenant-scoped policies
-- are kept. Any authenticated user not in the correct tenant context is denied.

CREATE POLICY "tenant_isolation_tax_profiles_select"
  ON public.tax_profiles AS RESTRICTIVE FOR SELECT TO authenticated
  USING (tenant_id = (current_setting('app.current_tenant_id', true))::uuid);

CREATE POLICY "tenant_isolation_tax_profiles_insert"
  ON public.tax_profiles AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (tenant_id = (current_setting('app.current_tenant_id', true))::uuid);

CREATE POLICY "tenant_isolation_tax_profiles_update"
  ON public.tax_profiles AS RESTRICTIVE FOR UPDATE TO authenticated
  USING  (tenant_id = (current_setting('app.current_tenant_id', true))::uuid)
  WITH CHECK (tenant_id = (current_setting('app.current_tenant_id', true))::uuid);

CREATE POLICY "tenant_isolation_tax_profiles_delete"
  ON public.tax_profiles AS RESTRICTIVE FOR DELETE TO authenticated
  USING (tenant_id = (current_setting('app.current_tenant_id', true))::uuid);

-- ── tax_rates ─────────────────────────────────────────────────
-- HARDENING FIX [2]: Removed permissive "authenticated_access_tax_rates".

CREATE POLICY "tenant_isolation_tax_rates_select"
  ON public.tax_rates AS RESTRICTIVE FOR SELECT TO authenticated
  USING (tenant_id = (current_setting('app.current_tenant_id', true))::uuid);

CREATE POLICY "tenant_isolation_tax_rates_insert"
  ON public.tax_rates AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (tenant_id = (current_setting('app.current_tenant_id', true))::uuid);

CREATE POLICY "tenant_isolation_tax_rates_update"
  ON public.tax_rates AS RESTRICTIVE FOR UPDATE TO authenticated
  USING  (tenant_id = (current_setting('app.current_tenant_id', true))::uuid)
  WITH CHECK (tenant_id = (current_setting('app.current_tenant_id', true))::uuid);

CREATE POLICY "tenant_isolation_tax_rates_delete"
  ON public.tax_rates AS RESTRICTIVE FOR DELETE TO authenticated
  USING (tenant_id = (current_setting('app.current_tenant_id', true))::uuid);

-- ── menu_item_tax_profiles ────────────────────────────────────
-- HARDENING FIX [2]: Removed permissive "authenticated_access_mitp".

CREATE POLICY "tenant_isolation_mitp_select"
  ON public.menu_item_tax_profiles AS RESTRICTIVE FOR SELECT TO authenticated
  USING (tenant_id = (current_setting('app.current_tenant_id', true))::uuid);

CREATE POLICY "tenant_isolation_mitp_insert"
  ON public.menu_item_tax_profiles AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (tenant_id = (current_setting('app.current_tenant_id', true))::uuid);

CREATE POLICY "tenant_isolation_mitp_update"
  ON public.menu_item_tax_profiles AS RESTRICTIVE FOR UPDATE TO authenticated
  USING  (tenant_id = (current_setting('app.current_tenant_id', true))::uuid)
  WITH CHECK (tenant_id = (current_setting('app.current_tenant_id', true))::uuid);

CREATE POLICY "tenant_isolation_mitp_delete"
  ON public.menu_item_tax_profiles AS RESTRICTIVE FOR DELETE TO authenticated
  USING (tenant_id = (current_setting('app.current_tenant_id', true))::uuid);

-- ============================================================
-- SECTION 7: RPC Resolvers
-- ============================================================

-- ── Single-item resolver ──────────────────────────────────────
-- HARDENING FIX [5]: Added explicit ORDER BY for deterministic output.
-- HARDENING FIX [6]: Architecture clarification — v1 single-rate model.
--
-- ┌─────────────────────────────────────────────────────────────┐
-- │  TAX ENGINE — V1 ARCHITECTURE: SINGLE-RATE MODEL            │
-- ├─────────────────────────────────────────────────────────────┤
-- │  Current behavior (v1):                                      │
-- │    • Exactly ONE active effective tax rate per profile per    │
-- │      time window (enforced by tax_rates_no_overlap_excl).    │
-- │    • SUM(rate_basis_points) == that single rate value.       │
-- │    • Deterministic single-rate taxation — no stacking,       │
-- │      no compounding, no jurisdiction sequencing.             │
-- │    • SUM is used (not MAX/FIRST) for forward compatibility:  │
-- │      the resolver body does not need to change when v2       │
-- │      introduces layered rates via a child table.             │
-- │                                                              │
-- │  NOT supported in v1 (reserved for future engine evolution): │
-- │    • Additive multi-component layering                       │
-- │    • Compounding (tax-on-tax) behavior                       │
-- │    • Jurisdiction sequencing or ordered tax execution        │
-- │    • Simultaneous overlapping active rates per profile       │
-- └─────────────────────────────────────────────────────────────┘
CREATE OR REPLACE FUNCTION public.resolve_tax_for_menu_item(
  p_tenant_id    UUID,
  p_menu_item_id UUID,
  p_effective_at TIMESTAMPTZ DEFAULT now()
)
RETURNS TABLE (
  tax_profile_id   UUID,
  calculation_mode public.tax_calculation_mode,
  total_basis_points INT
) AS $$
DECLARE
  v_tax_profile_id   UUID;
  v_calculation_mode public.tax_calculation_mode;
  v_total_bp         INT;
BEGIN
  -- Step 1: Resolve the active tax profile for this item.
  -- ORDER BY ensures determinism: highest-priority profile wins.
  -- If the partial unique index (is_active + deleted_at) is correctly enforced,
  -- only one row should ever match; ORDER BY makes this safe if it does not.
  SELECT tp.id, tp.calculation_mode
  INTO   v_tax_profile_id, v_calculation_mode
  FROM   public.menu_item_tax_profiles mitp
  JOIN   public.tax_profiles tp ON mitp.tax_profile_id = tp.id
  WHERE  mitp.tenant_id   = p_tenant_id
    AND  mitp.menu_item_id = p_menu_item_id
    AND  mitp.is_active    = true
    AND  mitp.deleted_at   IS NULL
    AND  tp.is_active      = true
    AND  tp.deleted_at     IS NULL
  ORDER BY tp.priority DESC, tp.created_at DESC, tp.id DESC
  LIMIT 1;

  IF v_tax_profile_id IS NULL THEN
    RETURN; -- No active tax profile mapped to this item
  END IF;

  -- Step 2: Sum all active, in-window tax rates (additive aggregation).
  -- Current model: taxes are additive (no compounding). See architecture note above.
  SELECT COALESCE(SUM(tr.rate_basis_points), 0)
  INTO   v_total_bp
  FROM   public.tax_rates tr
  WHERE  tr.tenant_id      = p_tenant_id
    AND  tr.tax_profile_id = v_tax_profile_id
    AND  tr.is_active      = true
    AND  tr.deleted_at     IS NULL
    AND  tr.effective_from <= p_effective_at
    AND  (tr.effective_to IS NULL OR tr.effective_to > p_effective_at);

  RETURN QUERY SELECT v_tax_profile_id, v_calculation_mode, v_total_bp;
END;
$$ LANGUAGE plpgsql STABLE;

-- ── Batch resolver ────────────────────────────────────────────
-- Resolves taxes for multiple menu items in a single query (prevents N+1).
-- HARDENING FIX [5]: ORDER BY for deterministic output.
-- HARDENING FIX [6]: Architecture comment aligned to v1 single-rate model.
--
-- V1 single-rate aggregation note (mirrors single-item resolver):
--   In v1 the overlap constraint guarantees at most one in-window active rate
--   per profile, so SUM(rate_basis_points) returns that single rate's value.
--   SUM is used intentionally (not LIMIT 1) so that the v2 upgrade path
--   (multiple rate components per profile) requires no resolver change.
--   No compounding. No jurisdiction sequencing. No simultaneous multi-rates.
CREATE OR REPLACE FUNCTION public.resolve_tax_for_menu_items_batch(
  p_tenant_id      UUID,
  p_menu_item_ids  UUID[],
  p_effective_at   TIMESTAMPTZ DEFAULT now()
)
RETURNS TABLE (
  menu_item_id       UUID,
  tax_profile_id     UUID,
  calculation_mode   public.tax_calculation_mode,
  total_basis_points INT
) AS $$
BEGIN
  RETURN QUERY
  WITH item_profiles AS (
    -- One row per menu item: the highest-priority active profile.
    -- DISTINCT ON + ORDER BY guarantees determinism if there are multiple
    -- competing profiles (defensive: should not happen due to unique index).
    SELECT DISTINCT ON (mitp.menu_item_id)
      mitp.menu_item_id,
      tp.id              AS tax_profile_id,
      tp.calculation_mode
    FROM  public.menu_item_tax_profiles mitp
    JOIN  public.tax_profiles tp ON mitp.tax_profile_id = tp.id
    WHERE mitp.tenant_id         = p_tenant_id
      AND mitp.menu_item_id      = ANY(p_menu_item_ids)
      AND mitp.is_active         = true
      AND mitp.deleted_at        IS NULL
      AND tp.is_active           = true
      AND tp.deleted_at          IS NULL
    ORDER BY mitp.menu_item_id, tp.priority DESC, tp.created_at DESC, tp.id DESC
  ),
  aggregated_rates AS (
    -- Additive aggregation: simple SUM of basis points per profile.
    -- Future: replace with ordered-execution CTE for compounding tax support.
    SELECT
      tr.tax_profile_id,
      COALESCE(SUM(tr.rate_basis_points)::INT, 0) AS total_basis_points
    FROM  public.tax_rates tr
    WHERE tr.tenant_id      = p_tenant_id
      AND tr.is_active      = true
      AND tr.deleted_at     IS NULL
      AND tr.effective_from <= p_effective_at
      AND (tr.effective_to IS NULL OR tr.effective_to > p_effective_at)
    GROUP BY tr.tax_profile_id
  )
  SELECT
    ip.menu_item_id,
    ip.tax_profile_id,
    ip.calculation_mode,
    COALESCE(ar.total_basis_points, 0)::INT AS total_basis_points
  FROM  item_profiles ip
  LEFT JOIN aggregated_rates ar ON ip.tax_profile_id = ar.tax_profile_id
  -- HARDENING FIX [5]: Deterministic output ordering for batch results
  ORDER BY ip.menu_item_id;

END;
$$ LANGUAGE plpgsql STABLE;

COMMIT;
