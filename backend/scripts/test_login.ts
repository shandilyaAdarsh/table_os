import { createClient } from '@supabase/supabase-js';
import { env } from '../src/config/env';
import { supabaseAdmin } from '../src/config/supabase';

async function test() {
  const throwawayClient = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const email = 'testcafe.admin@test.com';
  const password = 'password123'; // Guessing common password, or we just check if the user exists

  const { data, error } = await supabaseAdmin.auth.admin.listUsers();
  if (error) {
    console.error('List Users Error:', error);
  } else {
    console.log('Users:', data.users.map(u => u.email));
  }
}

test();
