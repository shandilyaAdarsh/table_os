import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  try {
    const { userId } = await req.json()

    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 })
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

    // Use Service Role Key to bypass RLS and avoid infinite recursion issues
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const { data: profile, error } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .single()

    if (error || !profile) {
      console.error('Error fetching profile with service role:', error)
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    return NextResponse.json({ role: profile.role })
  } catch (err) {
    console.error('Check-role API error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
