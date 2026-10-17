import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireCEOApi } from '@/lib/permissions'
import {
  parsePageLimit,
  encodePageCursor,
  decodePageCursor,
  invalidCursorResponse,
} from '@/lib/ceo-pagination'

export const dynamic = 'force-dynamic'

function parseIdList(value: string | null): string[] {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === 'string') : []
  } catch {
    return []
  }
}

export async function GET(req: Request) {
  try {
    const { error } = await requireCEOApi()
    if (error) return error

    const { searchParams } = new URL(req.url)
    const search = searchParams.get('search')

    const where: Record<string, unknown> = {}
    if (search) {
      where.OR = [
        { companyName: { contains: search } },
        { companyNameArabic: { contains: search } },
        { user: { name: { contains: search } } },
        { user: { email: { contains: search } } },
      ]
    }

    // ─── Opt-in cursor pagination ───
    // No `cursor`/`limit` params → falls through to the legacy full-list
    // query below (byte-identical behavior for existing callers).
    // Anchor order: totalProjects DESC + id DESC (totalProjects alone is not
    // unique, so the cursor carries both values as opaque base64url JSON).
    const cursorRaw = searchParams.get('cursor')
    const limitRaw = searchParams.get('limit')
    if (cursorRaw !== null || limitRaw !== null) {
      const limit = parsePageLimit(limitRaw)
      let cursor: { totalProjects: number; id: string } | null = null
      if (cursorRaw !== null) {
        try {
          const payload = decodePageCursor(cursorRaw)
          if (
            typeof payload.totalProjects !== 'number' ||
            !Number.isFinite(payload.totalProjects) ||
            typeof payload.id !== 'string' ||
            payload.id.length === 0
          ) {
            return invalidCursorResponse()
          }
          cursor = { totalProjects: payload.totalProjects, id: payload.id }
        } catch {
          return invalidCursorResponse()
        }
      }

      const pageWhere: Record<string, unknown> = { ...where }
      if (cursor) {
        pageWhere.AND = [
          {
            OR: [
              { totalProjects: { lt: cursor.totalProjects } },
              { totalProjects: cursor.totalProjects, id: { lt: cursor.id } },
            ],
          },
        ]
      }

      const rows = await db.developerProfile.findMany({
        where: pageWhere,
        include: {
          partnership: true,
          projects: {
            select: {
              id: true,
              name: true,
              status: true,
              approvalStatus: true,
              isActive: true,
              isFeatured: true,
              isVerified: true,
              address: true,
              inquiryCount: true,
              viewCount: true,
              favoriteCount: true,
              totalUnits: true,
              startPrice: true,
              createdAt: true,
            },
            orderBy: { createdAt: 'desc' },
          },
          _count: {
            select: {
              projects: true,
              leads: true,
              deals: true,
            },
          },
        },
        orderBy: [{ totalProjects: 'desc' }, { id: 'desc' }],
        take: limit + 1,
      })

      const hasNext = rows.length > limit
      const page = hasNext ? rows.slice(0, limit) : rows
      const pageIds = page.map((d) => d.id)

      const [pageDealRows, pageLeadRows] = await Promise.all([
        db.deal.findMany({
          where: { developerId: { in: pageIds } },
          select: {
            developerId: true,
            status: true,
            dealValue: true,
            commissions: { select: { estateaiAmount: true, status: true } },
          },
        }),
        db.lead.findMany({
          where: { developerId: { in: pageIds } },
          select: { developerId: true, status: true, createdAt: true },
        }),
      ])

      const pageThirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

      // DeveloperProfile.userId can dangle (profile outlives its User row) —
      // a required-relation `user` include throws and 500s. One batched
      // side-load instead; missing users resolve to null below.
      const pageUserRows = await db.user.findMany({
        where: { id: { in: [...new Set(page.map((d) => d.userId))] } },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          avatar: true,
          role: true,
          status: true,
          isActive: true,
          isVerified: true,
          createdAt: true,
          lastLoginAt: true,
        },
      })
      const userById = new Map(pageUserRows.map((u) => [u.id, u]))

      const enrichedPage = page.map((dev) => {
        const devDeals = pageDealRows.filter((d) => d.developerId === dev.id)
        const wonDeals = devDeals.filter((d) => d.status === 'SOLD')
        const soldValue = wonDeals.reduce((sum, d) => sum + (d.dealValue || 0), 0)
        const devLeads = pageLeadRows.filter((l) => l.developerId === dev.id)

        const p = dev.partnership
        // `userId` may dangle — null-safe derefs, `user` is null when gone.
        const user = userById.get(dev.userId) ?? null

        return {
          ...dev,
          user,
          // Flat aliases — nested `user` keeps its prior shape (or null).
          userId: user?.id ?? dev.userId,
          name: user?.name || '',
          email: user?.email || '',
          phone: user?.phone || '',
          avatar: dev.logo || user?.avatar || null,
          accountStatus: user?.status ?? null,
          isActive: user?.isActive ?? false,
          userVerified: user?.isVerified ?? false,
          joinedAt: user?.createdAt ?? null,
          lastLoginAt: user?.lastLoginAt ?? null,
          contactEmail: dev.contactEmail || user?.email || '',
          contactPhone: dev.contactPhone || user?.phone || '',
          foundedYear: dev.foundedYear || 0,
          description: dev.description || '',
          headquarters: dev.headquarters || '',
          activeProjects: dev.projects.filter((pr) => pr.isActive).length,
          publishedProjects: dev.projects.filter((pr) => pr.approvalStatus === 'PUBLISHED').length,
          soldUnits: wonDeals.length,
          soldValue,
          leadCount: devLeads.length,
          leadsLast30Days: devLeads.filter((l) => l.createdAt >= pageThirtyDaysAgo).length,
          projects: dev.projects.map((pr) => ({ ...pr, location: pr.address || '—' })),
          partnership: p
            ? {
                ...p,
                approvedProjectIds: parseIdList(p.approvedProjectIds),
                allowedBrokerIds: parseIdList(p.allowedBrokerIds),
                blockedBrokerIds: parseIdList(p.blockedBrokerIds),
              }
            : null,
        }
      })

      const nextCursor =
        hasNext && page.length > 0
          ? encodePageCursor({
              totalProjects: page[page.length - 1].totalProjects,
              id: page[page.length - 1].id,
            })
          : null
      return NextResponse.json({ items: enrichedPage, nextCursor })
    }

    const developers = await db.developerProfile.findMany({
      where,
      include: {
        partnership: true,
        projects: {
          select: {
            id: true,
            name: true,
            status: true,
            approvalStatus: true,
            isActive: true,
            isFeatured: true,
            isVerified: true,
            address: true,
            inquiryCount: true,
            viewCount: true,
            favoriteCount: true,
            totalUnits: true,
            startPrice: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
        },
        _count: {
          select: {
            projects: true,
            leads: true,
            deals: true,
          },
        },
      },
      orderBy: { totalProjects: 'desc' },
    })

    const developerIds = developers.map((d) => d.id)

    const [dealRows, leadRows] = await Promise.all([
      db.deal.findMany({
        where: { developerId: { in: developerIds } },
        select: {
          developerId: true,
          status: true,
          dealValue: true,
          commissions: { select: { estateaiAmount: true, status: true } },
        },
      }),
      db.lead.findMany({
        where: { developerId: { in: developerIds } },
        select: { developerId: true, status: true, createdAt: true },
      }),
    ])

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

    // Same dangling-FK side-load as the cursor path above (see comment there).
    const legacyUserRows = await db.user.findMany({
      where: { id: { in: [...new Set(developers.map((d) => d.userId))] } },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        avatar: true,
        role: true,
        status: true,
        isActive: true,
        isVerified: true,
        createdAt: true,
        lastLoginAt: true,
      },
    })
    const legacyUserById = new Map(legacyUserRows.map((u) => [u.id, u]))

    const enriched = developers.map((dev) => {
      const devDeals = dealRows.filter((d) => d.developerId === dev.id)
      const wonDeals = devDeals.filter((d) => d.status === 'SOLD')
      const soldValue = wonDeals.reduce((sum, d) => sum + (d.dealValue || 0), 0)
      const devLeads = leadRows.filter((l) => l.developerId === dev.id)

      const p = dev.partnership
      // `userId` may dangle — null-safe derefs, `user` is null when gone.
      const user = legacyUserById.get(dev.userId) ?? null

      return {
        ...dev,
        user,
        // Flat aliases — nested `user` keeps its prior shape (or null).
        userId: user?.id ?? dev.userId,
        name: user?.name || '',
        email: user?.email || '',
        phone: user?.phone || '',
        avatar: dev.logo || user?.avatar || null,
        accountStatus: user?.status ?? null,
        isActive: user?.isActive ?? false,
        userVerified: user?.isVerified ?? false,
        joinedAt: user?.createdAt ?? null,
        lastLoginAt: user?.lastLoginAt ?? null,
        contactEmail: dev.contactEmail || user?.email || '',
        contactPhone: dev.contactPhone || user?.phone || '',
        foundedYear: dev.foundedYear || 0,
        description: dev.description || '',
        headquarters: dev.headquarters || '',
        activeProjects: dev.projects.filter((pr) => pr.isActive).length,
        publishedProjects: dev.projects.filter((pr) => pr.approvalStatus === 'PUBLISHED').length,
        soldUnits: wonDeals.length,
        soldValue,
        leadCount: devLeads.length,
        leadsLast30Days: devLeads.filter((l) => l.createdAt >= thirtyDaysAgo).length,
        projects: dev.projects.map((pr) => ({ ...pr, location: pr.address || '—' })),
        partnership: p
          ? {
              ...p,
              approvedProjectIds: parseIdList(p.approvedProjectIds),
              allowedBrokerIds: parseIdList(p.allowedBrokerIds),
              blockedBrokerIds: parseIdList(p.blockedBrokerIds),
            }
          : null,
      }
    })

    return NextResponse.json({ developers: enriched })
  } catch (error) {
    console.error('CEO fetch developers error:', error)
    return NextResponse.json({ error: 'Failed to fetch developers' }, { status: 500 })
  }
}
