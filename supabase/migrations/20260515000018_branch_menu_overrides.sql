-- ============================================================
-- Migration: 018_branch_menu_overrides
-- Branch-specific overrides for item pricing, availability,
-- and modifier options. Implements the override inheritance model.
-- ============================================================

-- ─── Branch Item Overrides ────────────────────────────────────
-- Override: price and availability at branch level.
-- Opt-in: no row = inherit tenant defaults.

CREATE TABLE public.branch_menu_item_overrides (
  tenant_id       UUID           NOT NULL,
  branch_id       UUID           NOT NULL,
  item_id         UUID           NOT NULL,
  -- Pricing override (NULL = inherit base_price from menu_items)
  override_price  NUMERIC(12, 4) CHECK (override_price IS NULL OR override_price >= 0),
  -- Visibility override (NULL = inherit item status)
  is_available    BOOLEAN,
  -- Sort order override for this branch's menu view
  sort_order      INTEGER,
  -- Tax group override (NULL = inherit from item)
  tax_group_id    UUID,
  created_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW(),

  PRIMARY KEY (tenant_id, branch_id, item_id),

  CONSTRAINT fk_branch_item_override_branch
    FOREIGN KEY (tenant_id, branch_id) REFERENCES public.branches(tenant_id, id) ON DELETE CASCADE,

  CONSTRAINT fk_branch_item_override_item
    FOREIGN KEY (tenant_id, item_id) REFERENCES public.menu_items(tenant_id, id) ON DELETE CASCADE,

  CONSTRAINT fk_branch_item_override_tax_group
    FOREIGN KEY (tenant_id, tax_group_id) REFERENCES public.tax_groups(tenant_id, id) ON DELETE SET NULL
);

CREATE INDEX idx_branch_item_overrides_branch  ON public.branch_menu_item_overrides(branch_id);
CREATE INDEX idx_branch_item_overrides_item    ON public.branch_menu_item_overrides(item_id);
CREATE INDEX idx_branch_item_overrides_avail   ON public.branch_menu_item_overrides(branch_id, is_available)
  WHERE is_available = FALSE;

CREATE TRIGGER set_branch_item_overrides_updated_at
  BEFORE UPDATE ON public.branch_menu_item_overrides
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── Branch Modifier Option Overrides ─────────────────────────
-- Override modifier option pricing and availability per branch.
-- No row = inherit from modifier_options.

CREATE TABLE public.branch_modifier_option_overrides (
  tenant_id         UUID           NOT NULL,
  branch_id         UUID           NOT NULL,
  modifier_option_id UUID          NOT NULL,
  override_price_delta NUMERIC(12, 4), -- NULL = inherit price_delta
  is_available      BOOLEAN,           -- NULL = inherit is_active
  created_at        TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ    NOT NULL DEFAULT NOW(),

  PRIMARY KEY (tenant_id, branch_id, modifier_option_id),

  CONSTRAINT fk_branch_mod_override_branch
    FOREIGN KEY (tenant_id, branch_id) REFERENCES public.branches(tenant_id, id) ON DELETE CASCADE,

  CONSTRAINT fk_branch_mod_override_option
    FOREIGN KEY (tenant_id, modifier_option_id) REFERENCES public.modifier_options(tenant_id, id) ON DELETE CASCADE
);

CREATE INDEX idx_branch_mod_overrides_branch ON public.branch_modifier_option_overrides(branch_id);
CREATE INDEX idx_branch_mod_overrides_option ON public.branch_modifier_option_overrides(modifier_option_id);

CREATE TRIGGER set_branch_mod_overrides_updated_at
  BEFORE UPDATE ON public.branch_modifier_option_overrides
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── Branch Modifier Group Overrides ─────────────────────────
-- Enable/disable an entire modifier group at the branch level.

CREATE TABLE public.branch_modifier_group_overrides (
  tenant_id         UUID    NOT NULL,
  branch_id         UUID    NOT NULL,
  modifier_group_id UUID    NOT NULL,
  is_available      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (tenant_id, branch_id, modifier_group_id),

  CONSTRAINT fk_branch_modgrp_override_branch
    FOREIGN KEY (tenant_id, branch_id) REFERENCES public.branches(tenant_id, id) ON DELETE CASCADE,

  CONSTRAINT fk_branch_modgrp_override_group
    FOREIGN KEY (tenant_id, modifier_group_id) REFERENCES public.modifier_groups(tenant_id, id) ON DELETE CASCADE
);

CREATE INDEX idx_branch_modgrp_overrides_branch ON public.branch_modifier_group_overrides(branch_id);

CREATE TRIGGER set_branch_modgrp_overrides_updated_at
  BEFORE UPDATE ON public.branch_modifier_group_overrides
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
