-- Migration: onboarding_step_1
-- Adds restaurant core info and onboarding state to the tenants table.

ALTER TABLE public.tenants 
ADD COLUMN IF NOT EXISTS display_name VARCHAR(255) NULL,
ADD COLUMN IF NOT EXISTS city VARCHAR(100) NULL,
ADD COLUMN IF NOT EXISTS state VARCHAR(100) NULL,
ADD COLUMN IF NOT EXISTS full_address TEXT NULL,
ADD COLUMN IF NOT EXISTS timezone VARCHAR(50) NULL,
ADD COLUMN IF NOT EXISTS onboarding_step INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT FALSE;
