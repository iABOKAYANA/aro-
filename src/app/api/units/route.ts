import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { PUBLIC_UNIT_PROJECT_WHERE } from '@/lib/project-visibility'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    // Public buyable inventory only — showcase samples (isSample) live in
    // the project "models" section, never in listings. Units of non-approved
    // projects never list either — visibility follows the project.
    const units = await db.unit.findMany({
      where: { isSample: false, project: { ...PUBLIC_UNIT_PROJECT_WHERE } },
      include: {
        project: { select: { name: true, slug: true } },
      },
      orderBy: { createdAt: 'desc' },
      // Bounded: the full inventory table must never serialize to one response.
      take: 200,
    })
    return NextResponse.json(
      { units },
      { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' } }
    )
  } catch (error) {
    console.error('Fetch units error:', error)
    return NextResponse.json({ error: 'Failed to fetch units' }, { status: 500 })
  }
}
