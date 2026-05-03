import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://mdwryhxnruprtuqonbwy.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1kd3J5aHhucnVwcnR1cW9uYnd5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ5NzU1MTEsImV4cCI6MjA5MDU1MTUxMX0.5hGdHHSzRnfENndmbL1pdiT2LsqhJCHkz1Fq2-8ADAY'
)

async function run() {
  // Create an order
  const { data: order, error } = await supabase.from('orders').insert({
    tenant_id: '11111111-1111-1111-1111-111111111111',
    table_num: 'TT09',
    status: 'pending'
  }).select().single()

  if (error) {
    console.error("Order error", error)
    return
  }

  console.log("Created order", order.id)

  const { data: item1, error: e1 } = await supabase.from('order_items').insert({
    order_id: order.id,
    name: 'Spicy Rigatoni',
    qty: 2,
    unit_price: 0,
    station: 'pasta',
    is_rejected: false,
    done: false
  })

  const { data: item2, error: e2 } = await supabase.from('order_items').insert({
    order_id: order.id,
    name: 'Tiramisu',
    qty: 1,
    unit_price: 0,
    station: 'dessert',
    is_rejected: false,
    done: false
  })

  if (e1 || e2) {
    console.error("Item error", e1, e2)
  }

  console.log("Successfully created test order with items!")
}

run()
