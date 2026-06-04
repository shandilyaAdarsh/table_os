-- ============================================================
-- Migration: 20260604000000_guest_ordering_rls.sql
-- Purpose: Adds the missing `order_items` table and safe insert
-- policies for guest ordering (`anon` role) on orders and order_items.
-- ============================================================

BEGIN;

-- 1. Create missing order_items table
CREATE TABLE IF NOT EXISTS public.order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  qty INTEGER NOT NULL CHECK (qty > 0),
  unit_price NUMERIC NOT NULL CHECK (unit_price >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON public.order_items(order_id);

-- 2. Modify orders table policies to allow anon insert & select for guests
-- Drop the restrictive tenant isolation for anon so it doesn't block inserts
DROP POLICY IF EXISTS "orders_tenant_isolation" ON public.orders;
CREATE POLICY "orders_tenant_isolation" ON public.orders
  AS RESTRICTIVE FOR ALL
  USING (
    auth.role() = 'anon' OR (auth.jwt() ->> 'tenant_id' = tenant_id::text)
  );

DROP POLICY IF EXISTS "guest_insert_orders" ON public.orders;
CREATE POLICY "guest_insert_orders" ON public.orders
  FOR INSERT TO anon, public
  WITH CHECK (
    tenant_id IS NOT NULL 
    AND branch_id IS NOT NULL 
    AND table_id IS NOT NULL 
    AND status = 'pending'
  );

DROP POLICY IF EXISTS "guest_select_orders" ON public.orders;
CREATE POLICY "guest_select_orders" ON public.orders
  FOR SELECT TO anon, public
  USING (status = 'pending');

-- 3. Add order_items policies
DROP POLICY IF EXISTS "order_items_tenant_isolation" ON public.order_items;
CREATE POLICY "order_items_tenant_isolation" ON public.order_items
  AS RESTRICTIVE FOR ALL
  USING (
    auth.role() = 'anon' OR 
    EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_items.order_id AND auth.jwt() ->> 'tenant_id' = o.tenant_id::text)
  );

DROP POLICY IF EXISTS "guest_insert_order_items" ON public.order_items;
CREATE POLICY "guest_insert_order_items" ON public.order_items
  FOR INSERT TO anon, public
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND o.status = 'pending')
  );

DROP POLICY IF EXISTS "guest_select_order_items" ON public.order_items;
CREATE POLICY "guest_select_order_items" ON public.order_items
  FOR SELECT TO anon, public
  USING (
    EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND o.status = 'pending')
  );

COMMIT;
