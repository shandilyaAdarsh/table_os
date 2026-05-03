import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://mdwryhxnruprtuqonbwy.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1kd3J5aHhucnVwcnR1cW9uYnd5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ5NzU1MTEsImV4cCI6MjA5MDU1MTUxMX0.5hGdHHSzRnfENndmbL1pdiT2LsqhJCHkz1Fq2-8ADAY'
)

async function checkEmptyOrders() {
  const { data: orders, error } = await supabase
    .from('orders')
    .select('id, table_num, created_at, order_items(id)')
  
  if (error) {
    console.error(error)
    return
  }

  const emptyOrders = orders.filter(o => !o.order_items || o.order_items.length === 0)
  console.log("Empty orders count:", emptyOrders.length)
  console.log("Recent empty orders:", emptyOrders.slice(-5))
}

checkEmptyOrders()
