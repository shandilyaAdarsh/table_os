import { createClient } from '@supabase/supabase-js'


const supabaseUrl = 'https://mdwryhxnruprtuqonbwy.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1kd3J5aHhucnVwcnR1cW9uYnd5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ5NzU1MTEsImV4cCI6MjA5MDU1MTUxMX0.5hGdHHSzRnfENndmbL1pdiT2LsqhJCHkz1Fq2-8ADAY'
const tenantId = '11111111-1111-1111-1111-111111111111'

const supabase = createClient(supabaseUrl, supabaseKey)

async function checkOrders() {
  const { data, error } = await supabase
    .from('orders')
    .select('id, status, created_at, is_new')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(20)

  if (error) {
    console.error('Error fetching orders:', error)
    return
  }

  console.log(JSON.stringify(data, null, 2))
}

checkOrders()
