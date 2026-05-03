import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

type ServiceStatus = 'ok' | 'degraded' | 'down'

async function checkDB(): Promise<{ status: ServiceStatus; latencyMs: number }> {
  const start = Date.now()
  try {
    const { error } = await supabase.from('tenants').select('id').limit(1)
    const latencyMs = Date.now() - start
    if (error) return { status: 'down', latencyMs }
    if (latencyMs > 800) return { status: 'degraded', latencyMs }
    return { status: 'ok', latencyMs }
  } catch {
    return { status: 'down', latencyMs: Date.now() - start }
  }
}

async function checkOrders(): Promise<{ status: ServiceStatus; latencyMs: number }> {
  const start = Date.now()
  try {
    const { error } = await supabase.from('orders').select('id', { count: 'exact', head: true })
    const latencyMs = Date.now() - start
    if (error) return { status: 'down', latencyMs }
    if (latencyMs > 800) return { status: 'degraded', latencyMs }
    return { status: 'ok', latencyMs }
  } catch {
    return { status: 'down', latencyMs: Date.now() - start }
  }
}

async function checkAuth(): Promise<{ status: ServiceStatus; latencyMs: number }> {
  const start = Date.now()
  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/health`,
      { signal: AbortSignal.timeout(3000) }
    )
    const latencyMs = Date.now() - start
    if (!res.ok) return { status: 'down', latencyMs }
    if (latencyMs > 800) return { status: 'degraded', latencyMs }
    return { status: 'ok', latencyMs }
  } catch {
    return { status: 'down', latencyMs: Date.now() - start }
  }
}

async function checkStorage(): Promise<{ status: ServiceStatus; latencyMs: number }> {
  const start = Date.now()
  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/status`,
      {
        headers: { Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` },
        signal: AbortSignal.timeout(3000),
      }
    )
    const latencyMs = Date.now() - start
    if (!res.ok) return { status: 'degraded', latencyMs }
    return { status: 'ok', latencyMs }
  } catch {
    return { status: 'degraded', latencyMs: Date.now() - start }
  }
}

export async function GET() {
  const [db, orders, auth, storage] = await Promise.all([
    checkDB(),
    checkOrders(),
    checkAuth(),
    checkStorage(),
  ])

  const score =
    (db.status      === 'ok' ? 1 : db.status      === 'degraded' ? 0.5 : 0) * 0.4 +
    (orders.status  === 'ok' ? 1 : orders.status  === 'degraded' ? 0.5 : 0) * 0.3 +
    (auth.status    === 'ok' ? 1 : auth.status    === 'degraded' ? 0.5 : 0) * 0.2 +
    (storage.status === 'ok' ? 1 : storage.status === 'degraded' ? 0.5 : 0) * 0.1

  const overall: ServiceStatus = score >= 0.99 ? 'ok' : score >= 0.5 ? 'degraded' : 'down'
  const percentage = Math.round(score * 1000) / 10

  return NextResponse.json({
    overall,
    percentage,
    services: { db, orders, auth, storage },
    checkedAt: new Date().toISOString(),
  })
}
