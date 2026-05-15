-- ============================================================
-- Migration: 013_menu_enums
-- All enums for the Menu Foundation module.
-- ============================================================

DO $$ BEGIN
  CREATE TYPE public.menu_item_status AS ENUM (
    'active',
    'inactive',
    'archived'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.spice_level AS ENUM (
    'none',
    'mild',
    'medium',
    'hot',
    'extra_hot'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.pricing_type AS ENUM (
    'fixed',       -- Standard fixed price
    'variable',    -- Per-weight or custom
    'complimentary' -- Free item
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.tax_calculation_mode AS ENUM (
    'inclusive',   -- Tax included in displayed price
    'exclusive'    -- Tax added on top of displayed price
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.service_type AS ENUM (
    'dine_in',
    'takeaway',
    'delivery'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.availability_day AS ENUM (
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
    'sunday'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
