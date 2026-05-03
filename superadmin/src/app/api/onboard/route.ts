import { randomBytes } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a URL-safe slug like "chintu-restro-a3f9" */
function generateSlug(restaurantName: string): string {
  const base = restaurantName
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  const suffix = randomBytes(2).toString('hex') // 4-char random
  return `${base}-${suffix}`
}

/** Monthly Recurring Revenue logic for Sub-Architect */
function calculateMRR(plan: string, billingCycle: string): number {
  const pricing: Record<string, Record<string, number>> = {
    starter: { monthly: 2999, yearly: 2499 },
    pro: { monthly: 5999, yearly: 4999 },
    enterprise: { monthly: 11999, yearly: 9999 },
  }
  return pricing[plan.toLowerCase()]?.[billingCycle.toLowerCase()] ?? 5999
}

// ---------------------------------------------------------------------------
// POST /api/onboard
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  let createdTenantId: string | null = null

  try {
    const body = await req.json()

    const {
      restaurantName,
      location = '',
      ownerName,
      ownerEmail,
      pin = '0000',
      plan = 'pro',
      billingCycle = 'monthly',
      tables = 15,
    } = body

    if (!ownerEmail || !restaurantName) {
      return NextResponse.json(
        { error: 'email and restaurant_name required' },
        { status: 400 }
      )
    }

    // ── 2. Slug & MRR Calculation ────────────────────────────────────────
    const slug = generateSlug(restaurantName)
    const mrr = calculateMRR(plan, billingCycle)

    // ── 3. Create Tenant (with Trial Metadata) ───────────────────────────
    const { data: tenant, error: tenantError } = await supabaseAdmin
      .from('tenants')
      .insert({
        name: restaurantName,
        slug,
        location,
        plan: plan.toLowerCase(),
        status: 'trial',
        mrr,
        plan_started_at: new Date().toISOString(),
        next_billing_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      })
      .select('id')
      .single()

    if (tenantError || !tenant) {
      return NextResponse.json(
        { error: 'Failed to create tenant', details: tenantError?.message },
        { status: 500 }
      )
    }

    createdTenantId = tenant.id
    const tenant_id = tenant.id

    // ── 4. Default Tables ────────────────────────────────────────────────
    const tableRows = Array.from({ length: Math.max(1, Number(tables)) }, (_, i) => ({
      tenant_id: tenant_id,
      table_num: `T${String(i + 1).padStart(2, '0')}`,
      status: 'vacant',
      capacity: 4,
      floor: 1,
    }))

    const { error: tablesError } = await supabaseAdmin
      .from('restaurant_tables')
      .insert(tableRows)

    if (tablesError) throw new Error(`Tables insert failed: ${tablesError.message}`)

    // ── 5. Staff / Owner Record ──────────────────────────────────────────
    const { error: staffError } = await supabaseAdmin.from('staff').insert({
      tenant_id: tenant_id,
      name: ownerName,
      role: 'owner',
      pin,
      is_active: true,
    })

    if (staffError) throw new Error(`Staff insert failed: ${staffError.message}`)

    // ── 6. Trigger Edge Function ─────────────────────────────────────────
    const edgeFnUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/onboard-admin`

    const edgeRes = await fetch(edgeFnUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        email: ownerEmail,
        restaurant_name: restaurantName,
        tenant_id: tenant_id,
        admin_name: ownerName,
      }),
    })

    const edgeData = await edgeRes.json()

    // Handle 409 Conflict (Email already exists)
    if (edgeRes.status === 409 || (edgeData.error && edgeData.error.includes('already exists'))) {
      throw new Error('An admin account for this email already exists.')
    }

    if (!edgeRes.ok || edgeData.success !== true || !edgeData.user_id) {
      console.error('[onboard] edge function failed:', edgeData)
      throw new Error(edgeData?.message || edgeData?.error || 'Edge function failed to create user or send credentials')
    }

    const newUserId = edgeData.user_id

    // ── 7. Admin Profile (Idempotent) ────────────────────────────────────
    const { error: profileError } = await supabaseAdmin.from('profiles').upsert({
      id: newUserId,
      tenant_id,
      full_name: ownerName,
      role: 'owner',
      is_active: true,
    }, { onConflict: 'id' })

    if (profileError) throw new Error(`Profile upsert failed: ${profileError.message}`)

    // ── 8. Success ───────────────────────────────────────────────────────
    return NextResponse.json({
      success: true,
      message: 'Tenant created and credentials sent successfully',
      tenantId: tenant_id,
      tenantName: restaurantName,
      adminEmail: ownerEmail,
      email_sent: edgeData.email_sent !== false
    })
  } catch (err: any) {
    console.error('[onboard] critical error:', err.message)
    
    // ROLLBACK: Delete tenant if it was created
    if (createdTenantId) {
      console.log(`[onboard] rolling back tenant: ${createdTenantId}`)
      await supabaseAdmin.from('tenants').delete().eq('id', createdTenantId)
    }

    // Return the specific error message if it's one of ours, otherwise generic
    const isConflict = err.message.includes('already exists')
    return NextResponse.json(
      { error: err.message || 'Internal server error' }, 
      { status: isConflict ? 409 : 500 }
    )
  }
}
