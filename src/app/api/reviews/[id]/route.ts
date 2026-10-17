import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireActor } from '@/lib/lead-access'

export const dynamic = 'force-dynamic'

// ─── PATCH /api/reviews/:id — CEO/ADMIN moderation ───────────────────────────
// Body: { status: 'APPROVED' | 'REJECTED' }. Approved reviews surface on the
// public project page; rejected ones stay hidden. Same guard pattern as every
// other CEO route: requireActor(['CEO', 'ADMIN']) — CEO/ADMIN pass any role
// list via isSuperRole, so this is CEO-and-ADMIN-only.
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

    const existing = await db.review.findUnique({ where: { id: params.id } })
    if (!existing) {
      return NextResponse.json({ error: 'Review not found' }, { status: 404 })
    }

    const review = await db.review.update({
      where: { id: params.id },
      data: { status },
      include: {
        user: { select: { id: true, name: true, avatar: true } },
        project: { select: { id: true, name: true, slug: true } },
      },
    })

    return NextResponse.json({ review })
  } catch (error) {
    console.error('Moderate review error:', error)
    return NextResponse.json({ error: 'Failed to moderate review' }, { status: 500 })
  }
}
