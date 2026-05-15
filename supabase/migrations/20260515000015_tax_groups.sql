-- ============================================================
-- Migration: 014_tax_groups
-- Tax group definitions per tenant (e.g. "GST 5%", "VAT 20%").
-- Branch-level overrides are handled in 015_tax_rates.
-- ============================================================

CREATE TABLE public.tax_groups (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,                   -- e.g. "GST", "VAT"
  description TEXT,
  is_default  BOOLEAN     NOT NULL DEFAULT FALSE,
  is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at  TIMESTAMPTZ,

  -- Composite unique so downstream FKs can enforce (tenant_id, id)
  CONSTRAINT tax_groups_tenant_id_id_key UNIQUE (tenant_id, id)
);

CREATE INDEX idx_tax_groups_tenant_id  ON public.tax_groups(tenant_id)  WHERE deleted_at IS NULL;
CREATE INDEX idx_tax_groups_is_default ON public.tax_groups(tenant_id, is_default) WHERE is_default = TRUE AND deleted_at IS NULL;

CREATE TRIGGER set_tax_groups_updated_at
  BEFORE UPDATE ON public.tax_groups
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── Tax Rates ────────────────────────────────────────────────
-- Each tax group can have multiple line-rates (e.g., CGST 2.5% + SGST 2.5%).
-- Optionally scoped to a specific branch for regional compliance.

CREATE TABLE public.tax_rates (
  id              UUID                         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID                         NOT NULL,
  tax_group_id    UUID                         NOT NULL,
  branch_id       UUID                         REFERENCES public.branches(id) ON DELETE CASCADE,
  -- Null branch_id = applies to all branches in the tenant
  name            TEXT                         NOT NULL, -- e.g. "CGST", "SGST", "Service Tax"
  rate            NUMERIC(6, 4)                NOT NULL CHECK (rate >= 0 AND rate <= 100),
  -- 4 decimal places: supports 12.5000%, 2.5000%, etc.
  calculation_mode public.tax_calculation_mode NOT NULL DEFAULT 'exclusive',
  is_active       BOOLEAN                      NOT NULL DEFAULT TRUE,
  effective_from  DATE,
  effective_until DATE,
  created_at      TIMESTAMPTZ                  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ                  NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ,

  -- Composite FK into tax_groups
  CONSTRAINT fk_tax_rates_tax_group
    FOREIGN KEY (tenant_id, tax_group_id) REFERENCES public.tax_groups(tenant_id, id) ON DELETE CASCADE,

  CONSTRAINT chk_tax_rate_non_negative CHECK (rate >= 0),
  CONSTRAINT chk_effective_dates CHECK (
    effective_from IS NULL OR effective_until IS NULL OR effective_from <= effective_until
  )
);

CREATE INDEX idx_tax_rates_tenant_id    ON public.tax_rates(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_tax_rates_group_id     ON public.tax_rates(tax_group_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_tax_rates_branch_id    ON public.tax_rates(branch_id) WHERE branch_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX idx_tax_rates_active       ON public.tax_rates(tenant_id, tax_group_id, is_active) WHERE is_active = TRUE AND deleted_at IS NULL;

CREATE TRIGGER set_tax_rates_updated_at
  BEFORE UPDATE ON public.tax_rates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
