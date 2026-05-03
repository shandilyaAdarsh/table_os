import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://mdwryhxnruprtuqonbwy.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1kd3J5aHhucnVwcnR1cW9uYnd5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ5NzU1MTEsImV4cCI6MjA5MDU1MTUxMX0.5hGdHHSzRnfENndmbL1pdiT2LsqhJCHkz1Fq2-8ADAY'
const tenantId = '11111111-1111-1111-1111-111111111111'

const supabase = createClient(supabaseUrl, supabaseKey)

async function testCancellation() {
  // 1. Find a pending order
  const { data: orders } = await supabase
    .from('orders')
    .select('id, status')
    .eq('tenant_id', tenantId)
    .eq('status', 'pending')
    .limit(1)

  if (!orders || orders.length === 0) {
    console.log('No pending orders found to test with.')
    return
  }

  const orderId = orders[0].id
  console.log(`Found pending order: ${orderId}`)

  // 2. Perform rejection
  console.log('Rejecting order...')
  const { error: orderError } = await supabase
    .from('orders')
    .update({ status: 'rejected', is_new: false })
    .eq('id', orderId)
    .eq('tenant_id', tenantId)

  if (orderError) {
    console.error('Error rejecting order:', orderError)
    return
  }

  const { error: itemsError } = await supabase
    .from('order_items')
    .update({ is_rejected: true })
    .eq('order_id', orderId)

  if (itemsError) {
    console.error('Error rejecting items:', itemsError)
  }

  console.log('Rejection successful.')

  // 3. Verify it is NOT returned by the filtered query
  console.log('Verifying filtered query...')
  const { data: filteredOrders } = await supabase
    .from('orders')
    .select('id, status')
    .eq('tenant_id', tenantId)
    .not('status', 'in', '("served","rejected")')

  const found = filteredOrders.find(o => o.id === orderId)
  if (found) {
    console.error(`BUG DETECTED: Order ${orderId} still returned with status: ${found.status}`)
  } else {
    console.log('SUCCESS: Order is correctly filtered out.')
  }
}

testCancellation()
