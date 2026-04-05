import { createClient } from '@supabase/supabase-js'
import { NextRequest } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const [
    tenantRes,
    ordersRes,
    tablesRes,
    staffRes,
    allOrdersRes,
  ] = await Promise.all([
    supabase.from('tenants').select('*').eq('id', id).single(),
    supabase.from('orders').select('*, order_items(*)').eq('tenant_id', id)
      .order('created_at', { ascending: false }).limit(10),
    supabase.from('restaurant_tables').select('*').eq('tenant_id', id).order('table_num'),
    supabase.from('staff').select('*').eq('tenant_id', id).eq('is_active', true),
    // Last 30 days of orders for charts
    supabase.from('orders').select('id, status, total_amount, created_at, table_num')
      .eq('tenant_id', id)
      .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
      .order('created_at', { ascending: true }),
  ])

  if (tenantRes.error) return Response.json({ error: 'Not found' }, { status: 404 })

  const allOrders = allOrdersRes.data ?? []

  // Orders today
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
  const ordersToday = allOrders.filter(o => new Date(o.created_at) >= todayStart).length

  // Revenue today
  const revenueToday = allOrders
    .filter(o => new Date(o.created_at) >= todayStart)
    .reduce((sum, o) => sum + (o.total_amount ?? 0), 0)

  // Build daily chart data (last 30 days)
  const dailyMap: Record<string, { orders: number; revenue: number }> = {}
  for (let i = 29; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i); d.setHours(0,0,0,0)
    const key = d.toISOString().split('T')[0]
    dailyMap[key] = { orders: 0, revenue: 0 }
  }
  allOrders.forEach(o => {
    const key = o.created_at.split('T')[0]
    if (dailyMap[key]) {
      dailyMap[key].orders++
      dailyMap[key].revenue += o.total_amount ?? 0
    }
  })
  const dailyChart = Object.entries(dailyMap).map(([date, v]) => ({
    date,
    label: new Date(date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
    orders: v.orders,
    revenue: v.revenue,
  }))

  // Status breakdown
  const statusCount: Record<string, number> = {}
  allOrders.forEach(o => { statusCount[o.status] = (statusCount[o.status] ?? 0) + 1 })
  const statusBreakdown = Object.entries(statusCount).map(([status, count]) => ({ status, count }))

  // Total revenue (last 30 days)
  const totalRevenue30 = allOrders.reduce((sum, o) => sum + (o.total_amount ?? 0), 0)
  const totalOrders30 = allOrders.length
  const avgOrderValue = totalOrders30 > 0 ? Math.round(totalRevenue30 / totalOrders30) : 0

  // Top items from order_items
  const topItemsRes = await supabase
    .from('order_items')
    .select('name, qty, unit_price')
    .in('order_id', (ordersRes.data ?? []).map((o: any) => o.id))

  const itemMap: Record<string, { qty: number; revenue: number }> = {}
  ;(topItemsRes.data ?? []).forEach((i: any) => {
    if (!itemMap[i.name]) itemMap[i.name] = { qty: 0, revenue: 0 }
    itemMap[i.name].qty += i.qty
    itemMap[i.name].revenue += i.qty * i.unit_price
  })
  const topItems = Object.entries(itemMap)
    .sort((a, b) => b[1].qty - a[1].qty)
    .slice(0, 8)
    .map(([name, v]) => ({ name, ...v }))

  return Response.json({
    tenant: tenantRes.data,
    recentOrders: ordersRes.data ?? [],
    tables: tablesRes.data ?? [],
    staff: staffRes.data ?? [],
    ordersToday,
    revenueToday,
    dailyChart,
    statusBreakdown,
    totalRevenue30,
    totalOrders30,
    avgOrderValue,
    topItems,
  })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await req.json()
  const allowed = ['name', 'location', 'plan', 'status', 'brand_primary', 'brand_accent']
  const updates: Record<string, any> = {}
  allowed.forEach(k => { if (body[k] !== undefined) updates[k] = body[k] })

  const { data, error } = await supabase
    .from('tenants').update(updates).eq('id', id).select().single()
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json(data)
}
