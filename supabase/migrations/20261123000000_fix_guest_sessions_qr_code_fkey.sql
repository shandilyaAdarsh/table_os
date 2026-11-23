-- ============================================================================
-- Migration: 20261123000000_fix_guest_sessions_qr_code_fkey.sql
-- Description: Align guest_sessions.qr_code_id FK with modern table_qr_tokens
-- ============================================================================

-- 1. Drop the legacy foreign key pointing to deprecated qr_codes table
ALTER TABLE public.guest_sessions
  DROP CONSTRAINT IF EXISTS guest_sessions_qr_code_id_fkey;

-- 2. Point to modern table_qr_tokens table (NOT VALID ensures existing legacy rows are not rejected)
ALTER TABLE public.guest_sessions
  ADD CONSTRAINT guest_sessions_qr_code_id_fkey
  FOREIGN KEY (qr_code_id) REFERENCES public.table_qr_tokens(id)
  ON DELETE SET NULL
  NOT VALID;
