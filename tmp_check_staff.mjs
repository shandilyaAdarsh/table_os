// Quick script to list staff accounts in the DB
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://mdwryhxnruprtuqonbwy.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1kd3J5aHhucnVwcnR1cW9uYnd5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ5NzU1MTEsImV4cCI6MjA5MDU1MTUxMX0.5hGdHHSzRnfENndmbL1pdiT2LsqhJCHkz1Fq2-8ADAY'
)

const { data, error } = await supabase
  .from('staff')
  .select('email, role, is_active, pin, tenant_id')
  .eq('is_active', true)
  .limit(20)

if (error) {
  console.error('Error:', JSON.stringify(error, null, 2))
} else {
  console.log('Active staff accounts:')
  data.forEach(s => {
    console.log(`  ${s.email} | role: ${s.role} | pin: ${s.pin} | tenant: ${s.tenant_id?.slice(0,8)}...`)
  })
}

// Also check orders
const { data: orders, error: ordErr } = await supabase
  .from('orders')
  .select('id, table_num, status, tenant_id')
  .not('status', 'eq', 'served')
  .limit(10)

if (ordErr) {
  console.error('Orders error:', JSON.stringify(ordErr, null, 2))
} else {
  console.log('\nActive orders:')
  orders.forEach(o => {
    console.log(`  T${o.table_num} | ${o.status} | tenant: ${o.tenant_id?.slice(0,8)}...`)
  })
}
