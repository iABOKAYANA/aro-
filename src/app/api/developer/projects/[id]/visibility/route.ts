import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/permissions'
import { requireOwnProject } from '@/lib/developer-projects'

export const dynamic = 'force-dynamic'

// Legal approvalStatus moves — copied from POST /api/ceo/projects/[id]/status
// (the single source of truth for the project lifecycle). The developer
// self-service toggle only ever walks the PUBLISHED ↔ HIDDEN edge; any other
// current state (DRAFT, PENDING, APPROVED, …) → 400.
const VALID_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ['PENDING', 'ARCHIVED'],
  PENDING: ['APPROVED', 'REJECTED', 'DRAFT'],
  APPROVED: ['PUBLISHED', 'REJECTED', 'ARCHIVED'],
  REJECTED: ['DRAFT', 'PENDING'],
  PUBLISHED: ['HIDDEN', 'ARCHIVED'],
  HIDDEN: ['PUBLISHED', 'ARCHIVED'],
  ARCHIVED: ['DRAFT'],
}

/**
 * POST /api/developer/projects/[id]/visibility ← { hidden: bool }
 * Toggles an OWN project between PUBLISHED and HIDDEN through the legal
 * lifecycle moves. Anything else (e.g. hiding a DRAFT) → 400.
 * → 200 { project }
 */
export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const gate = await requireOwnProject(params.id)
    if (!gate.ok) return gate.response

    const body = await req.json()
    const { hidden } = body
    if (typeof hidden !== 'boolean') {
      return NextResponse.json({ error: 'hidden must be a boolean' }, { status: 400 })
    }
    const targetStatus = hidden ? 'HIDDEN' : 'PUBLISHED'

    const project = await db.project.findUnique({ where: { id: params.id } })
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const allowed = VALID_TRANSITIONS[project.approvalStatus] || []
    if (!allowed.includes(targetStatus)) {
      return NextResponse.json(
        {
          error: `Cannot move project from ${project.approvalStatus} to ${targetStatus}. Allowed transitions: ${allowed.join(', ') || 'none'}`,
        },
        { status: 400 }
      )
    }

    const updateData: Record<string, unknown> = {
      approvalStatus: targetStatus,
      rejectionReason: null,
    }
    if (targetStatus === 'PUBLISHED' && !project.publishedAt) {
      updateData.publishedAt = new Date()
    }

    const updated = await db.project.update({
      where: { id: params.id },
      data: updateData,
    })

    await logAudit({
      userId: gate.ctx.userId,
      action: hidden ? 'PROJECT_HIDDEN' : 'PROJECT_PUBLISHED',
      entity: 'Project',
      entityId: params.id,
      changes: {
        previousApprovalStatus: project.approvalStatus,
        newApprovalStatus: targetStatus,
      },
    })

    return NextResponse.json({ project: updated })
  } catch (error) {
    console.error('Developer visibility toggle error:', error)
    return NextResponse.json({ error: 'Failed to update visibility' }, { status: 500 })
  }
}
