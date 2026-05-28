-- ============================================================
-- Migration: 20260528000000_qr_token_lifecycle.sql
-- Table QR Token Lifecycle + Snapshot Resolution
-- ============================================================

BEGIN;

-- 1. Add QR Token Lifecycle Fields
ALTER TABLE public.table_qr_tokens
  ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_accessed_at TIMESTAMPTZ;

-- 2. Add Deterministic Snapshot Resolution to branches
ALTER TABLE public.branches
  ADD COLUMN IF NOT EXISTS active_published_snapshot_id UUID;

-- (The foreign key will depend on the menu snapshots table existing, 
-- but we don't strictly enforce FK if it causes circular dependencies,
-- or we can enforce it if menu_snapshots exists).
-- Assuming menu_snapshots exists, but to be safe we just add the UUID column for now.

COMMIT;
