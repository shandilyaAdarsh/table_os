-- ============================================================
-- Migration: 20260518000006_branch_override_system.sql
-- Production-grade Branch Override System for Orderlli.
-- ============================================================

BEGIN;

-- Enable btree_gist extension (should already be enabled, but ensure it is active for exclusion constraints)
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ─── SECTION 2: CREATE OVERRIDE TABLES ──────────────────────────

-- 1. branch_menu_item_overrides: Branch item visibility overrides
CREATE TABLE IF NOT EXISTS public.branch_menu_item_overrides (
  id             UUID                     PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID                     NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  branch_id      UUID                     NOT NULL REFERENCES public.branches(id) ON DELETE RESTRICT,
  menu_item_id   UUID                     NOT NULL REFERENCES public.menu_items(id) ON DELETE RESTRICT,
  is_visible     BOOLEAN                  NOT NULL DEFAULT true,

  -- OCC + Audit
  version_num    INT                      NOT NULL DEFAULT 1,
  created_by     UUID                     REFERENCES public.platform_users(id) ON DELETE SET NULL,
  updated_by     UUID                     REFERENCES public.platform_users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ              NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ              NOT NULL DEFAULT now(),
  deleted_at     TIMESTAMPTZ,

  -- Constraints
  CONSTRAINT fk_branch_item_override_branch FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE RESTRICT,
  CONSTRAINT fk_branch_item_override_item FOREIGN KEY (menu_item_id) REFERENCES public.menu_items(id) ON DELETE RESTRICT
);

-- Partial Unique Index to enforce one active override per item per branch
CREATE UNIQUE INDEX IF NOT EXISTS idx_branch_menu_item_overrides_unique_active
  ON public.branch_menu_item_overrides(tenant_id, branch_id, menu_item_id)
  WHERE (deleted_at IS NULL);

-- 2. branch_category_overrides: Branch category visibility overrides
CREATE TABLE IF NOT EXISTS public.branch_category_overrides (
  id             UUID                     PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID                     NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  branch_id      UUID                     NOT NULL REFERENCES public.branches(id) ON DELETE RESTRICT,
  category_id    UUID                     NOT NULL REFERENCES public.menu_categories(id) ON DELETE RESTRICT,
  is_visible     BOOLEAN                  NOT NULL DEFAULT true,

  -- OCC + Audit
  version_num    INT                      NOT NULL DEFAULT 1,
  created_by     UUID                     REFERENCES public.platform_users(id) ON DELETE SET NULL,
  updated_by     UUID                     REFERENCES public.platform_users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ              NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ              NOT NULL DEFAULT now(),
  deleted_at     TIMESTAMPTZ,

  -- Constraints
  CONSTRAINT fk_branch_cat_override_branch FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE RESTRICT,
  CONSTRAINT fk_branch_cat_override_category FOREIGN KEY (category_id) REFERENCES public.menu_categories(id) ON DELETE RESTRICT
);

-- Partial Unique Index to enforce one active override per category per branch
CREATE UNIQUE INDEX IF NOT EXISTS idx_branch_category_overrides_unique_active
  ON public.branch_category_overrides(tenant_id, branch_id, category_id)
  WHERE (deleted_at IS NULL);

-- 3a. branch_modifier_group_overrides: Branch modifier group availability overrides
CREATE TABLE IF NOT EXISTS public.branch_modifier_group_overrides (
  id                 UUID                     PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          UUID                     NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  branch_id          UUID                     NOT NULL REFERENCES public.branches(id) ON DELETE RESTRICT,
  modifier_group_id  UUID                     NOT NULL REFERENCES public.modifier_groups(id) ON DELETE RESTRICT,
  is_available       BOOLEAN                  NOT NULL DEFAULT true,

  -- OCC + Audit
  version_num        INT                      NOT NULL DEFAULT 1,
  created_by         UUID                     REFERENCES public.platform_users(id) ON DELETE SET NULL,
  updated_by         UUID                     REFERENCES public.platform_users(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ              NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ              NOT NULL DEFAULT now(),
  deleted_at         TIMESTAMPTZ,

  -- Constraints
  CONSTRAINT fk_branch_mod_group_override_branch FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE RESTRICT,
  CONSTRAINT fk_branch_mod_group_override_group FOREIGN KEY (modifier_group_id) REFERENCES public.modifier_groups(id) ON DELETE RESTRICT
);

-- Unique index to enforce one active override per modifier group per branch
CREATE UNIQUE INDEX IF NOT EXISTS idx_branch_modifier_group_overrides_unique_active
  ON public.branch_modifier_group_overrides(tenant_id, branch_id, modifier_group_id)
  WHERE (deleted_at IS NULL);

-- 3b. branch_modifier_option_overrides: Branch modifier option availability overrides
CREATE TABLE IF NOT EXISTS public.branch_modifier_option_overrides (
  id                 UUID                     PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          UUID                     NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  branch_id          UUID                     NOT NULL REFERENCES public.branches(id) ON DELETE RESTRICT,
  modifier_option_id UUID                     NOT NULL REFERENCES public.modifier_options(id) ON DELETE RESTRICT,
  is_available       BOOLEAN                  NOT NULL DEFAULT true,

  -- OCC + Audit
  version_num        INT                      NOT NULL DEFAULT 1,
  created_by         UUID                     REFERENCES public.platform_users(id) ON DELETE SET NULL,
  updated_by         UUID                     REFERENCES public.platform_users(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ              NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ              NOT NULL DEFAULT now(),
  deleted_at         TIMESTAMPTZ,

  -- Constraints
  CONSTRAINT fk_branch_mod_option_override_branch FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE RESTRICT,
  CONSTRAINT fk_branch_mod_option_override_option FOREIGN KEY (modifier_option_id) REFERENCES public.modifier_options(id) ON DELETE RESTRICT
);

-- Unique index to enforce one active override per modifier option per branch
CREATE UNIQUE INDEX IF NOT EXISTS idx_branch_modifier_option_overrides_unique_active
  ON public.branch_modifier_option_overrides(tenant_id, branch_id, modifier_option_id)
  WHERE (deleted_at IS NULL);

-- 4. branch_price_overrides: Branch pricing overrides
CREATE TABLE IF NOT EXISTS public.branch_price_overrides (
  id             UUID                     PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID                     NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  branch_id      UUID                     NOT NULL REFERENCES public.branches(id) ON DELETE RESTRICT,
  menu_item_id   UUID                     NOT NULL REFERENCES public.menu_items(id) ON DELETE RESTRICT,
  
  -- Price details (BIGINT minor units, e.g., cents, same currency code as base price)
  price_minor    BIGINT                   NOT NULL,
  currency       CHAR(3)                  NOT NULL DEFAULT 'USD',
  
  -- Effective time window
  starts_at      TIMESTAMPTZ              NOT NULL DEFAULT now(),
  ends_at        TIMESTAMPTZ,

  -- OCC + Audit
  version_num    INT                      NOT NULL DEFAULT 1,
  created_by     UUID                     REFERENCES public.platform_users(id) ON DELETE SET NULL,
  updated_by     UUID                     REFERENCES public.platform_users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ              NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ              NOT NULL DEFAULT now(),
  deleted_at     TIMESTAMPTZ,

  -- Constraints
  CONSTRAINT fk_branch_price_override_branch FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE RESTRICT,
  CONSTRAINT fk_branch_price_override_item FOREIGN KEY (menu_item_id) REFERENCES public.menu_items(id) ON DELETE RESTRICT,
  CONSTRAINT chk_branch_price_override_price CHECK (price_minor >= 0),
  CONSTRAINT chk_branch_price_override_window CHECK (ends_at IS NULL OR ends_at > starts_at)
);

-- Exclusion constraint to prevent overlapping active branch pricing windows of the same currency
-- Enforce a half-open interval boundary '[)'
ALTER TABLE public.branch_price_overrides DROP CONSTRAINT IF EXISTS branch_price_overrides_overlap_excl;
ALTER TABLE public.branch_price_overrides ADD CONSTRAINT branch_price_overrides_overlap_excl EXCLUDE USING gist (
  tenant_id WITH =,
  branch_id WITH =,
  menu_item_id WITH =,
  currency WITH =,
  tstzrange(starts_at, COALESCE(ends_at, 'infinity'::timestamptz), '[)') WITH &&
) WHERE (deleted_at IS NULL);


-- ─── SECTION 3: INDEXES ─────────────────────────────────────────

-- branch_menu_item_overrides indexes
CREATE INDEX IF NOT EXISTS idx_branch_menu_item_overrides_branch_active ON public.branch_menu_item_overrides(tenant_id, branch_id) WHERE (deleted_at IS NULL);
CREATE INDEX IF NOT EXISTS idx_branch_menu_item_overrides_item ON public.branch_menu_item_overrides(tenant_id, menu_item_id) WHERE (deleted_at IS NULL);
CREATE INDEX IF NOT EXISTS idx_branch_menu_item_overrides_deleted ON public.branch_menu_item_overrides(tenant_id, deleted_at) WHERE (deleted_at IS NOT NULL);

-- branch_category_overrides indexes
CREATE INDEX IF NOT EXISTS idx_branch_category_overrides_branch_active ON public.branch_category_overrides(tenant_id, branch_id) WHERE (deleted_at IS NULL);
CREATE INDEX IF NOT EXISTS idx_branch_category_overrides_cat ON public.branch_category_overrides(tenant_id, category_id) WHERE (deleted_at IS NULL);
CREATE INDEX IF NOT EXISTS idx_branch_category_overrides_deleted ON public.branch_category_overrides(tenant_id, deleted_at) WHERE (deleted_at IS NOT NULL);

-- branch_modifier_group_overrides indexes
CREATE INDEX IF NOT EXISTS idx_branch_modifier_group_overrides_branch_active ON public.branch_modifier_group_overrides(tenant_id, branch_id) WHERE (deleted_at IS NULL);
CREATE INDEX IF NOT EXISTS idx_branch_modifier_group_overrides_group ON public.branch_modifier_group_overrides(tenant_id, modifier_group_id) WHERE (deleted_at IS NULL);
CREATE INDEX IF NOT EXISTS idx_branch_modifier_group_overrides_deleted ON public.branch_modifier_group_overrides(tenant_id, deleted_at) WHERE (deleted_at IS NOT NULL);

-- branch_modifier_option_overrides indexes
CREATE INDEX IF NOT EXISTS idx_branch_modifier_option_overrides_branch_active ON public.branch_modifier_option_overrides(tenant_id, branch_id) WHERE (deleted_at IS NULL);
CREATE INDEX IF NOT EXISTS idx_branch_modifier_option_overrides_option ON public.branch_modifier_option_overrides(tenant_id, modifier_option_id) WHERE (deleted_at IS NULL);
CREATE INDEX IF NOT EXISTS idx_branch_modifier_option_overrides_deleted ON public.branch_modifier_option_overrides(tenant_id, deleted_at) WHERE (deleted_at IS NOT NULL);

-- branch_price_overrides indexes
CREATE INDEX IF NOT EXISTS idx_branch_price_overrides_branch_active ON public.branch_price_overrides(tenant_id, branch_id) WHERE (deleted_at IS NULL);
CREATE INDEX IF NOT EXISTS idx_branch_price_overrides_item ON public.branch_price_overrides(tenant_id, menu_item_id) WHERE (deleted_at IS NULL);
CREATE INDEX IF NOT EXISTS idx_branch_price_overrides_window ON public.branch_price_overrides(tenant_id, starts_at, ends_at) WHERE (deleted_at IS NULL);
CREATE INDEX IF NOT EXISTS idx_branch_price_overrides_deleted ON public.branch_price_overrides(tenant_id, deleted_at) WHERE (deleted_at IS NOT NULL);


-- ─── SECTION 4: AUDIT TRIGGERS ──────────────────────────────────
-- Set updated_at on all tables

DROP TRIGGER IF EXISTS handle_branch_menu_item_overrides_updated_at ON public.branch_menu_item_overrides;
CREATE TRIGGER handle_branch_menu_item_overrides_updated_at
  BEFORE UPDATE ON public.branch_menu_item_overrides
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS handle_branch_category_overrides_updated_at ON public.branch_category_overrides;
CREATE TRIGGER handle_branch_category_overrides_updated_at
  BEFORE UPDATE ON public.branch_category_overrides
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS handle_branch_modifier_group_overrides_updated_at ON public.branch_modifier_group_overrides;
CREATE TRIGGER handle_branch_modifier_group_overrides_updated_at
  BEFORE UPDATE ON public.branch_modifier_group_overrides
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS handle_branch_modifier_option_overrides_updated_at ON public.branch_modifier_option_overrides;
CREATE TRIGGER handle_branch_modifier_option_overrides_updated_at
  BEFORE UPDATE ON public.branch_modifier_option_overrides
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS handle_branch_price_overrides_updated_at ON public.branch_price_overrides;
CREATE TRIGGER handle_branch_price_overrides_updated_at
  BEFORE UPDATE ON public.branch_price_overrides
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ─── SECTION 5: IMMUTABILITY GUARDS ─────────────────────────────
-- Prevent mutation of core identifiers after creation to guarantee referential sanity

CREATE OR REPLACE FUNCTION public.prevent_branch_overrides_immutability_violation()
RETURNS trigger AS $$
BEGIN
  -- Immutable fields for all override tables
  IF OLD.tenant_id IS DISTINCT FROM NEW.tenant_id OR
     OLD.branch_id IS DISTINCT FROM NEW.branch_id OR
     OLD.created_by IS DISTINCT FROM NEW.created_by THEN
    RAISE EXCEPTION 'Immutable core scope fields (tenant_id, branch_id, created_by) cannot be modified.'
      USING ERRCODE = '42501';
  END IF;

  -- Table-specific immutability targets
  IF TG_TABLE_NAME = 'branch_menu_item_overrides' THEN
    IF OLD.menu_item_id IS DISTINCT FROM NEW.menu_item_id THEN
      RAISE EXCEPTION 'Immutable field (menu_item_id) cannot be modified.' USING ERRCODE = '42501';
    END IF;
  ELSIF TG_TABLE_NAME = 'branch_category_overrides' THEN
    IF OLD.category_id IS DISTINCT FROM NEW.category_id THEN
      RAISE EXCEPTION 'Immutable field (category_id) cannot be modified.' USING ERRCODE = '42501';
    END IF;
  ELSIF TG_TABLE_NAME = 'branch_modifier_group_overrides' THEN
    IF OLD.modifier_group_id IS DISTINCT FROM NEW.modifier_group_id THEN
      RAISE EXCEPTION 'Immutable field (modifier_group_id) cannot be modified.' USING ERRCODE = '42501';
    END IF;
  ELSIF TG_TABLE_NAME = 'branch_modifier_option_overrides' THEN
    IF OLD.modifier_option_id IS DISTINCT FROM NEW.modifier_option_id THEN
      RAISE EXCEPTION 'Immutable field (modifier_option_id) cannot be modified.' USING ERRCODE = '42501';
    END IF;
  ELSIF TG_TABLE_NAME = 'branch_price_overrides' THEN
    IF OLD.menu_item_id IS DISTINCT FROM NEW.menu_item_id OR
       OLD.currency IS DISTINCT FROM NEW.currency OR
       OLD.starts_at IS DISTINCT FROM NEW.starts_at THEN
      RAISE EXCEPTION 'Immutable pricing override fields (menu_item_id, currency, starts_at) cannot be modified.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply triggers

DROP TRIGGER IF EXISTS enforce_branch_item_override_immutability ON public.branch_menu_item_overrides;
CREATE TRIGGER enforce_branch_item_override_immutability
  BEFORE UPDATE ON public.branch_menu_item_overrides
  FOR EACH ROW EXECUTE FUNCTION public.prevent_branch_overrides_immutability_violation();

DROP TRIGGER IF EXISTS enforce_branch_cat_override_immutability ON public.branch_category_overrides;
CREATE TRIGGER enforce_branch_cat_override_immutability
  BEFORE UPDATE ON public.branch_category_overrides
  FOR EACH ROW EXECUTE FUNCTION public.prevent_branch_overrides_immutability_violation();

DROP TRIGGER IF EXISTS enforce_branch_modifier_group_override_immutability ON public.branch_modifier_group_overrides;
CREATE TRIGGER enforce_branch_modifier_group_override_immutability
  BEFORE UPDATE ON public.branch_modifier_group_overrides
  FOR EACH ROW EXECUTE FUNCTION public.prevent_branch_overrides_immutability_violation();

DROP TRIGGER IF EXISTS enforce_branch_modifier_option_override_immutability ON public.branch_modifier_option_overrides;
CREATE TRIGGER enforce_branch_modifier_option_override_immutability
  BEFORE UPDATE ON public.branch_modifier_option_overrides
  FOR EACH ROW EXECUTE FUNCTION public.prevent_branch_overrides_immutability_violation();

DROP TRIGGER IF EXISTS enforce_branch_price_override_immutability ON public.branch_price_overrides;
CREATE TRIGGER enforce_branch_price_override_immutability
  BEFORE UPDATE ON public.branch_price_overrides
  FOR EACH ROW EXECUTE FUNCTION public.prevent_branch_overrides_immutability_violation();


-- ─── SECTION 6: BRANCH OWNERSHIP VALIDATION TRIGGERS ─────────────────

CREATE OR REPLACE FUNCTION public.validate_branch_override_ownership()
RETURNS trigger AS $$
DECLARE
  branch_tenant_id UUID;
  target_tenant_id UUID;
BEGIN
  -- Performance Optimization: Skip all SELECT lookups on UPDATE operations
  -- when none of the critical scopes or identifying fields have changed.
  -- Since immutability triggers (Section 5) already prevent modifying tenant_id,
  -- branch_id, created_by, and target_ids, we can safely assume referential integrity.
  IF TG_OP = 'UPDATE' THEN
    IF OLD.branch_id = NEW.branch_id AND OLD.tenant_id = NEW.tenant_id THEN
      IF TG_TABLE_NAME = 'branch_menu_item_overrides' AND OLD.menu_item_id = NEW.menu_item_id THEN
        RETURN NEW;
      ELSIF TG_TABLE_NAME = 'branch_category_overrides' AND OLD.category_id = NEW.category_id THEN
        RETURN NEW;
      ELSIF TG_TABLE_NAME = 'branch_modifier_group_overrides' AND OLD.modifier_group_id = NEW.modifier_group_id THEN
        RETURN NEW;
      ELSIF TG_TABLE_NAME = 'branch_modifier_option_overrides' AND OLD.modifier_option_id = NEW.modifier_option_id THEN
        RETURN NEW;
      ELSIF TG_TABLE_NAME = 'branch_price_overrides' AND OLD.menu_item_id = NEW.menu_item_id THEN
        RETURN NEW;
      END IF;
    END IF;
  END IF;

  -- 1. Get branch tenant_id
  -- Performance note: This query is fully index-supported using the public.branches PRIMARY KEY (id) index (B-Tree).
  -- It avoids sequential scans entirely, guaranteeing deterministic O(1) primary key resolution.
  SELECT tenant_id INTO branch_tenant_id
  FROM public.branches
  WHERE id = NEW.branch_id;
  
  IF branch_tenant_id IS NULL OR branch_tenant_id <> NEW.tenant_id THEN
    RAISE EXCEPTION 'Branch tenant ownership mismatch' USING ERRCODE = '42501';
  END IF;

  -- 2. Get target tenant_id based on TG_TABLE_NAME
  -- Performance note: Every query below is fully index-supported using the target table's PRIMARY KEY (id) index.
  -- This ensures instant execution using the B-Tree primary index and completely prevents any full-table/sequential scans.
  IF TG_TABLE_NAME = 'branch_menu_item_overrides' THEN
    SELECT tenant_id INTO target_tenant_id
    FROM public.menu_items
    WHERE id = NEW.menu_item_id;
  ELSIF TG_TABLE_NAME = 'branch_category_overrides' THEN
    SELECT tenant_id INTO target_tenant_id
    FROM public.menu_categories
    WHERE id = NEW.category_id;
  ELSIF TG_TABLE_NAME = 'branch_modifier_group_overrides' THEN
    SELECT tenant_id INTO target_tenant_id
    FROM public.modifier_groups
    WHERE id = NEW.modifier_group_id;
  ELSIF TG_TABLE_NAME = 'branch_modifier_option_overrides' THEN
    SELECT tenant_id INTO target_tenant_id
    FROM public.modifier_options
    WHERE id = NEW.modifier_option_id;
  ELSIF TG_TABLE_NAME = 'branch_price_overrides' THEN
    SELECT tenant_id INTO target_tenant_id
    FROM public.menu_items
    WHERE id = NEW.menu_item_id;
  END IF;

  IF target_tenant_id IS NULL OR target_tenant_id <> NEW.tenant_id THEN
    RAISE EXCEPTION 'Target entity tenant ownership mismatch' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply ownership triggers

DROP TRIGGER IF EXISTS validate_branch_item_override_ownership ON public.branch_menu_item_overrides;
CREATE TRIGGER validate_branch_item_override_ownership
  BEFORE INSERT OR UPDATE ON public.branch_menu_item_overrides
  FOR EACH ROW EXECUTE FUNCTION public.validate_branch_override_ownership();

DROP TRIGGER IF EXISTS validate_branch_cat_override_ownership ON public.branch_category_overrides;
CREATE TRIGGER validate_branch_cat_override_ownership
  BEFORE INSERT OR UPDATE ON public.branch_category_overrides
  FOR EACH ROW EXECUTE FUNCTION public.validate_branch_override_ownership();

DROP TRIGGER IF EXISTS validate_branch_modifier_group_override_ownership ON public.branch_modifier_group_overrides;
CREATE TRIGGER validate_branch_modifier_group_override_ownership
  BEFORE INSERT OR UPDATE ON public.branch_modifier_group_overrides
  FOR EACH ROW EXECUTE FUNCTION public.validate_branch_override_ownership();

DROP TRIGGER IF EXISTS validate_branch_modifier_option_override_ownership ON public.branch_modifier_option_overrides;
CREATE TRIGGER validate_branch_modifier_option_override_ownership
  BEFORE INSERT OR UPDATE ON public.branch_modifier_option_overrides
  FOR EACH ROW EXECUTE FUNCTION public.validate_branch_override_ownership();

DROP TRIGGER IF EXISTS validate_branch_price_override_ownership ON public.branch_price_overrides;
CREATE TRIGGER validate_branch_price_override_ownership
  BEFORE INSERT OR UPDATE ON public.branch_price_overrides
  FOR EACH ROW EXECUTE FUNCTION public.validate_branch_override_ownership();


-- ─── SECTION 7: ROW-LEVEL SECURITY (RLS) POLICIES ────────────────

ALTER TABLE public.branch_menu_item_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branch_category_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branch_modifier_group_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branch_modifier_option_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branch_price_overrides ENABLE ROW LEVEL SECURITY;

-- 1. branch_menu_item_overrides RLS
DROP POLICY IF EXISTS tenant_isolation_restrictive ON public.branch_menu_item_overrides;
DROP POLICY IF EXISTS branch_menu_item_overrides_tenant_isolation ON public.branch_menu_item_overrides;
CREATE POLICY branch_menu_item_overrides_tenant_isolation ON public.branch_menu_item_overrides
  AS RESTRICTIVE
  USING (tenant_id = (current_setting('app.current_tenant_id'::text))::uuid)
  WITH CHECK (tenant_id = (current_setting('app.current_tenant_id'::text))::uuid);

DROP POLICY IF EXISTS authenticated_access ON public.branch_menu_item_overrides;
DROP POLICY IF EXISTS branch_menu_item_overrides_authenticated_access ON public.branch_menu_item_overrides;
CREATE POLICY branch_menu_item_overrides_authenticated_access ON public.branch_menu_item_overrides
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- 2. branch_category_overrides RLS
DROP POLICY IF EXISTS tenant_isolation_restrictive ON public.branch_category_overrides;
DROP POLICY IF EXISTS branch_category_overrides_tenant_isolation ON public.branch_category_overrides;
CREATE POLICY branch_category_overrides_tenant_isolation ON public.branch_category_overrides
  AS RESTRICTIVE
  USING (tenant_id = (current_setting('app.current_tenant_id'::text))::uuid)
  WITH CHECK (tenant_id = (current_setting('app.current_tenant_id'::text))::uuid);

DROP POLICY IF EXISTS authenticated_access ON public.branch_category_overrides;
DROP POLICY IF EXISTS branch_category_overrides_authenticated_access ON public.branch_category_overrides;
CREATE POLICY branch_category_overrides_authenticated_access ON public.branch_category_overrides
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- 3. branch_modifier_group_overrides RLS
DROP POLICY IF EXISTS tenant_isolation_restrictive ON public.branch_modifier_group_overrides;
DROP POLICY IF EXISTS branch_modifier_group_overrides_tenant_isolation ON public.branch_modifier_group_overrides;
CREATE POLICY branch_modifier_group_overrides_tenant_isolation ON public.branch_modifier_group_overrides
  AS RESTRICTIVE
  USING (tenant_id = (current_setting('app.current_tenant_id'::text))::uuid)
  WITH CHECK (tenant_id = (current_setting('app.current_tenant_id'::text))::uuid);

DROP POLICY IF EXISTS authenticated_access ON public.branch_modifier_group_overrides;
DROP POLICY IF EXISTS branch_modifier_group_overrides_authenticated_access ON public.branch_modifier_group_overrides;
CREATE POLICY branch_modifier_group_overrides_authenticated_access ON public.branch_modifier_group_overrides
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- 4. branch_modifier_option_overrides RLS
DROP POLICY IF EXISTS tenant_isolation_restrictive ON public.branch_modifier_option_overrides;
DROP POLICY IF EXISTS branch_modifier_option_overrides_tenant_isolation ON public.branch_modifier_option_overrides;
CREATE POLICY branch_modifier_option_overrides_tenant_isolation ON public.branch_modifier_option_overrides
  AS RESTRICTIVE
  USING (tenant_id = (current_setting('app.current_tenant_id'::text))::uuid)
  WITH CHECK (tenant_id = (current_setting('app.current_tenant_id'::text))::uuid);

DROP POLICY IF EXISTS authenticated_access ON public.branch_modifier_option_overrides;
DROP POLICY IF EXISTS branch_modifier_option_overrides_authenticated_access ON public.branch_modifier_option_overrides;
CREATE POLICY branch_modifier_option_overrides_authenticated_access ON public.branch_modifier_option_overrides
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- 5. branch_price_overrides RLS
DROP POLICY IF EXISTS tenant_isolation_restrictive ON public.branch_price_overrides;
DROP POLICY IF EXISTS branch_price_overrides_tenant_isolation ON public.branch_price_overrides;
CREATE POLICY branch_price_overrides_tenant_isolation ON public.branch_price_overrides
  AS RESTRICTIVE
  USING (tenant_id = (current_setting('app.current_tenant_id'::text))::uuid)
  WITH CHECK (tenant_id = (current_setting('app.current_tenant_id'::text))::uuid);

DROP POLICY IF EXISTS authenticated_access ON public.branch_price_overrides;
DROP POLICY IF EXISTS branch_price_overrides_authenticated_access ON public.branch_price_overrides;
CREATE POLICY branch_price_overrides_authenticated_access ON public.branch_price_overrides
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

COMMIT;
