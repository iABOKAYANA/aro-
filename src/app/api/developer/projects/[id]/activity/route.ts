import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireOwnProject } from '@/lib/developer-projects'

export const dynamic = 'force-dynamic'

/**
 * GET /api/developer/projects/[id]/activity
 * Recent audit rows for an OWN project: the project's own rows
 * (entity=Project, entityId=projectId) plus rows for its units and payment
 * plans (unit/plan writes log entity=Unit/PaymentPlan with the child id, so
 * the child ids are resolved first). Cap 50, newest first.
 *
 * Each item mirrors GET /api/ceo/activity exactly (same AuditLog columns +
 * same `user` include). The AuditLog table is the only source — when nothing
 * was ever logged, `logs` is an empty array. Nothing is fabricated.
 * → 200 { logs }
 */
export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const gate = await requireOwnProject(params.id)
    if (!gate.ok) return gate.response

    const [units, plans] = await Promise.all([
      db.unit.findMany({ where: { projectId: params.id }, select: { id: true } }),
      db.paymentPlan.findMany({ where: { projectId: params.id }, select: { id: true } }),
    ])
    const unitIds = units.map((u) => u.id)
    const planIds = plans.map((p) => p.id)

    const or: Record<string, unknown>[] = [
      { entity: 'Project', entityId: params.id },
    ]
    if (unitIds.length > 0) or.push({ entity: 'Unit', entityId: { in: unitIds } })
    if (planIds.length > 0) or.push({ entity: 'PaymentPlan', entityId: { in: planIds } })

    const logs = await db.auditLog.findMany({
      where: { OR: or },
      include: {
        user: {
          select: { id: true, name: true, email: true, avatar: true, role: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })

    return NextResponse.json({ logs })
  } catch (error) {
    console.error('Developer project activity error:', error)
    return NextResponse.json({ error: 'Failed to load project activity' }, { status: 500 })
  }
}
