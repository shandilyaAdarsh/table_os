import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function POST(req: Request) {
  try {
    const { tenant_id } = await req.json()

    if (!tenant_id) {
      return NextResponse.json({ error: 'tenant_id is required' }, { status: 400 })
    }

    console.log(`[delete-tenant] Starting cascading delete for tenant: ${tenant_id}`)

    // 1. Get profile id for Auth User deletion later
    const { data: profile, error: profileFetchError } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('tenant_id', tenant_id)
      .single()

    if (profileFetchError && profileFetchError.code !== 'PGRST116') {
      console.error('[delete-tenant] Error fetching profile:', profileFetchError)
    }

    const authUserId = profile?.id

    // 2. Get order IDs for order_items deletion
    const { data: ordersData, error: ordersFetchError } = await supabaseAdmin
      .from('orders')
      .select('id')
      .eq('tenant_id', tenant_id)

    if (ordersFetchError) {
      console.error('[delete-tenant] Error fetching orders:', ordersFetchError)
    }

    const orderIds = ordersData?.map(o => o.id) || []

    // ── CASCADE DELETE SEQUENCE ──────────────────────────────────────────

    // 3. Delete order_items
    if (orderIds.length > 0) {
      const { error: itemsError } = await supabaseAdmin
        .from('order_items')
        .delete()
        .in('order_id', orderIds)
      if (itemsError) throw new Error(`order_items: ${itemsError.message}`)
    }

    // 4. Delete assistance_requests
    const { error: assistError } = await supabaseAdmin
      .from('assistance_requests')
      .delete()
      .eq('tenant_id', tenant_id)
    if (assistError) throw new Error(`assistance_requests: ${assistError.message}`)

    // 5. Delete orders
    const { error: ordersDeleteError } = await supabaseAdmin
      .from('orders')
      .delete()
      .eq('tenant_id', tenant_id)
    if (ordersDeleteError) throw new Error(`orders: ${ordersDeleteError.message}`)

    // 6. Delete restaurant_tables
    const { error: tablesError } = await supabaseAdmin
      .from('restaurant_tables')
      .delete()
      .eq('tenant_id', tenant_id)
    if (tablesError) throw new Error(`restaurant_tables: ${tablesError.message}`)

    // 7. Delete menu_items
    const { error: menuError } = await supabaseAdmin
      .from('menu_items')
      .delete()
      .eq('tenant_id', tenant_id)
    if (menuError) throw new Error(`menu_items: ${menuError.message}`)

    // 8. Delete staff
    const { error: staffError } = await supabaseAdmin
      .from('staff')
      .delete()
      .eq('tenant_id', tenant_id)
    if (staffError) throw new Error(`staff: ${staffError.message}`)

    // 9. Delete profiles
    const { error: profileDeleteError } = await supabaseAdmin
      .from('profiles')
      .delete()
      .eq('tenant_id', tenant_id)
    if (profileDeleteError) throw new Error(`profiles: ${profileDeleteError.message}`)

    // 10. Delete tenant
    const { error: tenantDeleteError } = await supabaseAdmin
      .from('tenants')
      .delete()
      .eq('id', tenant_id)
    if (tenantDeleteError) throw new Error(`tenants: ${tenantDeleteError.message}`)

    // 11. Delete Auth User from Supabase
    if (authUserId) {
      const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(authUserId)
      if (authError) {
        console.error('[delete-tenant] Warning: Auth user delete failed:', authError)
        // We don't throw here because the DB data is already gone
      }
    }

    console.log(`[delete-tenant] Successfully deleted tenant ${tenant_id}`)
    return NextResponse.json({ success: true })

  } catch (err: any) {
    console.error('[delete-tenant] Global failure:', err.message)
    return NextResponse.json({ error: err.message || 'Failed to delete tenant' }, { status: 500 })
  }
}
