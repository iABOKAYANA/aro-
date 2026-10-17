import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/permissions'
import { requireOwnProject } from '@/lib/developer-projects'

export const dynamic = 'force-dynamic'

/**
 * POST /api/developer/projects/[id]/submit — (re)submit an OWN project for
 * CEO review. Allowed from DRAFT or REJECTED (e.g. after revising a rejected
 * submission); anything else → 400. Sets approvalStatus PENDING, clears any
 * stale rejectionReason, and notifies CEO/ADMIN (fail-soft).
 *
 * → 200 { project }
 */
export async function POST(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const gate = await requireOwnProject(params.id)
    if (!gate.ok) return gate.response

    const project = await db.project.findUnique({ where: { id: params.id } })
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    if (project.approvalStatus !== 'DRAFT' && project.approvalStatus !== 'REJECTED') {
      return NextResponse.json(
        { error: `Cannot submit project in ${project.approvalStatus} status. Only DRAFT or REJECTED projects can be submitted.` },
        { status: 400 }
      )
    }

    const updated = await db.project.update({
      where: { id: params.id },
      data: { approvalStatus: 'PENDING', rejectionReason: null },
    })

    await logAudit({
      action: 'PROJECT_SUBMITTED',
      entity: 'Project',
      entityId: params.id,
      userId: gate.ctx.userId,
      changes: { previousApprovalStatus: project.approvalStatus, newApprovalStatus: 'PENDING' },
    })

    try {
      const { notifyRole } = await import('@/lib/notify')
      await notifyRole(['CEO', 'ADMIN'], {
        type: 'PROJECT_SUBMISSION',
        title: 'Project awaiting review',
        message: `${project.name} was ${project.approvalStatus === 'REJECTED' ? 'resubmitted' : 'submitted'} for approval.`,
        link: '/ceo/projects?approvalStatus=PENDING',
        metadata: { projectId: project.id, slug: project.slug, developerId: project.developerId },
      })
    } catch (e) {
      console.error('[notify] developer resubmit hook failed:', e)
    }

    return NextResponse.json({ project: updated })
  } catch (error) {
    console.error('Developer submit project error:', error)
    return NextResponse.json({ error: 'Failed to submit project' }, { status: 500 })
  }
}
