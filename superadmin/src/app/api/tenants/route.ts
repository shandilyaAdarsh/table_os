import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const q      = searchParams.get('q')?.trim() ?? ''
  const status = searchParams.get('status') ?? ''
  const plan   = searchParams.get('plan') ?? ''
  const page   = parseInt(searchParams.get('page') ?? '1')
  const limit  = parseInt(searchParams.get('limit') ?? '6')
  const offset = (page - 1) * limit

  let query = supabase
    .from('tenants')
    .select('id,name,slug,plan,status,location,mrr,created_at', { count: 'exact' })
    .order('created_at', { ascending: false })

  if (q)      query = query.or(`name.ilike.%${q}%,slug.ilike.%${q}%,location.ilike.%${q}%`)
  if (status) query = query.eq('status', status)
  if (plan)   query = query.eq('plan', plan)

  query = query.range(offset, offset + limit - 1)

  const { data, count, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // For each tenant get orders_today + table stats + credential delivery status
  const enriched = await Promise.all((data ?? []).map(async (t) => {
    const [ordersRes, tablesRes, inviteRes] = await Promise.all([
      supabase.from('orders').select('id', { count: 'exact', head: true })
        .eq('tenant_id', t.id).gte('created_at', new Date().toISOString().split('T')[0]),
      supabase.from('restaurant_tables').select('id,status')
        .eq('tenant_id', t.id),
      supabase.from('credential_invites')
        .select('id,email,delivery_status,delivery_attempts,sent_at')
        .eq('tenant_id', t.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])
    const totalTables    = tablesRes.data?.length ?? 0
    const occupiedTables = tablesRes.data?.filter(r => r.status === 'occupied').length ?? 0
    return {
      ...t,
      orders_today:    ordersRes.count ?? 0,
      total_tables:    totalTables,
      occupied_tables: occupiedTables,
      credential_invite: inviteRes.data ?? null,
    }
  }))

  return NextResponse.json({
    tenants: enriched,
    total:   count ?? 0,
    page,
    limit,
    pages:   Math.ceil((count ?? 0) / limit),
  })
}
