-- ============================================================
-- Migration: 20260605000000_devtools_and_staff_profile
-- Adds developer_mode_enabled and extended staff profile fields
-- ============================================================

ALTER TABLE public.staff
ADD COLUMN developer_mode_enabled BOOLEAN NOT NULL DEFAULT FALSE,
ADD COLUMN employee_id TEXT,
ADD COLUMN department TEXT,
ADD COLUMN age INTEGER,
ADD COLUMN gender TEXT,
ADD COLUMN mobile_number TEXT,
ADD COLUMN email TEXT,
ADD COLUMN address TEXT,
ADD COLUMN emergency_contact TEXT,
ADD COLUMN joining_date DATE,
ADD COLUMN employment_status TEXT,
ADD COLUMN shift_information TEXT,
ADD COLUMN profile_photo TEXT,
ADD COLUMN dob DATE,
ADD COLUMN nationality TEXT,
ADD COLUMN blood_group TEXT,
ADD COLUMN notes TEXT;
