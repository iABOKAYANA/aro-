import { NextResponse } from 'next/server'
import { requireCEOApi } from '@/lib/permissions'
import { journeyFunnel, journeyDetails, journeyRecentEvents, journeyTrackingEnabled } from '@/lib/journey'

export const dynamic = 'force-dynamic'

// ─── BUYER JOURNEY ANALYTICS (Feature 6) — CEO/ADMIN ────────

export async function GET(req: Request) {
  try {
    const { error } = await requireCEOApi()
    if (error) return error

    const { searchParams } = new URL(req.url)
    const days = Math.min(365, Math.max(1, Number(searchParams.get('days') || 30)))
    const to = new Date()
    const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

    const enabled = await journeyTrackingEnabled()
    const [funnel, details, recent] = await Promise.all([
      journeyFunnel(from, to),
      journeyDetails(from, to),
      journeyRecentEvents(40),
    ])

    // Conversion percentages between consecutive stages
    const withConversion = funnel.map((stage, i) => {
      const prev = i > 0 ? funnel[i - 1].count : null
      return {
        ...stage,
        conversionFromPrev: prev && prev > 0 ? Math.round((stage.count / prev) * 100) : null,
      }
    })

    return NextResponse.json({
      enabled,
      range: { from: from.toISOString(), to: to.toISOString(), days },
      funnel: withConversion,
      details,
      recent,
    })
  } catch (e) {
    console.error('Journey analytics error:', e)
    return NextResponse.json({ error: 'Failed to load journey analytics' }, { status: 500 })
  }
}
