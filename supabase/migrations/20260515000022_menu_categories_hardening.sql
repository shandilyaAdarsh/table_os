-- 20260515000022_menu_categories_hardening.sql
BEGIN;

-- Add optimistic locking and audit logging fields
ALTER TABLE public.menu_categories 
ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES public.platform_users(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS version_num INTEGER DEFAULT 1 NOT NULL;

-- Create indexes for hierarchical queries and tree resolution
CREATE INDEX IF NOT EXISTS idx_menu_categories_parent_id ON public.menu_categories(parent_id);
CREATE INDEX IF NOT EXISTS idx_menu_categories_tenant_sort ON public.menu_categories(tenant_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_menu_categories_tenant_slug ON public.menu_categories(tenant_id, slug);

COMMIT;
