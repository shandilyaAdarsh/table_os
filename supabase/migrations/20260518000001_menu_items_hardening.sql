-- 20260518000001_menu_items_hardening.sql
BEGIN;

-- Add optimistic locking and audit logging fields to menu_items
ALTER TABLE public.menu_items 
ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES public.platform_users(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS version_num INTEGER DEFAULT 1 NOT NULL;

-- =====================================================================================
-- ARCHITECTURE NOTE: PRODUCTION INDEXING STRATEGY
-- =====================================================================================
-- For production environments with millions of rows, indexing should use:
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS ...
--
-- IMPORTANT: CONCURRENTLY cannot run inside a transaction block (BEGIN/COMMIT).
-- This migration uses standard locking index creation because this module is still
-- in early pre-production, where tables are empty or small. 
--
-- Future migrations that add indexes to populated tables MUST remove the BEGIN/COMMIT
-- wrapper and use CONCURRENTLY to prevent blocking production operations.
-- =====================================================================================

-- Create full-text search vector column using 'simple' tokenizer for multilingual support
-- Wrapped in a PL/pgSQL DO block to avoid historical PG parser bugs/edge cases with `ADD COLUMN IF NOT EXISTS` on generated columns.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'menu_items' 
          AND column_name = 'search_vector'
    ) THEN
        ALTER TABLE public.menu_items
        ADD COLUMN search_vector tsvector GENERATED ALWAYS AS (
            setweight(to_tsvector('simple', coalesce(name, '')), 'A') ||
            setweight(to_tsvector('simple', coalesce(description, '')), 'B') ||
            setweight(to_tsvector('simple', coalesce(short_description, '')), 'C') ||
            setweight(to_tsvector('simple', coalesce(sku, '')), 'A')
        ) STORED;
    END IF;
END $$;

-- Create partial indexes for performance and search (excluding soft-deleted rows)
CREATE INDEX IF NOT EXISTS idx_menu_items_tenant_category ON public.menu_items(tenant_id, category_id) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_menu_items_tenant_slug ON public.menu_items(tenant_id, slug) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_menu_items_tenant_sku ON public.menu_items(tenant_id, sku) WHERE sku IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_menu_items_search_vector ON public.menu_items USING GIN (search_vector) WHERE deleted_at IS NULL;

COMMIT;
