import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireCEOApi } from '@/lib/permissions'
import { parseJsonSafe } from '@/lib/utils'
import {
  parsePageLimit,
  encodePageCursor,
  decodePageCursor,
  invalidCursorResponse,
} from '@/lib/ceo-pagination'

export const dynamic = 'force-dynamic'

/** Lead statuses that no longer count towards the broker's live pipeline. */
const CLOSED_LEAD_STATUSES = ['LOST', 'CANCELLED', 'EXPIRED', 'CONVERTED', 'SOLD']

export async function GET(req: Request) {
  try {
    const { error } = await requireCEOApi()
    if (error) return error

    const { searchParams } = new URL(req.url)
    const search = searchParams.get('search')

    const where: Record<string, unknown> = {}
    if (search) {
      where.OR = [
        { user: { name: { contains: search } } },
        { user: { email: { contains: search } } },
        { agencyName: { contains: search } } ,
        { licenseNumber: { contains: search } },
      ]
    }

    // ─── Opt-in cursor pagination ───
    // No `cursor`/`limit` params → falls through to the legacy full-list
    // query below (byte-identical behavior for existing callers).
    // Anchor order: totalDeals DESC + id DESC (totalDeals alone is not unique,
    // so the cursor carries both values as opaque base64url-encoded JSON).
    const cursorRaw = searchParams.get('cursor')
    const limitRaw = searchParams.get('limit')
    if (cursorRaw !== null || limitRaw !== null) {
      const limit = parsePageLimit(limitRaw)
      let cursor: { totalDeals: number; id: string } | null = null
      if (cursorRaw !== null) {
        try {
          const payload = decodePageCursor(cursorRaw)
          if (
            typeof payload.totalDeals !== 'number' ||
            !Number.isFinite(payload.totalDeals) ||
            typeof payload.id !== 'string' ||
            payload.id.length === 0
          ) {
            return invalidCursorResponse()
          }
          cursor = { totalDeals: payload.totalDeals, id: payload.id }
        } catch {
          return invalidCursorResponse()
        }
      }

      const pageWhere: Record<string, unknown> = { ...where }
      if (cursor) {
        pageWhere.AND = [
          {
            OR: [
              { totalDeals: { lt: cursor.totalDeals } },
              { totalDeals: cursor.totalDeals, id: { lt: cursor.id } },
            ],
          },
        ]
      }

      const rows = await db.brokerProfile.findMany({
        where: pageWhere,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              nameArabic: true,
              email: true,
              phone: true,
              avatar: true,
              role: true,
              status: true,
              isActive: true,
              isVerified: true,
              preferredLang: true,
              preferredCurrency: true,
              createdAt: true,
              lastLoginAt: true,
            },
          },
          projectAccess: {
            select: {
              id: true,
              developerId: true,
              projectId: true,
              access: true,
              expiresAt: true,
              notes: true,
            },
          },
          _count: {
            select: {
              leads: true,
              clients: true,
              viewings: true,
              deals: true,
            },
          },
        },
        orderBy: [{ totalDeals: 'desc' }, { id: 'desc' }],
        take: limit + 1,
      })

      const hasNext = rows.length > limit
      const page = hasNext ? rows.slice(0, limit) : rows
      const pageIds = page.map((b) => b.id)

      const [pageLeadRows, pageDealRows] = await Promise.all([
        db.lead.findMany({
          where: { brokerId: { in: pageIds } },
          select: { brokerId: true, createdAt: true, status: true },
        }),
        db.deal.findMany({
          where: { brokerId: { in: pageIds } },
          select: {
            brokerId: true,
            status: true,
            dealValue: true,
            commissions: { select: { brokerAmount: true, status: true } },
          },
        }),
      ])

      const pageNow = new Date()
      const pageThirtyDaysAgo = new Date(pageNow.getTime() - 30 * 24 * 60 * 60 * 1000)

      const enrichedPage = page.map((broker) => {
        const bLeads = pageLeadRows.filter((l) => l.brokerId === broker.id)
        const leadsLast30Days = bLeads.filter((l) => l.createdAt >= pageThirtyDaysAgo).length
        const convertedLeads = bLeads.filter(
          (l) => l.status === 'CONVERTED' || l.status === 'SOLD'
        ).length
        const activeLeads = bLeads.filter((l) => !CLOSED_LEAD_STATUSES.includes(l.status)).length

        const bDeals = pageDealRows.filter((d) => d.brokerId === broker.id)
        const wonDeals = bDeals.filter((d) => d.status === 'SOLD')
        const totalRevenue = wonDeals.reduce((sum, d) => sum + (d.dealValue || 0), 0)
        const commissionEarned = bDeals
          .flatMap((d) => d.commissions)
          .filter((c) => c.status !== 'CANCELLED')
          .reduce((sum, c) => sum + (c.brokerAmount || 0), 0)

        return {
          ...broker,
          // Flat aliases — every other consumer still gets the nested `user`.
          userId: broker.user.id,
          name: broker.user.name || '',
          email: broker.user.email || '',
          phone: broker.user.phone || '',
          avatar: broker.user.avatar,
          accountStatus: broker.user.status,
          isActive: broker.user.isActive,
          userVerified: broker.user.isVerified,
          joinedAt: broker.user.createdAt,
          lastLoginAt: broker.user.lastLoginAt,
          agencyName: broker.agencyName || '',
          licenseNumber: broker.licenseNumber || '',
          specialization: broker.specialization,
          specializations: parseJsonSafe<string[]>(broker.specialization, []),
          serviceAreas: parseJsonSafe<string[]>(broker.serviceAreas, []),
          languages: parseJsonSafe<string[]>(broker.languagesSpoken, ['en', 'ar']),
          leadCount: bLeads.length,
          activeLeads,
          leadsLast30Days,
          convertedLeads,
          conversionRate:
            bLeads.length > 0 ? Math.round((convertedLeads / bLeads.length) * 100) : 0,
          wonDeals: wonDeals.length,
          totalRevenue,
          commissionEarned,
          clientCount: broker._count.clients,
          viewingCount: broker._count.viewings,
          dealCount: broker._count.deals,
          // Kept for the old card layout — a broker has no listings of its own,
          // so this mirrors the live lead pipeline instead of returning nothing.
          activeListings: activeLeads,
        }
      })

      const nextCursor =
        hasNext && page.length > 0
          ? encodePageCursor({
              totalDeals: page[page.length - 1].totalDeals,
              id: page[page.length - 1].id,
            })
          : null
      return NextResponse.json({ items: enrichedPage, nextCursor })
    }

    const brokers = await db.brokerProfile.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            nameArabic: true,
            email: true,
            phone: true,
            avatar: true,
            role: true,
            status: true,
            isActive: true,
            isVerified: true,
            preferredLang: true,
            preferredCurrency: true,
            createdAt: true,
            lastLoginAt: true,
          },
        },
        projectAccess: {
          select: {
            id: true,
            developerId: true,
            projectId: true,
            access: true,
            expiresAt: true,
            notes: true,
          },
        },
        _count: {
          select: {
            leads: true,
            clients: true,
            viewings: true,
            deals: true,
          },
        },
      },
      orderBy: { totalDeals: 'desc' },
    })

    const brokerIds = brokers.map((b) => b.id)

    const [leadRows, dealRows] = await Promise.all([
      db.lead.findMany({
        where: { brokerId: { in: brokerIds } },
        select: { brokerId: true, createdAt: true, status: true },
      }),
      db.deal.findMany({
        where: { brokerId: { in: brokerIds } },
        select: {
          brokerId: true,
          status: true,
          dealValue: true,
          commissions: { select: { brokerAmount: true, status: true } },
        },
      }),
    ])

    const now = new Date()
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

    const enrichedBrokers = brokers.map((broker) => {
      const bLeads = leadRows.filter((l) => l.brokerId === broker.id)
      const leadsLast30Days = bLeads.filter((l) => l.createdAt >= thirtyDaysAgo).length
      const convertedLeads = bLeads.filter(
        (l) => l.status === 'CONVERTED' || l.status === 'SOLD'
      ).length
      const activeLeads = bLeads.filter((l) => !CLOSED_LEAD_STATUSES.includes(l.status)).length

      const bDeals = dealRows.filter((d) => d.brokerId === broker.id)
      const wonDeals = bDeals.filter((d) => d.status === 'SOLD')
      const totalRevenue = wonDeals.reduce((sum, d) => sum + (d.dealValue || 0), 0)
      const commissionEarned = bDeals
        .flatMap((d) => d.commissions)
        .filter((c) => c.status !== 'CANCELLED')
        .reduce((sum, c) => sum + (c.brokerAmount || 0), 0)

      return {
        ...broker,
        // Flat aliases — every other consumer still gets the nested `user`.
        userId: broker.user.id,
        name: broker.user.name || '',
        email: broker.user.email || '',
        phone: broker.user.phone || '',
        avatar: broker.user.avatar,
        accountStatus: broker.user.status,
        isActive: broker.user.isActive,
        userVerified: broker.user.isVerified,
        joinedAt: broker.user.createdAt,
        lastLoginAt: broker.user.lastLoginAt,
        agencyName: broker.agencyName || '',
        licenseNumber: broker.licenseNumber || '',
        specialization: broker.specialization,
        specializations: parseJsonSafe<string[]>(broker.specialization, []),
        serviceAreas: parseJsonSafe<string[]>(broker.serviceAreas, []),
        languages: parseJsonSafe<string[]>(broker.languagesSpoken, ['en', 'ar']),
        leadCount: bLeads.length,
        activeLeads,
        leadsLast30Days,
        convertedLeads,
        conversionRate:
          bLeads.length > 0 ? Math.round((convertedLeads / bLeads.length) * 100) : 0,
        wonDeals: wonDeals.length,
        totalRevenue,
        commissionEarned,
        clientCount: broker._count.clients,
        viewingCount: broker._count.viewings,
        dealCount: broker._count.deals,
        // Kept for the old card layout — a broker has no listings of its own,
        // so this mirrors the live lead pipeline instead of returning nothing.
        activeListings: activeLeads,
      }
    })

    return NextResponse.json({ brokers: enrichedBrokers })
  } catch (error) {
    console.error('CEO fetch brokers error:', error)
    return NextResponse.json({ error: 'Failed to fetch brokers' }, { status: 500 })
  }
}
