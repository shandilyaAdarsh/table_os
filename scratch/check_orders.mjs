import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://mdwryhxnruprtuqonbwy.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1kd3J5aHhucnVwcnR1cW9uYnd5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ5NzU1MTEsImV4cCI6MjA5MDU1MTUxMX0.5hGdHHSzRnfENndmbL1pdiT2LsqhJCHkz1Fq2-8ADAY'
)

async function checkOrders() {
  console.log("Fetching orders...")
  const { data: orders, error } = await supabase
    .from('orders')
    .select('*, order_items(*)')
    .order('created_at', { ascending: false })
    .limit(5)

  if (error) {
    console.error("Error fetching orders:", error)
    return
  }

  console.log(JSON.stringify(orders, null, 2))
}

checkOrders()
