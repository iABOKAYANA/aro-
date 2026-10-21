import { NextResponse } from 'next/server'
import { getFeatureFlags } from '@/lib/feature-flags'

export const dynamic = 'force-dynamic'

/** Public: which customer features are ON right now (client components read this). */
export async function GET() {
  const flags = await getFeatureFlags()
  return NextResponse.json(
    { flags },
    { headers: { 'Cache-Control': 'no-store' } }
  )
}
