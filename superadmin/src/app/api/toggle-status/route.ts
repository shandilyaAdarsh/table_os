import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function POST(req: NextRequest) {
  try {
    const { tenant_id, action } = await req.json()

    if (!tenant_id || !['suspend', 'reactivate'].includes(action)) {
      return NextResponse.json(
        { error: 'Valid tenant_id and action (suspend/reactivate) are required' },
        { status: 400 }
      )
    }

    // Call the RPC toggle_tenant_status
    const { data, error } = await supabaseAdmin.rpc('toggle_tenant_status', {
      p_tenant_id: tenant_id,
      p_action: action
    })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ success: true, data })
  } catch (err: any) {
    console.error('[toggle-status] error:', err.message)
    return NextResponse.json(
      { error: err.message ?? 'Internal server error' },
      { status: 500 }
    )
  }
}
