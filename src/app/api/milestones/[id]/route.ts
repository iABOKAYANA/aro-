import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/permissions'

export const dynamic = 'force-dynamic'

// ─── MILESTONE EDIT / APPROVAL (Feature 8) ──────────────────
// CEO/ADMIN: edit + approve/reject + delete.
// DEVELOPER: edit own project's milestones (edit resets to PENDING).

const TYPES = ['LAUNCH', 'CONSTRUCTION', 'PROGRESS', 'DELIVERY', 'HANDOVER', 'CUSTOM']
const STATUSES = ['PLANNED', 'IN_PROGRESS', 'COMPLETED', 'DELAYED']

type MilestoneRow = {
  id: string
  title: string
  projectId: string
  approvalStatus: string
  project: { developerId: string; name: string }
}
type Authz =
  | { ok: false; response: NextResponse }
  | { ok: true; userId: string; isCEO: boolean; milestone: MilestoneRow }

async function authorize(paramsId: string): Promise<Authz> {
  const session = await auth()
  const user = session?.user as { id?: string; role?: string } | undefined
  if (!user?.id) return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const role = (user.role as string) || 'BUYER'
  const isCEO = role === 'CEO' || role === 'ADMIN'
  const milestone = (await db.projectMilestone.findUnique({
    where: { id: paramsId },
    include: { project: { select: { developerId: true, name: true } } },
  })) as MilestoneRow | null
  if (!milestone) return { ok: false, response: NextResponse.json({ error: 'Milestone not found' }, { status: 404 }) }

  let canEdit = isCEO
  if (!canEdit && role === 'DEVELOPER') {
    const profile = await db.developerProfile.findFirst({ where: { userId: user.id }, select: { id: true } })
    canEdit = !!profile && profile.id === milestone.project.developerId
  }
  if (!canEdit) return { ok: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return { ok: true, userId: user.id, isCEO, milestone }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const authz = await authorize(params.id)
    if (!authz.ok) return authz.response
    const { userId, isCEO } = authz

    const body = await req.json()
    const data: Record<string, unknown> = {}
    if (body.title !== undefined) {
      if (typeof body.title !== 'string' || !body.title.trim() || body.title.trim().length > 200) return NextResponse.json({ error: 'title must be a non-empty string (max 200 characters)' }, { status: 400 })
      data.title = body.title.trim()
    }
    if (body.titleArabic !== undefined) {
      if (body.titleArabic !== null && body.titleArabic !== '' && (typeof body.titleArabic !== 'string' || String(body.titleArabic).length > 200)) return NextResponse.json({ error: 'titleArabic must be a string (max 200 characters)' }, { status: 400 })
      data.titleArabic = body.titleArabic ? String(body.titleArabic) : null
    }
    if (body.description !== undefined) {
      if (body.description !== null && body.description !== '' && (typeof body.description !== 'string' || String(body.description).length > 5000)) return NextResponse.json({ error: 'description must be a string (max 5000 characters)' }, { status: 400 })
      data.description = body.description ? String(body.description) : null
    }
    if (body.type !== undefined) {
      if (!TYPES.includes(String(body.type))) return NextResponse.json({ error: `type must be one of: ${TYPES.join(', ')}` }, { status: 400 })
      data.type = body.type
    }
    if (body.status !== undefined) {
      if (!STATUSES.includes(String(body.status))) return NextResponse.json({ error: `status must be one of: ${STATUSES.join(', ')}` }, { status: 400 })
      data.status = body.status
    }
    if (body.date !== undefined) {
      if (body.date !== null && body.date !== '' && (typeof body.date !== 'string' || Number.isNaN(Date.parse(String(body.date))))) return NextResponse.json({ error: 'date must be an ISO date string' }, { status: 400 })
      data.date = body.date ? new Date(String(body.date)) : null
    }
    if (body.progressPercent !== undefined) {
      if (body.progressPercent !== null) {
        const p = Number(body.progressPercent)
        if (!Number.isFinite(p) || p < 0 || p > 100) return NextResponse.json({ error: 'progressPercent must be 0–100' }, { status: 400 })
        data.progressPercent = Math.round(p)
      } else data.progressPercent = null
    }
    if (body.imageUrl !== undefined) {
      if (body.imageUrl !== null && body.imageUrl !== '') {
        if (typeof body.imageUrl !== 'string') return NextResponse.json({ error: 'imageUrl must be a string' }, { status: 400 })
        const v = body.imageUrl.trim()
        if (v.length > 2000 || (!v.startsWith('http://') && !v.startsWith('https://') && !v.startsWith('/'))) {
          return NextResponse.json({ error: 'imageUrl must be a valid image URL starting with http(s):// or /' }, { status: 400 })
        }
        data.imageUrl = v
      } else data.imageUrl = null
    }
    if (body.sortOrder !== undefined) {
      if (!Number.isFinite(Number(body.sortOrder))) return NextResponse.json({ error: 'sortOrder must be a number' }, { status: 400 })
      data.sortOrder = Number(body.sortOrder)
    }

    // Approval decisions — CEO/ADMIN only
    if (body.approvalStatus !== undefined) {
      if (!isCEO) return NextResponse.json({ error: 'Only CEO/ADMIN can change approval status' }, { status: 403 })
      const st = String(body.approvalStatus)
      if (!['PENDING', 'APPROVED', 'REJECTED'].includes(st)) return NextResponse.json({ error: 'approvalStatus must be PENDING|APPROVED|REJECTED' }, { status: 400 })
      if (st === 'REJECTED' && !body.rejectionReason) return NextResponse.json({ error: 'rejectionReason is required when rejecting' }, { status: 400 })
      data.approvalStatus = st
      data.rejectionReason = st === 'REJECTED' ? String(body.rejectionReason).slice(0, 2000) : null
      data.approvedById = st === 'APPROVED' ? userId : null
    } else if (!isCEO && Object.keys(data).length > 0) {
      // developer edit → back to review queue
      data.approvalStatus = 'PENDING'
      data.rejectionReason = null
    }

    if (Object.keys(data).length === 0) return NextResponse.json({ milestone: authz.milestone })

    const updated = await db.projectMilestone.update({ where: { id: params.id }, data })
    await logAudit({
      userId,
      action: isCEO ? (body.approvalStatus ? `MILESTONE_${String(body.approvalStatus)}` : 'MILESTONE_UPDATED') : 'MILESTONE_EDITED',
      entity: 'ProjectMilestone',
      entityId: params.id,
      changes: { fields: Object.keys(data), approvalStatus: updated.approvalStatus },
    })
    return NextResponse.json({ milestone: updated })
  } catch (e) {
    console.error('Milestone update error:', e)
    return NextResponse.json({ error: 'Failed to update milestone' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const authz = await authorize(params.id)
    if (!authz.ok) return authz.response
    const { userId, milestone } = authz

    await db.projectMilestone.delete({ where: { id: params.id } })
    await logAudit({
      userId,
      action: 'MILESTONE_DELETED',
      entity: 'ProjectMilestone',
      entityId: params.id,
      changes: { title: milestone.title, projectId: milestone.projectId },
    })
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('Milestone delete error:', e)
    return NextResponse.json({ error: 'Failed to delete milestone' }, { status: 500 })
  }
}
