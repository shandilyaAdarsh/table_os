import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'http://127.0.0.1:54321';
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || 'your-local-supabase-service-key';

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function checkUser(email) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password: 'Test@123456'
  });

  if (error) {
    console.error(`Sign in error for ${email}:`, error.message);
    return;
  }

  const token = data.session.access_token;
  const tenantId = data.user.app_metadata.tenant_id;
  const branchId = data.user.app_metadata.branch_ids[0];

  console.log(`\nUser: ${email}`);
  console.log('Tenant ID:', tenantId);
  console.log('Branch ID:', branchId);

  // Fetch tables
  const res = await fetch(`http://localhost:3001/api/v1/admin/tables?branch_id=${branchId}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'X-Device-Fingerprint': 'test-device-fingerprint'
    }
  });

  const json = await res.json();
  console.log('API Response data count:', json.data ? json.data.length : 0);
  if (json.data && json.data.length > 0) {
    console.log('Tables:', JSON.stringify(json.data, null, 2));
  }
}

async function run() {
  await checkUser('oceanbite.owner@test.com');
  await checkUser('testcafe.owner@test.com');
}

run().catch(console.error);
