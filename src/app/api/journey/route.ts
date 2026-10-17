import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { recordEvent, journeyTrackingEnabled } from '@/lib/journey'
import { getClientIp, rateLimit } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

// ─── BUYER JOURNEY EVENT INGEST (Feature 6) ─────────────────
// Session users record with their userId; anonymous visitors send a
// locally-generated random visitor id (no personal data collected).

const VALID_TYPES = new Set([
  'VISIT', 'PROJECT_VIEW', 'UNIT_VIEW', 'SEARCH', 'SAVE', 'CONTACT', 'WATCH',
])

export async function POST(req: NextRequest) {
  try {
    if (!(await journeyTrackingEnabled())) {
      return NextResponse.json({ tracked: false })
    }

    // Anonymous event ingest — throttle per IP so a bot cannot fill the table.
    const rl = rateLimit(`journey:${getClientIp(req.headers)}`, { limit: 120, windowMs: 60 * 60_000 })
    if (!rl.ok) {
      return NextResponse.json({ tracked: false, throttled: true }, { status: 429 })
    }

    const session = await auth()
    const user = session?.user as { id?: string } | undefined

    const body = await req.json()
    const type = String(body.type || '')
    if (!VALID_TYPES.has(type)) {
      return NextResponse.json({ error: `type must be one of: ${[...VALID_TYPES].join(', ')}` }, { status: 400 })
    }
    const entityType = body.entityType ? String(body.entityType).slice(0, 40) : null
    const entityId = body.entityId ? String(body.entityId).slice(0, 80) : null
    let anonId: string | null = null
    if (!user?.id) {
      anonId = String(body.visitorId || '')
      // Accept only uuid-ish ids (privacy: no emails/phones as identifiers)
      if (!/^[a-zA-Z0-9-]{8,64}$/.test(anonId)) {
        return NextResponse.json({ error: 'A valid visitorId is required for anonymous tracking' }, { status: 400 })
      }
    }

    await recordEvent({
      userId: user?.id || null,
      anonId,
      type,
      entityType,
      entityId,
      meta: body.meta && typeof body.meta === 'object' ? body.meta : undefined,
    })
    return NextResponse.json({ tracked: true })
  } catch (e) {
    console.error('Journey event error:', e)
    return NextResponse.json({ error: 'Failed to record event' }, { status: 500 })
  }
}
