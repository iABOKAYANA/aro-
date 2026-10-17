import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireCEOApi, logAudit } from '@/lib/permissions'
import { MONTH_RE, currentMonth, getTargetsProgress } from '@/lib/targets'

export const dynamic = 'force-dynamic'

// ─── GET /api/ceo/targets?month=YYYY-MM ───────────────────
// Lists EVERY broker profile with monthly progress. Brokers without a
// BrokerTarget row for the month are included with zeros + hasTarget:false.
// Item: {brokerId (BrokerProfile id), name, month, targetDeals, targetValue,
//   actualDeals, actualValue, pctDeals, pctValue, hasTarget}.
// Actuals: SOLD deals whose (saleDate ?? createdAt) falls in the month.
export async function GET(req: Request) {
  try {
    const { error } = await requireCEOApi()
    if (error) return error

    const { searchParams } = new URL(req.url)
    const month = searchParams.get('month') || currentMonth()
    if (!MONTH_RE.test(month)) {
      return NextResponse.json({ error: 'month must be YYYY-MM' }, { status: 400 })
    }

    const targets = await getTargetsProgress(month)
    return NextResponse.json({ month, targets })
  } catch (err) {
    console.error('CEO targets GET error:', err)
    return NextResponse.json({ error: 'Failed to load targets' }, { status: 500 })
  }
}

// ─── POST /api/ceo/targets ────────────────────────────────
// Body: {brokerId* (BrokerProfile id OR User id — resolved server-side),
//   month* (YYYY-MM), targetDeals? (int >= 0, default 0),
//   targetValue? (number >= 0, default 0)}. Upserts the BrokerTarget row.
export async function POST(req: Request) {
  try {
    const { error, session } = await requireCEOApi()
    if (error) return error
    const actorId = (session!.user as any)?.id as string

    const body = (await req.json().catch(() => null)) as Record<string, any> | null
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
    }
    const brokerId = typeof body.brokerId === 'string' ? body.brokerId.trim() : ''
    if (!brokerId) return NextResponse.json({ error: 'brokerId required' }, { status: 400 })
    const month = typeof body.month === 'string' ? body.month.trim() : ''
    if (!MONTH_RE.test(month)) {
      return NextResponse.json({ error: 'month must be YYYY-MM' }, { status: 400 })
    }
    const targetDeals = body.targetDeals === undefined || body.targetDeals === null ? 0 : body.targetDeals
    if (!Number.isInteger(targetDeals) || targetDeals < 0 || targetDeals > 1_000_000) {
      return NextResponse.json({ error: 'targetDeals must be an integer >= 0' }, { status: 400 })
    }
    const targetValue = body.targetValue === undefined || body.targetValue === null ? 0 : body.targetValue
    if (typeof targetValue !== 'number' || !Number.isFinite(targetValue) || targetValue < 0 || targetValue > 1_000_000_000_000) {
      return NextResponse.json({ error: 'targetValue must be a number >= 0' }, { status: 400 })
    }

    // BrokerTarget.brokerId is a User id; accept a profile id or a user id.
    let profileId: string
    let userId: string
    const byProfile = await db.brokerProfile.findUnique({
      where: { id: brokerId },
      select: { id: true, userId: true },
    })
    if (byProfile) {
      profileId = byProfile.id
      userId = byProfile.userId
    } else {
      const u = await db.user.findUnique({
        where: { id: brokerId },
        select: { id: true, brokerProfile: { select: { id: true } } },
      })
      if (!u || !u.brokerProfile) {
        return NextResponse.json({ error: 'Broker not found' }, { status: 404 })
      }
      profileId = u.brokerProfile.id
      userId = u.id
    }

    const target = await db.brokerTarget.upsert({
      where: { brokerId_month: { brokerId: userId, month } },
      update: { targetDeals, targetValue },
      create: { brokerId: userId, month, targetDeals, targetValue },
    })
    await logAudit({
      userId: actorId,
      action: 'BROKER_TARGET_UPSERTED',
      entity: 'BrokerTarget',
      entityId: target.id,
      changes: { brokerId: profileId, month, targetDeals, targetValue },
    })

    return NextResponse.json({
      target: {
        id: target.id,
        brokerId: profileId,
        userId,
        month: target.month,
        targetDeals: target.targetDeals,
        targetValue: target.targetValue,
        updatedAt: target.updatedAt,
      },
    })
  } catch (err) {
    console.error('CEO targets POST error:', err)
    return NextResponse.json({ error: 'Failed to save target' }, { status: 500 })
  }
}
