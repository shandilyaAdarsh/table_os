-- ============================================================
-- Migration: 20260520000001_billing_runtime.sql
-- Production-grade financial runtime, billing, and settlement schemas.
-- ============================================================

BEGIN;

-- 1. Create Enums for Billing Lifecycle
DO $$ BEGIN
  CREATE TYPE public.bill_status AS ENUM (
    'UNPAID', 'PARTIALLY_PAID', 'PAID', 'FAILED', 'VOIDED', 'REFUNDED'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.intent_status AS ENUM (
    'created', 'authorized', 'captured', 'failed', 'expired'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. Create Authoritative Bills Table
CREATE TABLE IF NOT EXISTS public.bills (
  id                      UUID                 PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               UUID                 NOT NULL,
  branch_id               UUID                 NOT NULL,
  table_id                UUID,                                     -- Nullable for quick/takeaway orders
  session_id              UUID,                                     -- Nullable for guest tracking
  parent_bill_id          UUID                 REFERENCES public.bills(id) ON DELETE SET NULL, -- Self-reference for split bills
  bill_number             TEXT                 NOT NULL,
  status                  public.bill_status   NOT NULL DEFAULT 'UNPAID',
  
  -- Financial totals in minor units (cents)
  subtotal_minor          BIGINT               NOT NULL CHECK (subtotal_minor >= 0),
  tax_total_minor         BIGINT               NOT NULL DEFAULT 0 CHECK (tax_total_minor >= 0),
  discount_total_minor    BIGINT               NOT NULL DEFAULT 0 CHECK (discount_total_minor >= 0),
  grand_total_minor       BIGINT               NOT NULL CHECK (grand_total_minor >= 0),
  amount_paid_minor       BIGINT               NOT NULL DEFAULT 0 CHECK (amount_paid_minor >= 0),
  amount_refunded_minor   BIGINT               NOT NULL DEFAULT 0 CHECK (amount_refunded_minor >= 0),
  currency_code           CHAR(3)              NOT NULL DEFAULT 'USD',
  
  version_num             INTEGER              NOT NULL DEFAULT 1,
  voided_at               TIMESTAMPTZ,
  voided_by               UUID,
  void_reason             TEXT,
  created_at              TIMESTAMPTZ          NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ          NOT NULL DEFAULT NOW(),
  
  CONSTRAINT bill_unpaid_amount_check CHECK (amount_paid_minor <= grand_total_minor)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_bills_number_branch ON public.bills (branch_id, bill_number);
CREATE INDEX IF NOT EXISTS idx_bills_tenant ON public.bills (tenant_id);
CREATE INDEX IF NOT EXISTS idx_bills_parent ON public.bills (parent_bill_id) WHERE parent_bill_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bills_table ON public.bills (table_id) WHERE table_id IS NOT NULL;

-- 3. Bill-Orders Mapping Join Table (Multi-Order aggregation support)
CREATE TABLE IF NOT EXISTS public.bill_orders (
  id                      UUID                 PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               UUID                 NOT NULL,
  bill_id                 UUID                 NOT NULL REFERENCES public.bills (id) ON DELETE CASCADE,
  order_id                UUID                 NOT NULL REFERENCES public.orders (id) ON DELETE CASCADE,
  created_at              TIMESTAMPTZ          NOT NULL DEFAULT NOW(),
  
  CONSTRAINT bill_orders_unique UNIQUE (bill_id, order_id)
);

CREATE INDEX IF NOT EXISTS idx_bill_orders_order ON public.bill_orders (order_id);

-- 4. Bill Items Table
CREATE TABLE IF NOT EXISTS public.bill_items (
  id                        UUID               PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                 UUID               NOT NULL,
  bill_id                   UUID               NOT NULL REFERENCES public.bills (id) ON DELETE CASCADE,
  order_item_snapshot_id    UUID               NOT NULL REFERENCES public.order_item_snapshots (id),
  quantity                  SMALLINT           NOT NULL CHECK (quantity > 0),
  unit_price_minor          BIGINT             NOT NULL CHECK (unit_price_minor >= 0),
  subtotal_minor            BIGINT             NOT NULL CHECK (subtotal_minor >= 0),
  tax_total_minor           BIGINT             NOT NULL DEFAULT 0 CHECK (tax_total_minor >= 0),
  discount_total_minor      BIGINT             NOT NULL DEFAULT 0 CHECK (discount_total_minor >= 0),
  grand_total_minor         BIGINT             NOT NULL CHECK (grand_total_minor >= 0),
  created_at                TIMESTAMPTZ        NOT NULL DEFAULT NOW()
);

-- 5. Payment Intents Table
CREATE TABLE IF NOT EXISTS public.payment_intents (
  id                      UUID                 PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               UUID                 NOT NULL,
  branch_id               UUID                 NOT NULL,
  bill_id                 UUID                 NOT NULL REFERENCES public.bills (id) ON DELETE CASCADE,
  amount_minor            BIGINT               NOT NULL CHECK (amount_minor > 0),
  currency_code           CHAR(3)              NOT NULL DEFAULT 'USD',
  status                  public.intent_status NOT NULL DEFAULT 'created',
  payment_method          public.payment_method NOT NULL,
  idempotency_key         TEXT                 NOT NULL,
  expires_at              TIMESTAMPTZ          NOT NULL,
  created_at              TIMESTAMPTZ          NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ          NOT NULL DEFAULT NOW(),
  
  CONSTRAINT payment_intents_idemp_unique UNIQUE (tenant_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_payment_intents_bill ON public.payment_intents (bill_id);

-- 6. Settlement Attempts (Locking details for Gateway Replays)
CREATE TABLE IF NOT EXISTS public.settlement_attempts (
  id                      UUID                 PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               UUID                 NOT NULL,
  payment_intent_id       UUID                 NOT NULL REFERENCES public.payment_intents (id) ON DELETE CASCADE,
  attempt_number          INTEGER              NOT NULL DEFAULT 1,
  status                  TEXT                 NOT NULL, -- 'processing', 'succeeded', 'failed'
  gateway_reference       TEXT,
  error_message           TEXT,
  created_at              TIMESTAMPTZ          NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ          NOT NULL DEFAULT NOW(),
  
  CONSTRAINT settlement_attempts_seq UNIQUE (payment_intent_id, attempt_number)
);

-- 7. Settlements (Authoritative Successful Payments)
CREATE TABLE IF NOT EXISTS public.settlements (
  id                      UUID                 PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               UUID                 NOT NULL,
  branch_id               UUID                 NOT NULL,
  bill_id                 UUID                 NOT NULL REFERENCES public.bills (id) ON DELETE RESTRICT,
  payment_intent_id       UUID                 REFERENCES public.payment_intents (id) ON DELETE SET NULL,
  amount_minor            BIGINT               NOT NULL CHECK (amount_minor > 0),
  currency_code           CHAR(3)              NOT NULL DEFAULT 'USD',
  settled_at              TIMESTAMPTZ          NOT NULL DEFAULT NOW(),
  processed_by            UUID,
  created_at              TIMESTAMPTZ          NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_settlements_bill ON public.settlements (bill_id);

-- 8. Append-Only Payment Transactions Ledger
CREATE TABLE IF NOT EXISTS public.payment_transactions (
  id                      UUID                 PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               UUID                 NOT NULL,
  branch_id               UUID                 NOT NULL,
  settlement_id           UUID                 NOT NULL REFERENCES public.settlements (id) ON DELETE CASCADE,
  payment_method          public.payment_method NOT NULL,
  amount_minor            BIGINT               NOT NULL CHECK (amount_minor > 0),
  currency_code           CHAR(3)              NOT NULL DEFAULT 'USD',
  gateway_ref             TEXT,
  gateway_payload         JSONB,
  status                  public.payment_status NOT NULL DEFAULT 'completed',
  created_at              TIMESTAMPTZ          NOT NULL DEFAULT NOW()
);

-- 9. Append-Only Refunds Table
CREATE TABLE IF NOT EXISTS public.refunds (
  id                      UUID                 PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               UUID                 NOT NULL,
  branch_id               UUID                 NOT NULL,
  bill_id                 UUID                 NOT NULL REFERENCES public.bills (id) ON DELETE RESTRICT,
  payment_transaction_id  UUID                 REFERENCES public.payment_transactions (id) ON DELETE RESTRICT,
  refund_amount_minor     BIGINT               NOT NULL CHECK (refund_amount_minor > 0),
  currency_code           CHAR(3)              NOT NULL DEFAULT 'USD',
  reason                  TEXT                 NOT NULL,
  idempotency_key         TEXT,
  gateway_ref             TEXT,
  issued_by               UUID,
  created_at              TIMESTAMPTZ          NOT NULL DEFAULT NOW(),
  
  CONSTRAINT refunds_idemp UNIQUE (tenant_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_refunds_bill ON public.refunds (bill_id);

-- 10. Split Allocations Mapping Table
CREATE TABLE IF NOT EXISTS public.split_allocations (
  id                      UUID                 PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               UUID                 NOT NULL,
  bill_id                 UUID                 NOT NULL REFERENCES public.bills (id) ON DELETE CASCADE, -- Parent
  split_bill_id           UUID                 NOT NULL REFERENCES public.bills (id) ON DELETE CASCADE, -- Split child
  bill_item_id            UUID                 REFERENCES public.bill_items (id) ON DELETE CASCADE,     -- Optional (null for percent split)
  allocated_quantity      SMALLINT,                                                 -- Allocated item quantity
  allocated_percentage    NUMERIC(5,2),                                             -- Percentage based split
  amount_minor            BIGINT               NOT NULL CHECK (amount_minor > 0),
  created_at              TIMESTAMPTZ          NOT NULL DEFAULT NOW()
);

-- 11. Immutable Receipt Snapshots (Frozen Invoice JSON)
CREATE TABLE IF NOT EXISTS public.receipt_snapshots (
  id                      UUID                 PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               UUID                 NOT NULL,
  branch_id               UUID                 NOT NULL,
  bill_id                 UUID                 NOT NULL REFERENCES public.bills (id) ON DELETE RESTRICT,
  receipt_number          TEXT                 NOT NULL,
  frozen_payload          JSONB                NOT NULL,
  created_at              TIMESTAMPTZ          NOT NULL DEFAULT NOW(),
  
  CONSTRAINT receipt_snapshots_unique UNIQUE (bill_id)
);

-- 12. Monotonic Financial sequence outbox for POS / Audit syncing
CREATE TABLE IF NOT EXISTS public.financial_events (
  id                      UUID                 PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               UUID                 NOT NULL,
  branch_id               UUID                 NOT NULL,
  sequence_number         BIGSERIAL,
  event_type              TEXT                 NOT NULL,
  aggregate_id            UUID                 NOT NULL,
  aggregate_type          TEXT                 NOT NULL,
  payload                 JSONB                NOT NULL,
  created_at              TIMESTAMPTZ          NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_financial_events_seq ON public.financial_events (branch_id, sequence_number ASC);

-- ─── Triggers for version and modified times ──────────────────
DROP TRIGGER IF EXISTS handle_bills_updated_at ON public.bills;
CREATE TRIGGER handle_bills_updated_at
  BEFORE UPDATE ON public.bills
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS increment_bills_version ON public.bills;
CREATE TRIGGER increment_bills_version
  BEFORE UPDATE ON public.bills
  FOR EACH ROW EXECUTE FUNCTION public.increment_version_num();

-- ─── ROW LEVEL SECURITY ───────────────────────────────────────
ALTER TABLE public.bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bill_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bill_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settlement_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.split_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receipt_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bills_tenant_isolation" ON public.bills FOR ALL USING (auth.jwt() ->> 'tenant_id' = tenant_id::text);
CREATE POLICY "bill_orders_tenant_isolation" ON public.bill_orders FOR ALL USING (auth.jwt() ->> 'tenant_id' = tenant_id::text);
CREATE POLICY "bill_items_tenant_isolation" ON public.bill_items FOR ALL USING (auth.jwt() ->> 'tenant_id' = tenant_id::text);
CREATE POLICY "payment_intents_tenant_isolation" ON public.payment_intents FOR ALL USING (auth.jwt() ->> 'tenant_id' = tenant_id::text);
CREATE POLICY "settlement_attempts_tenant_isolation" ON public.settlement_attempts FOR ALL USING (auth.jwt() ->> 'tenant_id' = tenant_id::text);
CREATE POLICY "settlements_tenant_isolation" ON public.settlements FOR ALL USING (auth.jwt() ->> 'tenant_id' = tenant_id::text);
CREATE POLICY "payment_transactions_tenant_isolation" ON public.payment_transactions FOR ALL USING (auth.jwt() ->> 'tenant_id' = tenant_id::text);
CREATE POLICY "refunds_tenant_isolation" ON public.refunds FOR ALL USING (auth.jwt() ->> 'tenant_id' = tenant_id::text);
CREATE POLICY "split_allocations_tenant_isolation" ON public.split_allocations FOR ALL USING (auth.jwt() ->> 'tenant_id' = tenant_id::text);
CREATE POLICY "receipt_snapshots_tenant_isolation" ON public.receipt_snapshots FOR ALL USING (auth.jwt() ->> 'tenant_id' = tenant_id::text);
CREATE POLICY "financial_events_tenant_isolation" ON public.financial_events FOR ALL USING (auth.jwt() ->> 'tenant_id' = tenant_id::text);

-- ─── Function helper for logging operational events ───────────
CREATE OR REPLACE FUNCTION public.log_financial_event(
  p_tenant_id UUID,
  p_branch_id UUID,
  p_event_type TEXT,
  p_aggregate_id UUID,
  p_aggregate_type TEXT,
  p_payload JSONB
) RETURNS BIGINT LANGUAGE plpgsql AS $$
DECLARE
  v_seq BIGINT;
BEGIN
  INSERT INTO public.financial_events (
    tenant_id, branch_id, event_type, aggregate_id, aggregate_type, payload
  ) VALUES (
    p_tenant_id, p_branch_id, p_event_type, p_aggregate_id, p_aggregate_type, p_payload
  ) RETURNING sequence_number INTO v_seq;
  
  RETURN v_seq;
END;
$$;

COMMIT;
