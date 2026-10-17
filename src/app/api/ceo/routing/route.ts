import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireCEOApi, logAudit } from '@/lib/permissions'
import {
  ROUTING_KEY,
  getRoutingConfig,
  validateRoutingDoc,
} from '@/lib/lead-routing'

export const dynamic = 'force-dynamic'

// ─── GET /api/ceo/routing — returns the routing doc ───────
// Shape: {mode: 'off'|'round-robin', weights: {brokerId: n},
//   whitelist: string[], fallback: 'unassigned'|'first-active'}.
// Stored in SystemSetting key `routing.config` (category "routing"); missing
// or corrupt row → defaults (mode 'off'). NOTE: this route reads/writes the
// key directly via Prisma — it never goes through /api/settings, so that
// route's section whitelist does not apply and was intentionally left alone.
export async function GET() {
  try {
    const { error } = await requireCEOApi()
    if (error) return error
    return NextResponse.json(await getRoutingConfig())
  } catch (err) {
    console.error('CEO routing GET error:', err)
    return NextResponse.json({ error: 'Failed to load routing config' }, { status: 500 })
  }
}

// ─── POST /api/ceo/routing — full doc replace (CEO-only) ──
// Body IS the doc (validated server-side, same fixed shape as GET).
export async function POST(req: Request) {
  try {
    const { error, session } = await requireCEOApi()
    if (error) return error
    const actorId = (session!.user as any)?.id as string

    const body = (await req.json().catch(() => null)) as unknown
    const validated = validateRoutingDoc(body)
    if (!validated.ok) {
      return NextResponse.json({ error: validated.error }, { status: 400 })
    }
    await db.systemSetting.upsert({
      where: { key: ROUTING_KEY },
      update: { value: JSON.stringify(validated.doc), category: 'routing' },
      create: { key: ROUTING_KEY, value: JSON.stringify(validated.doc), category: 'routing' },
    })
    await logAudit({
      userId: actorId,
      action: 'ROUTING_CONFIG_UPDATED',
      entity: 'SystemSetting',
      entityId: ROUTING_KEY,
      changes: { config: validated.doc },
    })
    return NextResponse.json(validated.doc)
  } catch (err) {
    console.error('CEO routing POST error:', err)
    return NextResponse.json({ error: 'Failed to save routing config' }, { status: 500 })
  }
}
