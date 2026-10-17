import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireCEOApi } from '@/lib/permissions'
import { getNewLaunchesConfig, computeIsNewLaunch } from '@/lib/new-launches'

export const dynamic = 'force-dynamic'

const SORTS: Record<string, Record<string, 'asc' | 'desc'>> = {
  newest: { createdAt: 'desc' },
  oldest: { createdAt: 'asc' },
  name: { name: 'asc' },
  views: { viewCount: 'desc' },
  price: { startPrice: 'asc' },
}

// ─── GET /api/ceo/projects-all — every project in the DB ──
// CEO-only. Unlike /api/projects (public, active-only), this returns
// ALL projects — drafts, hidden, archived — with counts for the
// "All Projects" detail page. Supports q / developerId / status /
// approval / active filters + pagination + sorting.
export async function GET(req: Request) {
  try {
    const { error } = await requireCEOApi()
    if (error) return error

    const { searchParams } = new URL(req.url)
    const q = searchParams.get('q')?.trim()
    const developerId = searchParams.get('developerId') || undefined
    const status = searchParams.get('status') || undefined
    const approval = searchParams.get('approval') || undefined
    const active = searchParams.get('active')
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1)
    const limit = Math.min(100, Math.max(5, parseInt(searchParams.get('limit') || '25', 10) || 25))
    const orderBy = SORTS[searchParams.get('sort') || 'newest'] || SORTS.newest

    const where: Record<string, unknown> = {}
    if (developerId) where.developerId = developerId
    if (status) where.status = status
    if (approval) where.approvalStatus = approval
    if (active === 'true') where.isActive = true
    if (active === 'false') where.isActive = false
    if (q) {
      where.OR = [
        { name: { contains: q } },
        { nameArabic: { contains: q } },
        { slug: { contains: q } },
        { address: { contains: q } },
        { developer: { companyName: { contains: q } } },
      ]
    }

    const [total, rows, activeCount, publishedCount, draftCount, launchConfig] = await Promise.all([
      db.project.count({ where }),
      db.project.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          name: true,
          nameArabic: true,
          slug: true,
          tagline: true,
          coverImage: true,
          status: true,
          approvalStatus: true,
          isActive: true,
          isFeatured: true,
          isVerified: true,
          featuredRank: true,
          startPrice: true,
          endPrice: true,
          completionPercent: true,
          totalUnits: true,
          totalArea: true,
          deliveryDate: true,
          viewCount: true,
          favoriteCount: true,
          inquiryCount: true,
          createdAt: true,
          updatedAt: true,
          publishedAt: true,
          developer: { select: { id: true, companyName: true, logo: true, isVerified: true } },
          governorate: { select: { name: true, nameArabic: true } },
          city: { select: { name: true, nameArabic: true } },
          district: { select: { name: true, nameArabic: true } },
          _count: {
            select: {
              units: true,
              amenities: true,
              phases: true,
              paymentPlans: true,
              masterPlanImages: true,
              brochures: true,
              leads: true,
              deals: true,
              viewings: true,
              nearbyPlaces: true,
              brokerAccess: true,
            },
          },
        },
      }),
      db.project.count({ where: { isActive: true } }),
      db.project.count({ where: { approvalStatus: 'PUBLISHED' } }),
      db.project.count({ where: { approvalStatus: 'DRAFT' } }),
      getNewLaunchesConfig(),
    ])

    const items = rows.map((p) => ({
      ...p,
      isNewLaunch: computeIsNewLaunch(launchConfig, p),
    }))

    return NextResponse.json({
      items,
      total,
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
      stats: {
        total,
        active: activeCount,
        inactive: total - activeCount,
        published: publishedCount,
        drafts: draftCount,
      },
    })
  } catch (err) {
    console.error('Projects-all GET error:', err)
    return NextResponse.json({ error: 'Failed to load projects' }, { status: 500 })
  }
}
