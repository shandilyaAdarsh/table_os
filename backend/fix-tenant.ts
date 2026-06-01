import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '.env') });

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const tenantId = 'ce3c48e2-17e9-4f73-90b2-72da06753a76';
  
  const { data, error } = await supabase
    .from('tenants')
    .insert([
      {
        id: tenantId,
        name: 'Royal Tandoor',
        slug: 'royal-tandoor',
        status: 'active',
        onboarding_step: 1,
        onboarding_completed: false
      }
    ])
    .select();

  if (error) {
    if (error.code === '23505') {
      console.log('Tenant already exists!');
    } else {
      console.error('Error inserting tenant:', error);
    }
  } else {
    console.log('Successfully inserted tenant:', data);
  }
}

main();
