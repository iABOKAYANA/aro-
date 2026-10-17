import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireCEOApi, logAudit } from '@/lib/permissions'
import { notifyUser, brokerUserId } from '@/lib/notify'

export const dynamic = 'force-dynamic'

type Params = { params: { id: string } }

// Commission status flow (server-enforced):
// PENDING → APPROVED → INVOICED → DUE → PAID
// any non-terminal → DISPUTED → back to PENDING
// PENDING/APPROVED → CANCELLED
const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  PENDING: ['APPROVED', 'CANCELLED', 'DISPUTED'],
  APPROVED: ['INVOICED', 'DISPUTED', 'CANCELLED'],
  INVOICED: ['DUE', 'DISPUTED'],
  DUE: ['PAID', 'DISPUTED'],
  DISPUTED: ['PENDING', 'APPROVED'],
  PAID: [],
  CANCELLED: ['PENDING'],
}

// ─── PATCH /api/commissions/[id] — CEO-only status changes ───
export async function PATCH(req: Request, { params }: Params) {
  try {
    const { error, session } = await requireCEOApi()
    if (error) return error
    const actorId = (session!.user as any)?.id as string

    const body = await req.json()
    const { status, reason } = body as { status?: string; reason?: string }
    if (!status) return NextResponse.json({ error: 'status required' }, { status: 400 })

    const commission = await db.commission.findUnique({
      where: { id: params.id },
      include: { deal: { select: { id: true, brokerId: true, leadId: true, lead: { select: { leadCode: true } } } } },
    })
    if (!commission) return NextResponse.json({ error: 'Commission not found' }, { status: 404 })

    const allowed = ALLOWED_TRANSITIONS[commission.status]
    if (!allowed || !allowed.includes(status)) {
      return NextResponse.json(
        { error: `Cannot move commission from ${commission.status} to ${status}` },
        { status: 409 }
      )
    }

    const updateData: Record<string, unknown> = { status }
    if (status === 'PAID') updateData.paidDate = new Date()
    if (reason) updateData.notes = reason

    const updated = await db.commission.update({ where: { id: params.id }, data: updateData })

    await logAudit({
      userId: actorId,
      action: `COMMISSION_${status}`,
      entity: 'Commission',
      entityId: params.id,
      changes: { from: commission.status, to: status, reason: reason || null },
    })

    const label = commission.deal.lead?.leadCode || commission.dealId.slice(0, 8)
    if (status === 'PAID') {
      await notifyUser(await brokerUserId(commission.deal.brokerId), {
        type: 'COMMISSION_PAID',
        title: `Commission paid — ${label}`,
        message: `Your commission has been marked as paid by EstateAI.`,
        link: '/dashboard/deals',
      })
    } else if (status === 'DISPUTED') {
      await notifyUser(await brokerUserId(commission.deal.brokerId), {
        type: 'COMMISSION_DISPUTED',
        title: `Commission dispute — ${label}`,
        message: 'EstateAI opened a review on this commission.',
        link: '/dashboard/deals',
      })
    } else if (['APPROVED', 'INVOICED', 'DUE'].includes(status)) {
      await notifyUser(await brokerUserId(commission.deal.brokerId), {
        type: 'COMMISSION_UPDATED',
        title: `Commission ${status.toLowerCase()} — ${label}`,
        message: `Status updated to ${status}.`,
        link: '/dashboard/deals',
      })
    }

    return NextResponse.json({ commission: updated })
  } catch (err) {
    console.error('Update commission error:', err)
    return NextResponse.json({ error: 'Failed to update commission' }, { status: 500 })
  }
}
