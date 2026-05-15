-- ============================================================
-- Migration: 015_menu_categories
-- Hierarchical menu categories with branch visibility support.
-- ============================================================

CREATE TABLE public.menu_categories (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  parent_id   UUID        REFERENCES public.menu_categories(id) ON DELETE SET NULL,
  -- NULL parent_id = root category
  name        TEXT        NOT NULL,
  slug        TEXT        NOT NULL,
  description TEXT,
  image_url   TEXT,
  sort_order  INTEGER     NOT NULL DEFAULT 0,
  is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
  created_by  UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at  TIMESTAMPTZ,

  -- Composite unique for downstream composite FK references
  CONSTRAINT menu_categories_tenant_id_id_key UNIQUE (tenant_id, id),
  -- Slug must be unique within a tenant
  CONSTRAINT menu_categories_tenant_slug_key UNIQUE (tenant_id, slug),
  -- Guard against deep nesting producing invalid references
  CONSTRAINT chk_category_no_self_parent CHECK (id != parent_id)
);

CREATE INDEX idx_menu_categories_tenant_id  ON public.menu_categories(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_menu_categories_parent_id  ON public.menu_categories(parent_id) WHERE parent_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX idx_menu_categories_sort_order ON public.menu_categories(tenant_id, sort_order) WHERE deleted_at IS NULL;
CREATE INDEX idx_menu_categories_active     ON public.menu_categories(tenant_id, is_active) WHERE is_active = TRUE AND deleted_at IS NULL;

CREATE TRIGGER set_menu_categories_updated_at
  BEFORE UPDATE ON public.menu_categories
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── Branch Visibility Overrides ──────────────────────────────
-- Opt-out model: category is visible everywhere unless explicitly hidden.
-- If no row exists → visible. If row exists with is_visible = FALSE → hidden.

CREATE TABLE public.menu_category_branch_visibility (
  tenant_id   UUID    NOT NULL,
  branch_id   UUID    NOT NULL,
  category_id UUID    NOT NULL,
  is_visible  BOOLEAN NOT NULL DEFAULT FALSE,   -- FALSE = hidden for this branch
  sort_order  INTEGER,                          -- Branch-specific ordering override (NULL = inherit)
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (tenant_id, branch_id, category_id),

  CONSTRAINT fk_cat_visibility_branch
    FOREIGN KEY (tenant_id, branch_id) REFERENCES public.branches(tenant_id, id) ON DELETE CASCADE,

  CONSTRAINT fk_cat_visibility_category
    FOREIGN KEY (tenant_id, category_id) REFERENCES public.menu_categories(tenant_id, id) ON DELETE CASCADE
);

CREATE INDEX idx_cat_visibility_branch ON public.menu_category_branch_visibility(branch_id);
CREATE INDEX idx_cat_visibility_cat    ON public.menu_category_branch_visibility(category_id);

CREATE TRIGGER set_cat_visibility_updated_at
  BEFORE UPDATE ON public.menu_category_branch_visibility
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
