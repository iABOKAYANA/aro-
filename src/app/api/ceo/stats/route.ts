import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireCEOApi } from '@/lib/permissions'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const { error } = await requireCEOApi()
    if (error) return error

    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

    const [
      totalUsers, totalBrokers, totalDevelopers, totalProjects, totalUnits,
      totalLeads, newLeadsToday, newLeadsThisWeek, totalInquiries,
      activeProjects, availableUnits, totalFavorites, totalViewings,
      usersByRole, leadsByStatus, inquiriesByStatus, unitsByStatus,
      topProjects, topLocations, propertyTypeDemand,
      brokerPerformance, convertedLeads,
    ] = await Promise.all([
      db.user.count(),
      db.user.count({ where: { role: 'BROKER' } }),
      db.user.count({ where: { role: 'DEVELOPER' } }),
      db.project.count({ where: { isActive: true } }),
      db.unit.count({ where: { isSample: false } }),
      db.lead.count(),
      db.lead.count({ where: { createdAt: { gte: todayStart } } }),
      db.lead.count({ where: { createdAt: { gte: weekStart } } }),
      db.inquiry.count(),
      db.project.count({ where: { isActive: true, status: 'UNDER_CONSTRUCTION' } }),
      db.unit.count({ where: { status: 'AVAILABLE', isSample: false } }),
      db.favorite.count(),
      db.viewing.count(),
      db.user.groupBy({ by: ['role'], _count: { id: true } }),
      db.lead.groupBy({ by: ['status'], _count: { id: true } }),
      db.inquiry.groupBy({ by: ['status'], _count: { id: true } }),
      db.unit.groupBy({ by: ['status'], where: { isSample: false }, _count: { id: true } }),
      db.project.findMany({
        where: { isActive: true },
        select: { id: true, name: true, inquiryCount: true, viewCount: true, favoriteCount: true },
        orderBy: { inquiryCount: 'desc' },
        take: 10,
      }),
      db.governorate.findMany({
        select: { name: true, _count: { select: { projects: true } } },
        orderBy: { projects: { _count: 'desc' } },
        take: 10,
      }),
      db.unit.groupBy({ by: ['unitType'], where: { isSample: false }, _count: { id: true }, _avg: { price: true } }),
      db.brokerProfile.findMany({
        select: {
          id: true,
          user: { select: { name: true, email: true } },
          totalDeals: true,
          rating: true,
          _count: { select: { leads: true } },
        },
        orderBy: { totalDeals: 'desc' },
        take: 10,
      }),
      db.lead.count({ where: { convertedAt: { not: null } } }),
    ])

    const sixMonthsAgo = new Date(now.getTime() - 6 * 30 * 24 * 60 * 60 * 1000)

    const [recentLeads, recentUsers, recentInquiries] = await Promise.all([
      db.lead.findMany({
        where: { createdAt: { gte: sixMonthsAgo } },
        select: { createdAt: true },
        orderBy: { createdAt: 'asc' },
      }),
      db.user.findMany({
        where: { createdAt: { gte: sixMonthsAgo } },
        select: { createdAt: true },
        orderBy: { createdAt: 'asc' },
      }),
      db.inquiry.findMany({
        where: { createdAt: { gte: sixMonthsAgo } },
        select: { createdAt: true },
        orderBy: { createdAt: 'asc' },
      }),
    ])

    const groupByMonth = (items: { createdAt: Date }[]) => {
      const monthMap: Record<string, number> = {}
      items.forEach(item => {
        const key = item.createdAt.toISOString().slice(0, 7)
        monthMap[key] = (monthMap[key] || 0) + 1
      })
      return Object.entries(monthMap).map(([month, count]) => ({ month, count }))
    }

    const conversionRate = totalLeads > 0 ? (convertedLeads / totalLeads * 100) : 0

    return NextResponse.json({
      totalUsers,
      totalBrokers,
      totalDevelopers,
      totalProjects,
      totalUnits,
      totalLeads,
      newLeadsToday,
      newLeadsThisWeek,
      totalInquiries,
      conversionRate: Math.round(conversionRate * 10) / 10,
      activeProjects,
      availableUnits,
      totalFavorites,
      totalViewings,
      usersByRole: usersByRole.map(r => ({ role: r.role, count: r._count.id })),
      leadsByStatus: leadsByStatus.map(s => ({ status: s.status, count: s._count.id })),
      inquiriesByStatus: inquiriesByStatus.map(s => ({ status: s.status, count: s._count.id })),
      unitsByStatus: unitsByStatus.map(s => ({ status: s.status, count: s._count.id })),
      leadsByMonth: groupByMonth(recentLeads),
      usersByMonth: groupByMonth(recentUsers),
      inquiriesByMonth: groupByMonth(recentInquiries),
      topProjects,
      topLocations: topLocations.map(l => ({ name: l.name, count: l._count.projects })),
      propertyTypeDemand: propertyTypeDemand.map(p => ({ type: p.unitType, count: p._count.id, avgPrice: p._avg.price })),
      brokerPerformance,
    })
  } catch (error) {
    console.error('CEO stats error:', error)
    return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 })
  }
}
