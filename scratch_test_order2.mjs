import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://mdwryhxnruprtuqonbwy.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1kd3J5aHhucnVwcnR1cW9uYnd5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ5NzU1MTEsImV4cCI6MjA5MDU1MTUxMX0.5hGdHHSzRnfENndmbL1pdiT2LsqhJCHkz1Fq2-8ADAY'
)

async function testPlaceOrder() {
  console.log('Testing simple order insertion...');
  const { data: order, error } = await supabase.from('orders').insert({
    tenant_id: '11111111-1111-1111-1111-111111111111',
    table_num: 'T03',
    status: 'pending',
    note: 'Test simple insertion'
  }).select().single();

  if (error) {
    console.error('Order Error:', error);
    return;
  }
  
  console.log('Order created:', order.id);

  const { error: itemsError } = await supabase.from('order_items').insert([{
    order_id: order.id,
    name: 'Test Item',
    qty: 1,
    unit_price: 100
  }]);

  if (itemsError) {
    console.error('Items Error:', itemsError);
  } else {
    console.log('Success!');
  }
}

testPlaceOrder().catch(console.error);
