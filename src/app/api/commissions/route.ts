import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireActor } from '@/lib/lead-access'

export const dynamic = 'force-dynamic'

// ─── GET /api/commissions — scoped commission ledger ──────
// BROKER → own share only, DEVELOPER → own org, CEO → all
export async function GET(req: Request) {
  try {
    const actor = await requireActor(['BROKER', 'DEVELOPER', 'CEO', 'ADMIN'])
    if (!actor.ok) return actor.response
    const { ctx } = actor

    const { searchParams } = new URL(req.url)
    const status = searchParams.get('status')

    const dealScope: Record<string, unknown> = {}
    if (ctx.role === 'BROKER') {
      if (!ctx.brokerId) return NextResponse.json({ commissions: [] })
      dealScope.brokerId = ctx.brokerId
    } else if (ctx.role === 'DEVELOPER') {
      if (!ctx.developerId) return NextResponse.json({ commissions: [] })
      dealScope.developerId = ctx.developerId
    }

    const where: Record<string, unknown> = {}
    if (status) where.status = status
    if (Object.keys(dealScope).length > 0) where.deal = { is: dealScope }

    const commissions = await db.commission.findMany({
      where,
      include: {
        deal: {
          select: {
            id: true, status: true, dealValue: true, currency: true,
            lead: { select: { id: true, leadCode: true, name: true } },
            broker: { select: { id: true, user: { select: { name: true } } } },
            developer: { select: { id: true, companyName: true } },
            project: { select: { id: true, name: true } },
            unit: { select: { id: true, name: true } },
          },
        },
        rule: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    })

    // Field-level projection per role: brokers never see EstateAI's internal split
    const projected = commissions.map((c) => {
      const base = {
        id: c.id,
        status: c.status,
        dealValue: c.dealValue,
        currency: c.currency,
        totalPct: c.totalPct,
        totalAmount: c.totalAmount,
        dueDate: c.dueDate,
        paidDate: c.paidDate,
        notes: c.notes,
        createdAt: c.createdAt,
        deal: c.deal,
        rule: c.rule,
      }
      if (ctx.isCEO) {
        return {
          ...base,
          estateaiPct: c.estateaiPct,
          brokerPct: c.brokerPct,
          otherPct: c.otherPct,
          otherLabel: c.otherLabel,
          estateaiAmount: c.estateaiAmount,
          brokerAmount: c.brokerAmount,
          otherAmount: c.otherAmount,
        }
      }
      if (ctx.role === 'BROKER') {
        return { ...base, brokerPct: c.brokerPct, brokerAmount: c.brokerAmount }
      }
      // developer: their obligation view = total + EstateAI share
      return { ...base, estateaiPct: c.estateaiPct, estateaiAmount: c.estateaiAmount }
    })

    return NextResponse.json({ commissions: projected })
  } catch (error) {
    console.error('Fetch commissions error:', error)
    return NextResponse.json({ error: 'Failed to fetch commissions' }, { status: 500 })
  }
}
