import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'

export async function GET() {
  try {
    const session = await auth()

    if (!session) {
      return NextResponse.json({ error: 'Not authenticated', session: null }, { status: 401 })
    }

    return NextResponse.json({ session })
  } catch (error) {
    console.error('Auth check error:', error)
    return NextResponse.json({ error: 'Failed to check auth' }, { status: 500 })
  }
}
