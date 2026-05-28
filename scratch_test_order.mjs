import { createClient } from '@supabase/supabase-js';
import path from 'path';
import fs from 'fs';

// Try to load env vars
let envPath = path.resolve('.env.local');
if (!fs.existsSync(envPath)) {
  envPath = path.resolve('.env');
}

let supabaseUrl = 'http://127.0.0.1:54321';
let supabaseKey = '';

if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8');
  const urlMatch = content.match(/VITE_SUPABASE_URL=(.*)/);
  if (urlMatch) supabaseUrl = urlMatch[1].trim();
  
  const keyMatch = content.match(/VITE_SUPABASE_ANON_KEY=(.*)/);
  if (keyMatch) supabaseKey = keyMatch[1].trim();
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function testPlaceOrder() {
  const payload = {
    tenant_id: '11111111-1111-1111-1111-111111111111',
    table_id: null,
    session_id: null,
    table_num: 'T03',
    note: 'Test order from script',
    total_amount: 100,
    guest_name: 'Test Guest',
    guest_phone: null,
    guest_count: 1,
    items: [
      { id: '123e4567-e89b-12d3-a456-426614174000', name: 'Test Item', qty: 1, unit_price: 100 }
    ]
  };

  console.log('Calling place_direct_order...');
  const { data, error } = await supabase.rpc('place_direct_order', { payload });
  
  if (error) {
    console.error('RPC Error:', JSON.stringify(error, null, 2));
  } else {
    console.log('Success!', data);
  }
}

testPlaceOrder().catch(console.error);
