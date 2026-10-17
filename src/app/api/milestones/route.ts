import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/permissions'
import { isPublicProject } from '@/lib/project-visibility'

export const dynamic = 'force-dynamic'

// ─── PROJECT TIMELINE MILESTONES (Feature 8) ────────────────
// Public readers only ever see APPROVED milestones.
// Developers submit → PENDING (CEO/ADMIN approves).
// CEO/ADMIN creates/approves directly. Nothing about construction
// progress is ever fabricated — progressPercent is optional input.

const TYPES = ['LAUNCH', 'CONSTRUCTION', 'PROGRESS', 'DELIVERY', 'HANDOVER', 'CUSTOM']
const STATUSES = ['PLANNED', 'IN_PROGRESS', 'COMPLETED', 'DELAYED']

function validate(body: Record<string, unknown>): string | null {
  if (body.title !== undefined && (typeof body.title !== 'string' || !body.title.trim() || body.title.trim().length > 200)) return 'title must be a non-empty string (max 200 characters)'
  if (body.titleArabic !== undefined && body.titleArabic !== null && (typeof body.titleArabic !== 'string' || body.titleArabic.length > 200)) return 'titleArabic must be a string (max 200 characters)'
  if (body.description !== undefined && body.description !== null && (typeof body.description !== 'string' || body.description.length > 5000)) return 'description must be a string (max 5000 characters)'
  if (body.type !== undefined && !TYPES.includes(String(body.type))) return `type must be one of: ${TYPES.join(', ')}`
  if (body.status !== undefined && !STATUSES.includes(String(body.status))) return `status must be one of: ${STATUSES.join(', ')}`
  if (body.date !== undefined) {
    if (body.date === null) return null
    if (typeof body.date !== 'string' || Number.isNaN(Date.parse(body.date))) return 'date must be an ISO date string'
  }
  if (body.progressPercent !== undefined && body.progressPercent !== null) {
    const p = Number(body.progressPercent)
    if (!Number.isFinite(p) || p < 0 || p > 100) return 'progressPercent must be 0–100'
  }
  if (body.sortOrder !== undefined && !Number.isFinite(Number(body.sortOrder))) return 'sortOrder must be a number'
  if (body.imageUrl !== undefined && body.imageUrl !== null && body.imageUrl !== '') {
    if (typeof body.imageUrl !== 'string') return 'imageUrl must be a string'
    const v = body.imageUrl.trim()
    if (v.length > 2000 || (!v.startsWith('http://') && !v.startsWith('https://') && !v.startsWith('/'))) {
      return 'imageUrl must be a valid image URL starting with http(s):// or /'
    }
  }
  return null
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const projectId = searchParams.get('projectId')
    if (!projectId) return NextResponse.json({ error: 'projectId is required' }, { status: 400 })

    const session = await auth()
    const user = session?.user as { id?: string; role?: string } | undefined
    const role = (user?.role as string) || null
    const isCEO = role === 'CEO' || role === 'ADMIN'

    const project = await db.project.findUnique({ where: { id: projectId }, select: { id: true, developerId: true, approvalStatus: true, isActive: true, startPrice: true, units: { where: { price: { gt: 0 } }, take: 1, select: { id: true, price: true } } } })
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

    // Scope: public/regular users → APPROVED only (and project must be visible)
    const isStaffOwner = (() => {
      if (isCEO) return true
      return false
    })()
    let ownProject = false
    if (!isCEO && role === 'DEVELOPER' && user?.id) {
      const profile = await db.developerProfile.findFirst({ where: { userId: user.id }, select: { id: true } })
      ownProject = !!profile && profile.id === project.developerId
    }
    if (!isStaffOwner && !ownProject) {
      if (!isPublicProject(project)) return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }
    let where: Record<string, unknown> = { projectId, approvalStatus: 'APPROVED' }
    if (isCEO) {
      where = { projectId }
    } else if (ownProject) {
      where = { projectId } // own project: see own submissions in any state
    }

    const milestones = await db.projectMilestone.findMany({
      where,
      orderBy: [{ sortOrder: 'asc' }, { date: 'asc' }],
    })
    return NextResponse.json({ milestones: milestones.map((m) => ({ ...m, date: m.date ? new Date(m.date).toISOString() : null, createdAt: new Date(m.createdAt).toISOString(), updatedAt: new Date(m.updatedAt).toISOString() })) })
  } catch (e) {
    console.error('Milestones fetch error:', e)
    return NextResponse.json({ error: 'Failed to load milestones' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    const user = session?.user as { id?: string; role?: string } | undefined
    if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const role = (user.role as string) || 'BUYER'
    const isCEO = role === 'CEO' || role === 'ADMIN'

    const body = await req.json()
    const projectId = String(body.projectId || '')
    if (!projectId) return NextResponse.json({ error: 'projectId is required' }, { status: 400 })
    const invalid = validate(body)
    if (invalid) return NextResponse.json({ error: invalid }, { status: 400 })

    const project = await db.project.findUnique({ where: { id: projectId }, select: { developerId: true } })
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

    let approvalStatus = 'APPROVED'
    if (!isCEO) {
      if (role !== 'DEVELOPER') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      const profile = await db.developerProfile.findFirst({ where: { userId: user.id }, select: { id: true } })
      if (!profile || profile.id !== project.developerId) {
        return NextResponse.json({ error: 'You can only submit milestones for your own projects' }, { status: 403 })
      }
      approvalStatus = 'PENDING'
    }

    const milestone = await db.projectMilestone.create({
      data: {
        projectId,
        type: String(body.type || 'CUSTOM'),
        title: String(body.title || '').trim(),
        titleArabic: body.titleArabic ? String(body.titleArabic) : null,
        description: body.description ? String(body.description) : null,
        date: body.date ? new Date(String(body.date)) : null,
        status: String(body.status || 'PLANNED'),
        progressPercent: body.progressPercent !== undefined && body.progressPercent !== null ? Math.round(Number(body.progressPercent)) : null,
        imageUrl: body.imageUrl ? String(body.imageUrl) : null,
        sortOrder: body.sortOrder !== undefined ? Number(body.sortOrder) : 0,
        approvalStatus,
        submittedById: user.id,
        approvedById: isCEO ? user.id : null,
      },
    })

    await logAudit({
      userId: user.id,
      action: isCEO ? 'MILESTONE_CREATED' : 'MILESTONE_SUBMITTED',
      entity: 'ProjectMilestone',
      entityId: milestone.id,
      changes: { projectId, title: milestone.title, approvalStatus },
    })
    return NextResponse.json({ milestone }, { status: 201 })
  } catch (e) {
    console.error('Milestone create error:', e)
    return NextResponse.json({ error: 'Failed to create milestone' }, { status: 500 })
  }
}
