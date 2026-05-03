import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://mdwryhxnruprtuqonbwy.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1kd3J5aHhucnVwcnR1cW9uYnd5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ5NzU1MTEsImV4cCI6MjA5MDU1MTUxMX0.5hGdHHSzRnfENndmbL1pdiT2LsqhJCHkz1Fq2-8ADAY'
)

async function test() {
  const tid = '11111111-1111-1111-1111-111111111111'
  
  // 1. Insert order
  const { data: order, error: insErr } = await supabase.from('orders').insert({
    tenant_id: tid,
    table_num: 'TEST',
    status: 'pending'
  }).select().single()

  if (insErr) {
    console.error("Insert failed:", insErr.message)
    return
  }
  const id = order.id
  console.log("Created order:", id)

  // 2. Try 'rejected'
  const { error: e1 } = await supabase
    .from('orders')
    .update({ status: 'rejected' })
    .eq('id', id)
  
  console.log("Error for rejected:", e1 ? e1.message : "SUCCESS")

  // 3. Try 'cancelled'
  const { error: e2 } = await supabase
    .from('orders')
    .update({ status: 'cancelled' })
    .eq('id', id)
  
  console.log("Error for cancelled:", e2 ? e2.message : "SUCCESS")
}

test()
