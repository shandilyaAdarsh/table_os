-- ============================================================
-- Migration: 20260605000000_order_rls_hardening.sql
-- Purpose: Hardens RLS policies on the `orders` table.
-- Drops weak policies and adds strict tenant/branch validation
-- for inserts, and prevents deletion entirely.
-- ============================================================

BEGIN;

-- 1. Drop the weak insert policy
DROP POLICY IF EXISTS "guest_insert_orders" ON public.orders;

-- 2. Create the strong customer insert policy
CREATE POLICY "customer_insert_orders" ON public.orders
  FOR INSERT TO anon, public
  WITH CHECK (
    tenant_id IN (SELECT id FROM public.tenants WHERE status = 'active')
    AND branch_id IN (SELECT id FROM public.branches WHERE tenant_id = orders.tenant_id AND status = 'active')
    AND table_id IS NOT NULL
    AND status = 'pending'
  );

-- 3. Create explicit NO DELETE policy
-- Ensures orders can never be deleted, even by authenticated users
DROP POLICY IF EXISTS "no_delete_orders" ON public.orders;
CREATE POLICY "no_delete_orders" ON public.orders
  FOR DELETE
  USING (false);

COMMIT;
