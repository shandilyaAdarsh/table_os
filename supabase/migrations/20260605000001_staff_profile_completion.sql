-- ============================================================
-- Migration: 20260605000001_staff_profile_completion
-- Adds fields to public.staff for the profile completion wizard
-- ============================================================

ALTER TABLE public.staff
ADD COLUMN profile_completed BOOLEAN NOT NULL DEFAULT FALSE,
ADD COLUMN profile_completed_at TIMESTAMP WITH TIME ZONE NULL,
ADD COLUMN profile_setup_step INTEGER NOT NULL DEFAULT 1,
ADD COLUMN emergency_contact_name TEXT,
ADD COLUMN emergency_contact_number TEXT;
