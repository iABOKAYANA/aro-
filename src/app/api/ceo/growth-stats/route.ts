import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireCEOApi } from '@/lib/permissions'
import { getProtectionConfig } from '@/lib/lead-protection'

export const dynamic = 'force-dynamic'

// ─── GET /api/ceo/growth-stats — CEO Control Center numbers ───
// Aggregates for leads / deals / commissions / protection with optional filters:
//   ?developerId= &brokerId= &projectId= &status= &from= &to=
export async function GET(req: Request) {
  try {
    const { error } = await requireCEOApi()
    if (error) return error

    const { searchParams } = new URL(req.url)
    const developerId = searchParams.get('developerId')
    const brokerId = searchParams.get('brokerId')
    const projectId = searchParams.get('projectId')
    const from = searchParams.get('from')
    const to = searchParams.get('to')

    const leadWhere: Record<string, unknown> = {}
    if (developerId) leadWhere.developerId = developerId
    if (brokerId) leadWhere.brokerId = brokerId
    if (projectId) leadWhere.projectId = projectId
    if (from || to) {
      leadWhere.createdAt = {
        ...(from ? { gte: new Date(from) } : {}),
        ...(to ? { lte: new Date(to) } : {}),
      }
    }

    const dealWhere: Record<string, unknown> = { ...leadWhere }

    const config = await getProtectionConfig()
    const now = new Date()
    const soon = new Date(now.getTime() + config.expiringSoonDays * 86_400_000)

    const and = (extra: Record<string, unknown> = {}) => ({
      AND: [leadWhere, extra].filter((c) => Object.keys(c).length > 0),
    })

    const [
      totalLeads,
      newLeads,
      activeProtected,
      expiringSoon,
      expiredProtection,
      duplicateReview,
      transferredLeads,
      totalDeals,
      reservationDeals,
      contractDeals,
      soldDeals,
      cancelledDeals,
      openDisputes,
      commissionAgg,
      brokerCount,
      developerCount,
      leadStatusRows,
      dealValueAgg,
      recentLeads,
      expiringList,
      disputeList,
    ] = await Promise.all([
      db.lead.count({ where: and() }),
      db.lead.count({ where: and({ status: 'NEW' }) }),
      db.lead.count({ where: and({ protectionExpiresAt: { gte: soon } }) }),
      db.lead.count({ where: and({ protectionExpiresAt: { gt: now, lte: soon } }) }),
      db.lead.count({ where: and({ protectionExpiresAt: { lte: now } }) }),
      db.lead.count({ where: and({ reviewStatus: 'DUPLICATE_REVIEW' }) }),
      db.lead.count({ where: and({ reviewStatus: 'TRANSFERRED' }) }),
      db.deal.count({ where: dealWhere }),
      db.deal.count({ where: { AND: [dealWhere, { status: 'RESERVATION' }] } }),
      db.deal.count({ where: { AND: [dealWhere, { status: 'CONTRACT' }] } }),
      db.deal.count({ where: { AND: [dealWhere, { status: 'SOLD' }] } }),
      db.deal.count({ where: { AND: [dealWhere, { status: { in: ['CANCELLED', 'LOST'] } }] } }),
      db.commission.count({ where: { status: 'DISPUTED' } }),
      db.commission.aggregate({
        _sum: { totalAmount: true, estateaiAmount: true, brokerAmount: true },
        _count: true,
      }),
      db.brokerProfile.count(),
      db.developerProfile.count(),
      db.lead.groupBy({ by: ['status'], _count: { _all: true }, where: leadWhere }),
      db.deal.aggregate({ _sum: { dealValue: true }, where: dealWhere }),
      db.lead.findMany({
        where: leadWhere,
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { id: true, leadCode: true, name: true, status: true, createdAt: true },
      }),
      db.lead.findMany({
        where: and({ protectionExpiresAt: { gt: now, lte: soon } }),
        orderBy: { protectionExpiresAt: 'asc' },
        take: 10,
        select: {
          id: true, leadCode: true, name: true, status: true,
          protectionExpiresAt: true, brokerId: true,
          broker: { select: { user: { select: { name: true } } } },
        },
      }),
      db.commission.findMany({
        where: { status: 'DISPUTED' },
        include: {
          deal: {
            select: {
              id: true, dealValue: true,
              lead: { select: { leadCode: true, name: true } },
              project: { select: { name: true } },
              broker: { select: { user: { select: { name: true } } } },
            },
          },
        },
        take: 10,
      }),
    ])

    const statusBreakdown: Record<string, number> = {}
    for (const row of leadStatusRows) statusBreakdown[row.status] = row._count._all

    const commissionPending = await db.commission.aggregate({
      _sum: { totalAmount: true, brokerAmount: true },
      where: { status: { in: ['PENDING', 'APPROVED', 'INVOICED', 'DUE'] } },
    })
    const commissionPaid = await db.commission.aggregate({
      _sum: { totalAmount: true, brokerAmount: true },
      where: { status: 'PAID' },
    })

    // Conversion: leads that reached a deal stage ÷ total leads
    const dealStageLeads = reservationDeals + contractDeals + soldDeals
    const conversionRate = totalLeads > 0 ? Math.round((dealStageLeads / totalLeads) * 1000) / 10 : 0

    return NextResponse.json({
      leads: {
        total: totalLeads,
        new: newLeads,
        activeProtected,
        expiringSoon,
        expiredProtection,
        duplicateReview,
        transferred: transferredLeads,
        statusBreakdown,
        recent: recentLeads,
      },
      deals: {
        total: totalDeals,
        reservations: reservationDeals,
        contracts: contractDeals,
        sold: soldDeals,
        cancelled: cancelledDeals,
        totalValue: dealValueAgg._sum.dealValue || 0,
      },
      commissions: {
        totalRecords: commissionAgg._count,
        totalAmount: commissionAgg._sum.totalAmount || 0,
        estateaiShare: commissionAgg._sum.estateaiAmount || 0,
        brokerShare: commissionAgg._sum.brokerAmount || 0,
        pendingAmount: commissionPending._sum.totalAmount || 0,
        pendingBrokerShare: commissionPending._sum.brokerAmount || 0,
        paidAmount: commissionPaid._sum.totalAmount || 0,
        paidBrokerShare: commissionPaid._sum.brokerAmount || 0,
        openDisputes,
        disputeList,
      },
      protection: {
        config: {
          defaultDays: config.defaultDays,
          expiringSoonDays: config.expiringSoonDays,
          allowRenewal: config.allowRenewal,
          renewalDays: config.renewalDays,
          expirationBehavior: config.expirationBehavior,
        },
        active: activeProtected,
        expiringSoon,
        expired: expiredProtection,
        expiringList,
      },
      platform: { brokerCount, developerCount, conversionRate },
    })
  } catch (error) {
    console.error('CEO growth stats error:', error)
    return NextResponse.json({ error: 'Failed to compute stats' }, { status: 500 })
  }
}
