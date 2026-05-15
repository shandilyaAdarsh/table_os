-- ============================================================
-- Migration: 017_modifier_groups
-- Modifier groups (Size, Add-ons, Toppings) and their options.
-- Groups are tenant-owned and linked to items via a join table.
-- ============================================================

-- ─── Modifier Groups ──────────────────────────────────────────

CREATE TABLE public.modifier_groups (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,              -- e.g. "Size", "Toppings"
  description TEXT,
  is_required BOOLEAN     NOT NULL DEFAULT FALSE, -- True = user MUST choose
  min_select  INTEGER     NOT NULL DEFAULT 0,     -- Min selections (0 if not required)
  max_select  INTEGER,                            -- NULL = unlimited
  is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
  sort_order  INTEGER     NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at  TIMESTAMPTZ,

  CONSTRAINT modifier_groups_tenant_id_id_key UNIQUE (tenant_id, id),
  CONSTRAINT chk_modifier_group_min_select  CHECK (min_select >= 0),
  CONSTRAINT chk_modifier_group_max_select  CHECK (max_select IS NULL OR max_select >= min_select),
  CONSTRAINT chk_modifier_group_required    CHECK (
    -- If required, min_select must be at least 1
    (is_required = FALSE) OR (min_select >= 1)
  )
);

CREATE INDEX idx_modifier_groups_tenant_id ON public.modifier_groups(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_modifier_groups_active    ON public.modifier_groups(tenant_id, is_active) WHERE is_active = TRUE AND deleted_at IS NULL;

CREATE TRIGGER set_modifier_groups_updated_at
  BEFORE UPDATE ON public.modifier_groups
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── Modifier Options ──────────────────────────────────────────

CREATE TABLE public.modifier_options (
  id              UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID           NOT NULL,
  modifier_group_id UUID         NOT NULL,
  name            TEXT           NOT NULL,              -- e.g. "Large", "Extra Cheese"
  price_delta     NUMERIC(12, 4) NOT NULL DEFAULT 0,    -- Positive = add-on, 0 = no change
  -- Negative price_delta is intentionally allowed for discount options
  is_default      BOOLEAN        NOT NULL DEFAULT FALSE, -- Pre-selected for the user
  is_active       BOOLEAN        NOT NULL DEFAULT TRUE,
  sort_order      INTEGER        NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ,

  CONSTRAINT modifier_options_tenant_id_id_key UNIQUE (tenant_id, id),

  -- Composite FK: option must belong to a group in same tenant
  CONSTRAINT fk_modifier_options_group
    FOREIGN KEY (tenant_id, modifier_group_id) REFERENCES public.modifier_groups(tenant_id, id) ON DELETE CASCADE
);

CREATE INDEX idx_modifier_options_tenant_id ON public.modifier_options(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_modifier_options_group_id  ON public.modifier_options(modifier_group_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_modifier_options_active    ON public.modifier_options(modifier_group_id, is_active) WHERE is_active = TRUE AND deleted_at IS NULL;
CREATE INDEX idx_modifier_options_default   ON public.modifier_options(modifier_group_id) WHERE is_default = TRUE;

CREATE TRIGGER set_modifier_options_updated_at
  BEFORE UPDATE ON public.modifier_options
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── Item ↔ Modifier Group Join Table ─────────────────────────
-- Many-to-many: one item can have multiple groups; one group can be reused across items.
-- This enables efficient modifier template reuse.

CREATE TABLE public.menu_item_modifier_groups (
  tenant_id         UUID    NOT NULL,
  item_id           UUID    NOT NULL,
  modifier_group_id UUID    NOT NULL,
  sort_order        INTEGER NOT NULL DEFAULT 0,  -- Item-specific ordering of this group
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (tenant_id, item_id, modifier_group_id),

  CONSTRAINT fk_item_modifier_item
    FOREIGN KEY (tenant_id, item_id) REFERENCES public.menu_items(tenant_id, id) ON DELETE CASCADE,

  CONSTRAINT fk_item_modifier_group
    FOREIGN KEY (tenant_id, modifier_group_id) REFERENCES public.modifier_groups(tenant_id, id) ON DELETE CASCADE
);

CREATE INDEX idx_item_mod_groups_item_id   ON public.menu_item_modifier_groups(item_id);
CREATE INDEX idx_item_mod_groups_group_id  ON public.menu_item_modifier_groups(modifier_group_id);
