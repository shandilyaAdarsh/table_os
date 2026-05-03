import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const q = searchParams.get('q')?.trim() ?? ''

  if (!q || q.length < 2) {
    return NextResponse.json({ results: [] })
  }

  const { data, error } = await supabase
    .from('tenants')
    .select('id, name, slug, plan, status, location, mrr')
    .or(`name.ilike.%${q}%,slug.ilike.%${q}%,location.ilike.%${q}%`)
    .limit(8)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ results: data ?? [] })
}
