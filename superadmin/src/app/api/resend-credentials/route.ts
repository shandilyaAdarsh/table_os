import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import type { CreateTenantAdminResponse } from '@/lib/types'

// ---------------------------------------------------------------------------
// POST /api/resend-credentials
// Called when credential_invites.delivery_status === 'failed'.
// Re-invokes create-tenant-admin which generates a new password, updates the
// invite row, and retries email delivery.
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { tenant_id, email, admin_name } = body

    if (!tenant_id || !email) {
      return NextResponse.json(
        { error: 'tenant_id and email are required' },
        { status: 400 }
      )
    }

    // Verify tenant exists
    const { data: tenant, error: tenantError } = await supabaseAdmin
      .from('tenants')
      .select('id, name')
      .eq('id', tenant_id)
      .single()

    if (tenantError || !tenant) {
      return NextResponse.json(
        { error: 'Tenant not found' },
        { status: 404 }
      )
    }

    const edgeFnUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/resend-credentials`

    const edgeRes = await fetch(edgeFnUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({ tenant_id }),
    })

    const edgeData: CreateTenantAdminResponse = await edgeRes.json()

    if (!edgeRes.ok) {
      return NextResponse.json(
        { error: (edgeData as any).error ?? 'Edge function failed' },
        { status: edgeRes.status }
      )
    }

    const response: Record<string, unknown> = {
      success: true,
      email_sent: edgeData.email_sent,
    }

    // Show dev_credentials only outside production (e.g. for manual delivery)
    if (process.env.NODE_ENV !== 'production' && edgeData.dev_credentials) {
      response.dev_credentials = edgeData.dev_credentials
    }

    return NextResponse.json(response)
  } catch (err: any) {
    console.error('[resend-credentials] error:', err.message)
    return NextResponse.json(
      { error: err.message ?? 'Internal server error' },
      { status: 500 }
    )
  }
}
