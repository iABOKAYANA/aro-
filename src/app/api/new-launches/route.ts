import { NextResponse } from 'next/server'
import { computeNewLaunches, DEFAULT_NEW_LAUNCHES_CONFIG } from '@/lib/new-launches'

export const dynamic = 'force-dynamic'

// ─── GET /api/new-launches — public homepage band ──────────
// Server-computed: honors the CEO's window/limit/pin/hide config.
// Fail-soft: the homepage must never break because of this band.
export async function GET() {
  try {
    const { config, items } = await computeNewLaunches()
    return NextResponse.json({
      items,
      config: {
        enabled: config.enabled,
        windowDays: config.windowDays,
        limit: config.limit,
        pinnedCount: config.pinnedIds.length,
        hiddenCount: config.hiddenIds.length,
      },
    })
  } catch (error) {
    console.error('New launches GET error:', error)
    return NextResponse.json({
      items: [],
      config: {
        enabled: DEFAULT_NEW_LAUNCHES_CONFIG.enabled,
        windowDays: DEFAULT_NEW_LAUNCHES_CONFIG.windowDays,
        limit: DEFAULT_NEW_LAUNCHES_CONFIG.limit,
        pinnedCount: 0,
        hiddenCount: 0,
      },
    })
  }
}
