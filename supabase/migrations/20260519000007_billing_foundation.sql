-- ============================================================
-- Migration: 20260519000007_billing_foundation.sql
-- Phase 5: Billing/POS Foundation — invoices, settlements,
-- payment tracking, split bill prep, receipt serialization.
-- ============================================================

BEGIN;

DO $$ BEGIN
  CREATE TYPE public.invoice_status AS ENUM (
    'draft', 'issued', 'paid', 'partially_paid', 'voided', 'refunded'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.payment_method AS ENUM (
    'cash', 'card', 'qr_pay', 'wallet', 'split', 'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.payment_status AS ENUM (
    'pending', 'completed', 'failed', 'refunded'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── invoices ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.invoices (
  id                    UUID                   PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID                   NOT NULL,
  branch_id             UUID                   NOT NULL,
  order_id              UUID                   NOT NULL REFERENCES public.orders (id),
  order_snapshot_id     UUID                   NOT NULL REFERENCES public.order_snapshots (id),
  invoice_number        TEXT                   NOT NULL,
  status                public.invoice_status  NOT NULL DEFAULT 'draft',
  -- Financial totals in minor units (immutable once issued)
  subtotal_minor        BIGINT                 NOT NULL CHECK (subtotal_minor >= 0),
  tax_total_minor       BIGINT                 NOT NULL DEFAULT 0 CHECK (tax_total_minor >= 0),
  discount_total_minor  BIGINT                 NOT NULL DEFAULT 0,
  grand_total_minor     BIGINT                 NOT NULL CHECK (grand_total_minor >= 0),
  amount_paid_minor     BIGINT                 NOT NULL DEFAULT 0 CHECK (amount_paid_minor >= 0),
  amount_due_minor      BIGINT                 GENERATED ALWAYS AS (grand_total_minor - amount_paid_minor) STORED,
  currency_code         CHAR(3)                NOT NULL DEFAULT 'USD',
  -- Idempotency
  idempotency_key       TEXT,
  -- Receipt
  issued_at             TIMESTAMPTZ,
  voided_at             TIMESTAMPTZ,
  voided_by             UUID,
  void_reason           TEXT,
  version_num           INTEGER                NOT NULL DEFAULT 1,
  created_by            UUID,
  updated_by            UUID,
  created_at            TIMESTAMPTZ            NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ            NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_order_id
  ON public.invoices (order_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_number_branch
  ON public.invoices (branch_id, invoice_number);

CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_idempotency_key
  ON public.invoices (tenant_id, idempotency_key)
  WHERE (idempotency_key IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_invoices_tenant_id  ON public.invoices (tenant_id);
CREATE INDEX IF NOT EXISTS idx_invoices_branch_id  ON public.invoices (branch_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status     ON public.invoices (branch_id, status);

DROP TRIGGER IF EXISTS handle_invoices_updated_at ON public.invoices;
CREATE TRIGGER handle_invoices_updated_at
  BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS increment_invoices_version ON public.invoices;
CREATE TRIGGER increment_invoices_version
  BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.increment_version_num();

CREATE OR REPLACE FUNCTION public.enforce_invoices_immutability()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.tenant_id <> OLD.tenant_id THEN
    RAISE EXCEPTION 'tenant_id is immutable on invoices';
  END IF;
  IF NEW.order_id <> OLD.order_id THEN
    RAISE EXCEPTION 'order_id is immutable on invoices';
  END IF;
  IF NEW.order_snapshot_id <> OLD.order_snapshot_id THEN
    RAISE EXCEPTION 'order_snapshot_id is immutable on invoices';
  END IF;
  -- Once issued, financial totals lock
  IF OLD.status IN ('issued','paid','partially_paid') THEN
    IF NEW.subtotal_minor <> OLD.subtotal_minor
       OR NEW.tax_total_minor <> OLD.tax_total_minor
       OR NEW.grand_total_minor <> OLD.grand_total_minor THEN
      RAISE EXCEPTION 'Financial totals are immutable after invoice is issued';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_invoices_immutability ON public.invoices;
CREATE TRIGGER enforce_invoices_immutability
  BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.enforce_invoices_immutability();

-- ─── billing_payments — append-only payment ledger ────────────

CREATE TABLE IF NOT EXISTS public.billing_payments (
  id              UUID                    PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID                    NOT NULL,
  branch_id       UUID                    NOT NULL,
  invoice_id      UUID                    NOT NULL REFERENCES public.invoices (id),
  method          public.payment_method   NOT NULL,
  status          public.payment_status   NOT NULL DEFAULT 'pending',
  amount_minor    BIGINT                  NOT NULL CHECK (amount_minor > 0),
  currency_code   CHAR(3)                 NOT NULL DEFAULT 'USD',
  idempotency_key TEXT,
  -- Gateway reference (populated when payment gateway integrated in future)
  gateway_ref     TEXT,
  gateway_payload JSONB,
  -- Lifecycle
  completed_at    TIMESTAMPTZ,
  failed_at       TIMESTAMPTZ,
  failure_reason  TEXT,
  processed_by    UUID,
  created_at      TIMESTAMPTZ             NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_billing_payments_idempotency_key
  ON public.billing_payments (tenant_id, idempotency_key)
  WHERE (idempotency_key IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_billing_payments_invoice_id ON public.billing_payments (invoice_id);
CREATE INDEX IF NOT EXISTS idx_billing_payments_tenant_id  ON public.billing_payments (tenant_id);
CREATE INDEX IF NOT EXISTS idx_billing_payments_status     ON public.billing_payments (status);

-- Payments are append-only ledger entries — immutable
CREATE OR REPLACE FUNCTION public.enforce_billing_payments_immutability()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.tenant_id <> OLD.tenant_id THEN
    RAISE EXCEPTION 'tenant_id is immutable on billing_payments';
  END IF;
  IF NEW.invoice_id <> OLD.invoice_id THEN
    RAISE EXCEPTION 'invoice_id is immutable on billing_payments';
  END IF;
  IF NEW.amount_minor <> OLD.amount_minor THEN
    RAISE EXCEPTION 'amount_minor is immutable on billing_payments';
  END IF;
  IF NEW.method <> OLD.method THEN
    RAISE EXCEPTION 'method is immutable on billing_payments';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_billing_payments_immutability ON public.billing_payments;
CREATE TRIGGER enforce_billing_payments_immutability
  BEFORE UPDATE ON public.billing_payments
  FOR EACH ROW EXECUTE FUNCTION public.enforce_billing_payments_immutability();

-- ─── billing_refunds — append-only refund ledger ──────────────

CREATE TABLE IF NOT EXISTS public.billing_refunds (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID        NOT NULL,
  branch_id       UUID        NOT NULL,
  invoice_id      UUID        NOT NULL REFERENCES public.invoices (id),
  payment_id      UUID        REFERENCES public.billing_payments (id),
  refund_amount_minor BIGINT  NOT NULL CHECK (refund_amount_minor > 0),
  currency_code   CHAR(3)     NOT NULL DEFAULT 'USD',
  reason          TEXT        NOT NULL,
  idempotency_key TEXT,
  gateway_ref     TEXT,
  issued_by       UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_billing_refunds_idempotency_key
  ON public.billing_refunds (tenant_id, idempotency_key)
  WHERE (idempotency_key IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_billing_refunds_invoice_id ON public.billing_refunds (invoice_id);
CREATE INDEX IF NOT EXISTS idx_billing_refunds_tenant_id  ON public.billing_refunds (tenant_id);

-- Refunds are immutable once issued
CREATE OR REPLACE FUNCTION public.enforce_billing_refunds_immutability()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'billing_refunds rows are immutable — refunds are permanent ledger entries';
END;
$$;

DROP TRIGGER IF EXISTS enforce_billing_refunds_immutability ON public.billing_refunds;
CREATE TRIGGER enforce_billing_refunds_immutability
  BEFORE UPDATE ON public.billing_refunds
  FOR EACH ROW EXECUTE FUNCTION public.enforce_billing_refunds_immutability();

-- ─── RLS ──────────────────────────────────────────────────────

ALTER TABLE public.invoices          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_payments  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_refunds   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "invoices_tenant_isolation"         ON public.invoices;
CREATE POLICY "invoices_tenant_isolation" ON public.invoices
  AS RESTRICTIVE FOR ALL USING (auth.jwt() ->> 'tenant_id' = tenant_id::text);
DROP POLICY IF EXISTS "invoices_authenticated_access"     ON public.invoices;
CREATE POLICY "invoices_authenticated_access" ON public.invoices
  AS PERMISSIVE FOR ALL USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "billing_payments_tenant_isolation" ON public.billing_payments;
CREATE POLICY "billing_payments_tenant_isolation" ON public.billing_payments
  AS RESTRICTIVE FOR ALL USING (auth.jwt() ->> 'tenant_id' = tenant_id::text);
DROP POLICY IF EXISTS "billing_payments_authenticated_access" ON public.billing_payments;
CREATE POLICY "billing_payments_authenticated_access" ON public.billing_payments
  AS PERMISSIVE FOR ALL USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "billing_refunds_tenant_isolation"  ON public.billing_refunds;
CREATE POLICY "billing_refunds_tenant_isolation" ON public.billing_refunds
  AS RESTRICTIVE FOR ALL USING (auth.jwt() ->> 'tenant_id' = tenant_id::text);
DROP POLICY IF EXISTS "billing_refunds_authenticated_access" ON public.billing_refunds;
CREATE POLICY "billing_refunds_authenticated_access" ON public.billing_refunds
  AS PERMISSIVE FOR ALL USING (auth.role() = 'authenticated');

COMMIT;
