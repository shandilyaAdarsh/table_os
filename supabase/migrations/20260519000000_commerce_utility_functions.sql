-- ============================================================
-- Migration: 20260519000000_commerce_utility_functions.sql
-- Phase 5 Preflight: Shared trigger utility functions required
-- by all Phase 5 commerce migrations.
-- These are forward-compatible with existing set_updated_at() usage.
-- ============================================================

BEGIN;

-- ─── handle_updated_at ────────────────────────────────────────
-- Canonical updated_at trigger function for Phase 5 tables.
-- Functionally identical to set_updated_at() defined in utilities.sql.
-- Defined separately to avoid naming conflicts with pre-existing triggers.

CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- ─── increment_version_num ────────────────────────────────────
-- Generic OCC version increment trigger function.
-- Increments version_num by 1 on every UPDATE.
-- Applied to all Phase 5 mutable entity tables.

CREATE OR REPLACE FUNCTION public.increment_version_num()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.version_num = OLD.version_num + 1;
  RETURN NEW;
END;
$$;

COMMIT;
