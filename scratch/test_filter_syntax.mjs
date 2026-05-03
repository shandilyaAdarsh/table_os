import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://mdwryhxnruprtuqonbwy.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1kd3J5aHhucnVwcnR1cW9uYnd5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ5NzU1MTEsImV4cCI6MjA5MDU1MTUxMX0.5hGdHHSzRnfENndmbL1pdiT2LsqhJCHkz1Fq2-8ADAY'
const tenantId = '11111111-1111-1111-1111-111111111111'

const supabase = createClient(supabaseUrl, supabaseKey)

async function testFilter() {
  console.log('Testing query: .not("status", "in", "(\"served\",\"rejected\")")')
  const { data, error } = await supabase
    .from('orders')
    .select('id, status')
    .eq('tenant_id', tenantId)
    .not('status', 'in', '("served","rejected")')

  if (error) {
    console.error('Query error:', error)
    return
  }

  console.log(`Results count: ${data.length}`)
  const invalid = data.filter(o => o.status === 'served' || o.status === 'rejected')
  if (invalid.length > 0) {
    console.error('FILTER FAILED! Found terminal orders:', invalid)
  } else {
    console.log('Filter worked correctly.')
  }
}

testFilter()
