import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getNewLaunchesConfig, computeIsNewLaunch } from '@/lib/new-launches'
import { PUBLIC_PROJECT_WHERE } from '@/lib/project-visibility'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const limit = searchParams.get('limit') ? Math.min(50, Math.max(1, parseInt(searchParams.get('limit')!) || 50)) : 50
    const isFeatured = searchParams.get('featured')

    // Public only: non-approved projects never list (developer PENDING stays hidden).
    const where: Record<string, unknown> = { ...PUBLIC_PROJECT_WHERE }
    if (isFeatured === 'true') where.isFeatured = true

    const projects = await db.project.findMany({
      where,
      include: {
        developer: { select: { companyName: true } },
        governorate: { select: { name: true, nameArabic: true } },
        city: { select: { name: true, nameArabic: true, nameSlug: true } },
        district: { select: { name: true, nameArabic: true } },
        masterPlanImages: { orderBy: { sortOrder: 'asc' } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    })
    // "New" badge designation follows the CEO's New Launches config
    const launchConfig = await getNewLaunchesConfig()
    const withLaunchFlag = projects.map((p) => ({
      ...p,
      isNewLaunch: computeIsNewLaunch(launchConfig, p),
    }))
    return NextResponse.json(
      { projects: withLaunchFlag },
      { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' } }
    )
  } catch (error) {
    console.error('Fetch projects error:', error)
    return NextResponse.json({ error: 'Failed to fetch projects' }, { status: 500 })
  }
}
