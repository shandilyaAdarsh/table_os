-- table_os/supabase/migrations/20260606000000_table_assignment.sql

-- 1. Drop the legacy unused assigned_waiter_id column
ALTER TABLE public.tables DROP COLUMN IF EXISTS assigned_waiter_id;

-- 2. Add assigned_staff_id pointing to the authoritative staff identity
ALTER TABLE public.tables
ADD COLUMN assigned_staff_id UUID REFERENCES public.staff(id) ON DELETE SET NULL;

-- Add an index for faster filtering of tables by staff assignment
CREATE INDEX IF NOT EXISTS idx_tables_assigned_staff_id ON public.tables(assigned_staff_id);

-- Note: Existing RLS policies on public.tables for tenant_id and branch_id implicitly
-- protect the new assigned_staff_id column, as staff can only query tables within their branch.
