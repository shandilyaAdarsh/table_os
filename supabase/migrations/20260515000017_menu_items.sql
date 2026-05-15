-- ============================================================
-- Migration: 016_menu_items
-- Core menu items with full metadata, dietary tags, and
-- branch availability support.
-- ============================================================

CREATE TABLE public.menu_items (
  id              UUID                    PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID                    NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  category_id     UUID                    NOT NULL,
  -- ─── Identity ───────────────────────────────────────────────
  name            TEXT                    NOT NULL,
  slug            TEXT                    NOT NULL,
  description     TEXT,
  short_description TEXT,
  sku             TEXT,                   -- Internal code/barcode reference
  -- ─── Status ─────────────────────────────────────────────────
  status          public.menu_item_status NOT NULL DEFAULT 'active',
  is_featured     BOOLEAN                 NOT NULL DEFAULT FALSE,
  -- ─── Images ─────────────────────────────────────────────────
  image_url       TEXT,
  thumbnail_url   TEXT,
  -- ─── Pricing ────────────────────────────────────────────────
  base_price      NUMERIC(12, 4)          NOT NULL CHECK (base_price >= 0),
  -- 12,4 precision: supports up to $99,999,999.9999 (multi-currency safe)
  pricing_type    public.pricing_type     NOT NULL DEFAULT 'fixed',
  -- ─── Tax ────────────────────────────────────────────────────
  tax_group_id    UUID,                   -- NULL = no tax applied
  -- ─── Dietary & Classification ───────────────────────────────
  dietary_tags    TEXT[]                  NOT NULL DEFAULT '{}',
  -- e.g. ['vegan', 'gluten_free', 'halal', 'dairy_free', 'nuts']
  spice_level     public.spice_level      NOT NULL DEFAULT 'none',
  -- ─── Preparation ────────────────────────────────────────────
  prep_time_minutes INTEGER               CHECK (prep_time_minutes IS NULL OR prep_time_minutes >= 0),
  -- Future KDS routing: station assignment will be added in KDS module
  -- ─── Sort & Display ─────────────────────────────────────────
  sort_order      INTEGER                 NOT NULL DEFAULT 0,
  -- ─── Audit ──────────────────────────────────────────────────
  created_by      UUID                    REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ             NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ             NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ,

  -- Composite unique for downstream composite FK references
  CONSTRAINT menu_items_tenant_id_id_key UNIQUE (tenant_id, id),
  -- Slug unique per tenant
  CONSTRAINT menu_items_tenant_slug_key  UNIQUE (tenant_id, slug),
  -- SKU unique per tenant (when set)
  CONSTRAINT menu_items_tenant_sku_key   UNIQUE (tenant_id, sku),

  -- Composite FK: category must belong to same tenant
  CONSTRAINT fk_menu_items_category
    FOREIGN KEY (tenant_id, category_id) REFERENCES public.menu_categories(tenant_id, id) ON DELETE RESTRICT,

  -- Composite FK: tax_group must belong to same tenant
  CONSTRAINT fk_menu_items_tax_group
    FOREIGN KEY (tenant_id, tax_group_id) REFERENCES public.tax_groups(tenant_id, id) ON DELETE SET NULL
);

CREATE INDEX idx_menu_items_tenant_id   ON public.menu_items(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_menu_items_category_id ON public.menu_items(category_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_menu_items_status      ON public.menu_items(tenant_id, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_menu_items_featured    ON public.menu_items(tenant_id, is_featured) WHERE is_featured = TRUE AND deleted_at IS NULL;
CREATE INDEX idx_menu_items_sort        ON public.menu_items(tenant_id, category_id, sort_order) WHERE deleted_at IS NULL;
CREATE INDEX idx_menu_items_dietary     ON public.menu_items USING GIN (dietary_tags);
-- GIN index: supports @> (contains), && (overlaps) queries on dietary_tags array

CREATE TRIGGER set_menu_items_updated_at
  BEFORE UPDATE ON public.menu_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── Item Images (optional gallery) ───────────────────────────
-- Separate table to support ordered image galleries per item.

CREATE TABLE public.menu_item_images (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID        NOT NULL,
  item_id     UUID        NOT NULL,
  url         TEXT        NOT NULL,
  alt_text    TEXT,
  sort_order  INTEGER     NOT NULL DEFAULT 0,
  is_primary  BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT fk_item_images_item
    FOREIGN KEY (tenant_id, item_id) REFERENCES public.menu_items(tenant_id, id) ON DELETE CASCADE
);

CREATE INDEX idx_item_images_item_id ON public.menu_item_images(item_id);
CREATE UNIQUE INDEX idx_item_images_primary ON public.menu_item_images(item_id) WHERE is_primary = TRUE;
-- Only one primary image per item
