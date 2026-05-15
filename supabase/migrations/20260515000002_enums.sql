-- ============================================================
-- Migration: 002_enums
-- ============================================================

DO $$ BEGIN
  CREATE TYPE public.admin_role AS ENUM (
    'SUPER_ADMIN',
    'RESTAURANT_ADMIN',
    'MANAGER',
    'STAFF'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.auth_event_type AS ENUM (
    'LOGIN_SUCCESS',
    'LOGIN_FAILED',
    'LOGOUT',
    'TOKEN_REFRESH',
    'PASSWORD_RESET_REQUESTED',
    'PASSWORD_RESET_COMPLETED',
    'SESSION_EXPIRED',
    'SESSION_REVOKED',
    'ACCOUNT_LOCKED',
    'SUSPICIOUS_ACTIVITY'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
