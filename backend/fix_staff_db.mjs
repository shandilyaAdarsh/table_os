import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config({ path: 'c:/Users/ASUS/OneDrive/Desktop/Coding/Astrology.project/table_os/backend/.env' });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const sql1 = `
-- Migration 0: Devtools and Staff Profile Additions
ALTER TABLE public.staff
ADD COLUMN IF NOT EXISTS developer_mode_enabled BOOLEAN NOT NULL DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS employee_id TEXT,
ADD COLUMN IF NOT EXISTS department TEXT,
ADD COLUMN IF NOT EXISTS age INTEGER,
ADD COLUMN IF NOT EXISTS gender TEXT,
ADD COLUMN IF NOT EXISTS mobile_number TEXT,
ADD COLUMN IF NOT EXISTS email TEXT,
ADD COLUMN IF NOT EXISTS address TEXT,
ADD COLUMN IF NOT EXISTS emergency_contact TEXT,
ADD COLUMN IF NOT EXISTS joining_date DATE,
ADD COLUMN IF NOT EXISTS employment_status TEXT,
ADD COLUMN IF NOT EXISTS shift_information TEXT,
ADD COLUMN IF NOT EXISTS profile_photo TEXT,
ADD COLUMN IF NOT EXISTS dob DATE,
ADD COLUMN IF NOT EXISTS nationality TEXT,
ADD COLUMN IF NOT EXISTS blood_group TEXT,
ADD COLUMN IF NOT EXISTS notes TEXT;
`;

const sql2 = `
-- Migration 1: Profile Completion Additions
ALTER TABLE public.staff
ADD COLUMN IF NOT EXISTS profile_completed BOOLEAN NOT NULL DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS profile_completed_at TIMESTAMP WITH TIME ZONE NULL,
ADD COLUMN IF NOT EXISTS profile_setup_step INTEGER NOT NULL DEFAULT 1,
ADD COLUMN IF NOT EXISTS emergency_contact_name TEXT,
ADD COLUMN IF NOT EXISTS emergency_contact_number TEXT;
`;

const reloadSchema = `
NOTIFY pgrst, 'reload schema';
`;

async function run() {
  console.log("Applying devtools schema updates...");
  const { error: err1 } = await supabase.rpc('execute_sql_raw', { sql_query: sql1, params: [] });
  if (err1) console.error("Err 1:", err1);
  else console.log("OK 1");

  console.log("Applying profile completion updates...");
  const { error: err2 } = await supabase.rpc('execute_sql_raw', { sql_query: sql2, params: [] });
  if (err2) console.error("Err 2:", err2);
  else console.log("OK 2");

  console.log("Reloading PostgREST schema cache...");
  const { error: err3 } = await supabase.rpc('execute_sql_raw', { sql_query: reloadSchema, params: [] });
  if (err3) console.error("Err 3:", err3);
  else console.log("OK 3");
}

run().catch(console.error);
