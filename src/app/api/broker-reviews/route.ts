import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { auth } from '@/lib/auth'
import { requireActor } from '@/lib/lead-access'

export const dynamic = 'force-dynamic'

const brokerReviewInclude = {
  rater: { select: { id: true, name: true, avatar: true } },
  broker: { select: { id: true, name: true, avatar: true } },
  deal: {
    select: {
      id: true,
      status: true,
      project: { select: { id: true, name: true } },
      unit: { select: { id: true, name: true } },
    },
  },
} as const

/**
 * Resolve a posted `brokerId` to the broker's User id.
 * The canonical id is the User id (BrokerReview.brokerId → User.id), but the
 * deals + portal payloads hand out the BrokerProfile id, so both are accepted.
 */
async function resolveBrokerUserId(input: string): Promise<string | null> {
  const user = await db.user.findUnique({ where: { id: input }, select: { id: true } })
  if (user) return user.id
  const profile = await db.brokerProfile.findUnique({
    where: { id: input },
    select: { userId: true },
  })
  return profile?.userId ?? null
}

function averageOf(ratings: { rating: number }[]): number | null {
  if (ratings.length === 0) return null
  return Math.round((ratings.reduce((sum, r) => sum + r.rating, 0) / ratings.length) * 10) / 10
}

// ─── GET /api/broker-reviews?brokerId= — public approved list + average/count ─
// Only APPROVED reviews are ever public. CEOs/ADMINs may pass
// ?status=PENDING (or ALL) to drive the moderation queue — that branch
// requires requireActor(['CEO', 'ADMIN']) and never leaks otherwise.
// Mirrors GET /api/reviews?projectId= exactly, with brokerId in place of projectId.
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const brokerIdParam = searchParams.get('brokerId')
    const statusParam = (searchParams.get('status') || 'APPROVED').toUpperCase()

    // No brokerId → global moderation queue, CEO/ADMIN only.
    if (!brokerIdParam) {
      const gate = await requireActor(['CEO', 'ADMIN'])
      if (!gate.ok) return gate.response
      if (!['PENDING', 'APPROVED', 'REJECTED', 'ALL'].includes(statusParam)) {
        return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
      }
      const where: Record<string, unknown> =
        statusParam === 'ALL' ? {} : { status: statusParam }
      const reviews = await db.brokerReview.findMany({
        where,
        include: brokerReviewInclude,
        orderBy: { createdAt: 'desc' },
        take: 200,
      })
      return NextResponse.json({ reviews })
    }

    const brokerUserId = await resolveBrokerUserId(brokerIdParam)
    if (!brokerUserId) {
      return NextResponse.json({ error: 'Broker not found' }, { status: 404 })
    }

    let status = 'APPROVED'
    if (statusParam !== 'APPROVED') {
      const gate = await requireActor(['CEO', 'ADMIN'])
      if (!gate.ok) return gate.response
      if (!['PENDING', 'REJECTED', 'ALL'].includes(statusParam)) {
        return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
      }
      status = statusParam
    }

    const where: Record<string, unknown> =
      status === 'ALL' ? { brokerId: brokerUserId } : { brokerId: brokerUserId, status }

    const [reviews, approved] = await Promise.all([
      db.brokerReview.findMany({
        where,
        include: brokerReviewInclude,
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
      db.brokerReview.findMany({
        where: { brokerId: brokerUserId, status: 'APPROVED' },
        select: { rating: true },
      }),
    ])

    return NextResponse.json({ reviews, average: averageOf(approved), count: approved.length })
  } catch (error) {
    console.error('Fetch broker reviews error:', error)
    return NextResponse.json({ error: 'Failed to fetch broker reviews' }, { status: 500 })
  }
}

// ─── POST /api/broker-reviews — rate a SOLD deal's broker (1–5 + comment) ─────
// Anti-fake checks, all server-side — nothing from the client is trusted:
//   1. the deal must exist
//   2. its status must be SOLD
//   3. it must have an attributed broker
//   4. the posted brokerId (User id or BrokerProfile id) must be that broker
//   5. the signed-in caller must be the deal's client — the protected lead's
//      creator, or the same email / phone the lead carries
//   6. no review may already exist for that deal (one rating per deal)
export async function POST(req: Request) {
  try {
    const session = await auth()
    const userId = (session?.user as any)?.id
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { brokerId, dealId, rating, comment } = body

    if (!brokerId || !dealId) {
      return NextResponse.json({ error: 'brokerId and dealId required' }, { status: 400 })
    }

    const stars = Number(rating)
    if (!Number.isInteger(stars) || stars < 1 || stars > 5) {
      return NextResponse.json({ error: 'rating must be an integer from 1 to 5' }, { status: 400 })
    }

    const cleanComment =
      typeof comment === 'string' && comment.trim() ? comment.trim().slice(0, 1000) : null

    const brokerUserId = await resolveBrokerUserId(String(brokerId))
    if (!brokerUserId) {
      return NextResponse.json({ error: 'Broker not found' }, { status: 404 })
    }

    const deal = await db.deal.findUnique({
      where: { id: String(dealId) },
      include: {
        broker: { select: { id: true, userId: true } },
        lead: { select: { id: true, createdBy: true, email: true, phone: true } },
      },
    })
    if (!deal) {
      return NextResponse.json({ error: 'Deal not found' }, { status: 404 })
    }
    if (deal.status !== 'SOLD') {
      return NextResponse.json(
        { error: 'Only sold deals can be rated' },
        { status: 403 }
      )
    }
    if (!deal.broker) {
      return NextResponse.json({ error: 'This deal has no broker to rate' }, { status: 400 })
    }
    if (deal.broker.userId !== brokerUserId) {
      return NextResponse.json({ error: 'Broker does not match this deal' }, { status: 400 })
    }

    const caller = await db.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true },
    })
    if (!caller) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    // Never trust the caller-editable profile phone: only the lead creator
    // (server-stamped `createdBy`) or the exact account email may rate.
    const isClient =
      deal.lead.createdBy === caller.id ||
      (deal.lead.email != null &&
        caller.email != null &&
        deal.lead.email.trim().toLowerCase() === caller.email.trim().toLowerCase())
    if (!isClient) {
      return NextResponse.json({ error: 'Only the client of this deal can rate its broker' }, { status: 403 })
    }

    const existing = await db.brokerReview.findFirst({ where: { dealId: deal.id } })
    if (existing) {
      return NextResponse.json({ error: 'This deal was already rated' }, { status: 409 })
    }

    const review = await db.brokerReview.create({
      data: {
        brokerId: brokerUserId,
        userId: caller.id,
        dealId: deal.id,
        rating: stars,
        comment: cleanComment,
        status: 'PENDING',
      },
      include: brokerReviewInclude,
    })

    return NextResponse.json({ review }, { status: 201 })
  } catch (error) {
    console.error('Create broker review error:', error)
    return NextResponse.json({ error: 'Failed to submit broker rating' }, { status: 500 })
  }
}
