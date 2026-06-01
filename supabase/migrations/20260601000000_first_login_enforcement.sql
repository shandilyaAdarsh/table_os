-- ============================================================
-- Migration: First Login Enforcement
-- 
-- Implements database schema requirements for tracking newly
-- provisioned users who require a mandatory password reset.
-- ============================================================

-- Add columns if they do not already exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'admin_profiles' 
          AND column_name = 'is_first_login'
    ) THEN
        ALTER TABLE public.admin_profiles 
        ADD COLUMN is_first_login BOOLEAN DEFAULT TRUE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'admin_profiles' 
          AND column_name = 'password_updated_at'
    ) THEN
        ALTER TABLE public.admin_profiles 
        ADD COLUMN password_updated_at TIMESTAMP WITH TIME ZONE NULL;
    END IF;
END $$;
