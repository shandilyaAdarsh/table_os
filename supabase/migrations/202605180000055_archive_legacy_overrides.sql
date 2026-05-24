-- ============================================================
-- Migration: 202605180000055_archive_legacy_overrides.sql
-- Dedicated archival and cleanup of legacy schema elements.
-- Isolates corrective drops from the forward-only evolution chain.
-- ============================================================

BEGIN;

-- ─── SYSTEM TRANSITION: CONTROLLED SCHEMATIC ARCHIVAL ───────────────────
-- In alignment with strict enterprise append-only database evolution discipline,
-- legacy structures are never destructively dropped. Instead, they are renamed
-- to preserve operational traceability, data forensics, and rollback sanity.
-- Conditional PL/pgSQL blocks ensure this transition is perfectly idempotent
-- and replay-safe across all zero-start or pre-existing environments.

-- 1. Archive legacy branch_modifier_option_overrides if present
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'branch_modifier_option_overrides') THEN
    ALTER TABLE public.branch_modifier_option_overrides 
      RENAME TO branch_modifier_option_overrides_legacy_archived;
    COMMENT ON TABLE public.branch_modifier_option_overrides_legacy_archived 
      IS 'DEPRECATED & ARCHIVED - Replaced by normalized branch_modifier_option_overrides in 20260518000006';
  END IF;
END $$;

-- 2. Archive legacy branch_modifier_group_overrides if present
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'branch_modifier_group_overrides') THEN
    ALTER TABLE public.branch_modifier_group_overrides 
      RENAME TO branch_modifier_group_overrides_legacy_archived;
    COMMENT ON TABLE public.branch_modifier_group_overrides_legacy_archived 
      IS 'DEPRECATED & ARCHIVED - Replaced by normalized branch_modifier_group_overrides in 20260518000006';
  END IF;
END $$;

-- 3. Archive legacy branch_menu_item_overrides if present
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'branch_menu_item_overrides') THEN
    ALTER TABLE public.branch_menu_item_overrides 
      RENAME TO branch_menu_item_overrides_legacy_archived;
    COMMENT ON TABLE public.branch_menu_item_overrides_legacy_archived 
      IS 'DEPRECATED & ARCHIVED - Replaced by normalized branch_menu_item_overrides in 20260518000006';
  END IF;
END $$;

COMMIT;
