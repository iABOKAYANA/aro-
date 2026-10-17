import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireCEOApi } from '@/lib/permissions'

export const dynamic = 'force-dynamic'

// ─── GET /api/ceo/leaderboard?month=YYYY-MM — broker rankings ──
// Actuals are COMPUTED from deals/leads/commissions (no stored ranks —
// awards are derived client-side from this ordering). Returns
// { month, leaderboard } where each row is
// { brokerId, name, deals, value, commission, leads, conversionPct }.
// month defaults to the current UTC month. deals/value count non-cancelled
// deals created in the month; commission sums non-cancelled brokerAmount on
// those deals; leads counts the broker's leads created in the month;
// conversionPct = deals/leads*100 (1 decimal, 0 when no leads).
// Ranked by value desc, then deals desc.
export async function GET(req: Request) {
  try {
    const { error } = await requireCEOApi()
    if (error) return error

    const { searchParams } = new URL(req.url)
    const rawMonth = searchParams.get('month')?.trim() || ''
    const now = new Date()
    const fallbackMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`
    const month = rawMonth || fallbackMonth
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      return NextResponse.json({ error: 'month must be YYYY-MM' }, { status: 400 })
    }
    const [y, m] = month.split('-').map(Number)
    const start = new Date(Date.UTC(y, m - 1, 1))
    const end = new Date(Date.UTC(y, m, 1))

    const [brokers, deals, leads] = await Promise.all([
      db.brokerProfile.findMany({
        select: { id: true, user: { select: { name: true, email: true } } },
      }),
      db.deal.findMany({
        where: {
          brokerId: { not: null },
          createdAt: { gte: start, lt: end },
          status: { notIn: ['CANCELLED', 'LOST'] },
        },
        select: { id: true, brokerId: true, dealValue: true },
      }),
      db.lead.groupBy({
        by: ['brokerId'],
        _count: { _all: true },
        where: { brokerId: { not: null }, createdAt: { gte: start, lt: end } },
      }),
    ])

    const dealIds = deals.map((d) => d.id)
    const commissions = dealIds.length
      ? await db.commission.findMany({
          where: { dealId: { in: dealIds }, status: { not: 'CANCELLED' } },
          select: { dealId: true, brokerAmount: true },
        })
      : []
    const dealBroker = new Map(deals.map((d) => [d.id, d.brokerId as string]))

    const dealsByBroker = new Map<string, number>()
    const valueByBroker = new Map<string, number>()
    for (const d of deals) {
      const b = d.brokerId as string
      dealsByBroker.set(b, (dealsByBroker.get(b) ?? 0) + 1)
      valueByBroker.set(b, (valueByBroker.get(b) ?? 0) + (d.dealValue || 0))
    }
    const commissionByBroker = new Map<string, number>()
    for (const c of commissions) {
      const b = dealBroker.get(c.dealId)
      if (!b) continue
      commissionByBroker.set(b, (commissionByBroker.get(b) ?? 0) + (c.brokerAmount || 0))
    }
    const leadsByBroker = new Map<string, number>()
    for (const row of leads) {
      if (row.brokerId) leadsByBroker.set(row.brokerId, row._count._all)
    }

    const r1 = (n: number) => Math.round(n * 10) / 10
    const leaderboard = brokers
      .map((b) => {
        const dealCount = dealsByBroker.get(b.id) ?? 0
        const leadCount = leadsByBroker.get(b.id) ?? 0
        return {
          brokerId: b.id,
          name: b.user.name || b.user.email || b.id.slice(0, 8),
          deals: dealCount,
          value: valueByBroker.get(b.id) ?? 0,
          commission: r1(commissionByBroker.get(b.id) ?? 0),
          leads: leadCount,
          conversionPct: leadCount > 0 ? r1((dealCount / leadCount) * 100) : 0,
        }
      })
      .sort((a, b) => b.value - a.value || b.deals - a.deals)

    return NextResponse.json({ month, leaderboard })
  } catch (err) {
    console.error('CEO leaderboard error:', err)
    return NextResponse.json({ error: 'Failed to compute leaderboard' }, { status: 500 })
  }
}
