import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET() {
  try {
    const [metricsRes, mrrRes, activityRes, tenantsRes] = await Promise.all([
      supabase.from('dashboard_metrics').select('*').single(),
      supabase.from('mrr_monthly').select('*').order('month_date', { ascending: true }),
      supabase.from('recent_activity').select('*').limit(15),
      supabase.from('tenants').select('id,name,slug,plan,status,location,mrr,created_at').order('created_at', { ascending: false }).limit(10),
    ])

    return NextResponse.json({
      metrics: metricsRes.data,
      mrrMonthly: mrrRes.data ?? [],
      activity: activityRes.data ?? [],
      tenants: tenantsRes.data ?? [],
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
