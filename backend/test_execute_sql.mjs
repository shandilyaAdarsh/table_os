import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const createOnboardingStateTableQuery = `
CREATE TABLE IF NOT EXISTS public.onboarding_state (
  tenant_id UUID PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  is_skipped BOOLEAN NOT NULL DEFAULT false,
  is_complete BOOLEAN NOT NULL DEFAULT false,
  steps_completed TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`;

const enableRlsQuery = `
ALTER TABLE public.onboarding_state ENABLE ROW LEVEL SECURITY;
`;

const recreatePoliciesQuery = `
DROP POLICY IF EXISTS "Platform users can manage onboarding state" ON public.onboarding_state;
CREATE POLICY "Platform users can manage onboarding state" ON public.onboarding_state
  FOR ALL
  USING (true);
`;

async function run() {
  console.log("Creating public.onboarding_state table...");
  const { data: data1, error: err1 } = await supabase.rpc('execute_sql_raw', {
    sql_query: createOnboardingStateTableQuery,
    params: []
  });

  if (err1) {
    console.error("Error creating onboarding_state table:", err1.message);
  } else {
    console.log("Successfully created public.onboarding_state table.");
  }

  console.log("Enabling RLS and policies...");
  const { data: data2, error: err2 } = await supabase.rpc('execute_sql_raw', {
    sql_query: enableRlsQuery + recreatePoliciesQuery,
    params: []
  });

  if (err2) {
    console.error("Error setting up RLS/policies:", err2.message);
  } else {
    console.log("Successfully enabled RLS and setup policies.");
  }
}

run().catch(console.error);
