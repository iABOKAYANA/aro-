import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireActor, leadScopeWhere } from '@/lib/lead-access'
import { getProtectionConfig } from '@/lib/lead-protection'

export const dynamic = 'force-dynamic'

// ─── GET /api/leads/stats — lead protection dashboard numbers ───
// Scoped to the caller: broker → own, developer → own org, CEO → all.
export async function GET() {
  try {
    const actor = await requireActor(['BROKER', 'DEVELOPER', 'CEO', 'ADMIN'])
    if (!actor.ok) return actor.response
    const { ctx } = actor

    const scope = leadScopeWhere(ctx)
    const config = await getProtectionConfig()
    const now = new Date()
    const soon = new Date(now.getTime() + config.expiringSoonDays * 86_400_000)

    const and = (extra: Record<string, unknown> = {}) => ({ AND: [scope, extra] })

    const [
      totalLeads,
      activeProtected,
      expiringSoon,
      expired,
      duplicateReview,
      qualified,
      newLeads,
      viewingStage,
      reservationStage,
      contractStage,
      sold,
      lost,
    ] = await Promise.all([
      db.lead.count({ where: and() }),
      db.lead.count({ where: and({ protectionExpiresAt: { gte: soon } }) }),
      db.lead.count({ where: and({ protectionExpiresAt: { gt: now, lte: soon } }) }),
      db.lead.count({ where: and({ protectionExpiresAt: { lte: now } }) }),
      db.lead.count({ where: and({ reviewStatus: 'DUPLICATE_REVIEW' }) }),
      db.lead.count({ where: and({ status: 'QUALIFIED' }) }),
      db.lead.count({ where: and({ status: 'NEW' }) }),
      db.lead.count({ where: and({ status: 'VIEWING' }) }),
      db.lead.count({ where: and({ status: 'RESERVATION' }) }),
      db.lead.count({ where: and({ status: 'CONTRACT' }) }),
      db.lead.count({ where: and({ status: { in: ['SOLD', 'CONVERTED'] } }) }),
      db.lead.count({ where: and({ status: { in: ['LOST', 'CANCELLED', 'EXPIRED'] } }) }),
    ])

    return NextResponse.json({
      stats: {
        totalLeads,
        newLeads,
        activeProtected,
        expiringSoon,
        expired,
        duplicateReview,
        qualified,
        viewings: viewingStage,
        reservations: reservationStage,
        contracts: contractStage,
        sold,
        lost,
      },
      config: {
        defaultDays: config.defaultDays,
        expiringSoonDays: config.expiringSoonDays,
      },
    })
  } catch (error) {
    console.error('Lead stats error:', error)
    return NextResponse.json({ error: 'Failed to compute stats' }, { status: 500 })
  }
}
