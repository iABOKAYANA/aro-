import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireActor } from '@/lib/lead-access'

export const dynamic = 'force-dynamic'

// ─── PATCH /api/broker-reviews/:id — CEO/ADMIN moderation ────────────────────
// Body: { status: 'APPROVED' | 'REJECTED' }. Approved ratings feed the broker's
// public average + review list; rejected ones stay hidden. Same guard pattern
// as every other CEO route: requireActor(['CEO', 'ADMIN']) — CEO/ADMIN pass
// any role list via isSuperRole, so this is CEO-and-ADMIN-only.
//
// Approving (or rejecting) re-syncs BrokerProfile.rating/reviewCount from the
// APPROVED set, because the broker portal renders those columns directly.
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const actor = await requireActor(['CEO', 'ADMIN'])
    if (!actor.ok) return actor.response

    const body = await req.json()
    const status = typeof body?.status === 'string' ? body.status.toUpperCase() : ''

    if (!['APPROVED', 'REJECTED'].includes(status)) {
      return NextResponse.json(
        { error: 'Invalid status. Must be APPROVED or REJECTED' },
        { status: 400 }
      )
    }

    const existing = await db.brokerReview.findUnique({ where: { id: params.id } })
    if (!existing) {
      return NextResponse.json({ error: 'Review not found' }, { status: 404 })
    }

    const review = await db.brokerReview.update({
      where: { id: params.id },
      data: { status },
      include: {
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
      },
    })

    const approved = await db.brokerReview.findMany({
      where: { brokerId: review.brokerId, status: 'APPROVED' },
      select: { rating: true },
    })
    const count = approved.length
    const average =
      count > 0
        ? Math.round((approved.reduce((sum, r) => sum + r.rating, 0) / count) * 10) / 10
        : 0
    await db.brokerProfile.updateMany({
      where: { userId: review.brokerId },
      data: { rating: average, reviewCount: count },
    })

    return NextResponse.json({ review })
  } catch (error) {
    console.error('Moderate broker review error:', error)
    return NextResponse.json({ error: 'Failed to moderate broker review' }, { status: 500 })
  }
}
