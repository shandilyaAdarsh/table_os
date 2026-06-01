-- ============================================================
-- Migration: Add Branch Additional Info Columns
-- Adds address, phone, email, and region to branches table.
-- ============================================================

ALTER TABLE public.branches
ADD COLUMN IF NOT EXISTS address TEXT,
ADD COLUMN IF NOT EXISTS phone TEXT,
ADD COLUMN IF NOT EXISTS email TEXT,
ADD COLUMN IF NOT EXISTS region TEXT;
