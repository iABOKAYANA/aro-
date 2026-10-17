import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireOwnProject } from '@/lib/developer-projects'

export const dynamic = 'force-dynamic'

/**
 * GET /api/developer/projects/[id]/stats
 * Per-project counters computed honestly from existing columns only:
 * - views/inquiries: the Project.viewCount / Project.inquiryCount columns
 *   (same source the developer portal sums in `portal/route.ts`),
 * - leads: Lead rows scoped by projectId (same scope as the portal's
 *   `_count.leads`),
 * - unitsTotal: all Unit rows for the project,
 * - unitsAvailable: AVAILABLE + non-sample rows (same "buyable inventory"
 *   rule as the CEO project GET and the portal counts).
 * → 200 { views, inquiries, leads, unitsTotal, unitsAvailable }
 */
export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const gate = await requireOwnProject(params.id)
    if (!gate.ok) return gate.response

    const project = await db.project.findUnique({
      where: { id: params.id },
      select: { id: true, viewCount: true, inquiryCount: true },
    })
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const [leads, unitsTotal, unitsAvailable] = await Promise.all([
      db.lead.count({ where: { projectId: params.id } }),
      db.unit.count({ where: { projectId: params.id } }),
      db.unit.count({
        where: { projectId: params.id, status: 'AVAILABLE', isSample: false },
      }),
    ])

    return NextResponse.json({
      views: project.viewCount ?? 0,
      inquiries: project.inquiryCount ?? 0,
      leads,
      unitsTotal,
      unitsAvailable,
    })
  } catch (error) {
    console.error('Developer project stats error:', error)
    return NextResponse.json({ error: 'Failed to load project stats' }, { status: 500 })
  }
}
