import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logAudit, requireCEOApi } from '@/lib/permissions'

export const dynamic = 'force-dynamic'

const projectSummary = {
  id: true,
  name: true,
  nameArabic: true,
  slug: true,
  developerId: true,
  approvalStatus: true,
  isActive: true,
  isParent: true,
  parentProjectId: true,
  startPrice: true,
  status: true,
} as const

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const { error } = await requireCEOApi()
  if (error) return error

  try {
    const project = await db.project.findUnique({
      where: { id: params.id },
      select: {
        ...projectSummary,
        parentProject: { select: { id: true, name: true, nameArabic: true, slug: true } },
        childProjects: {
          orderBy: { name: 'asc' },
          select: {
            ...projectSummary,
            _count: { select: { units: true } },
          },
        },
      },
    })
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

    // Only leaf projects from the same developer can be nested. Projects
    // already under another parent remain selectable for an intentional move.
    const candidates = await db.project.findMany({
      where: {
        id: { not: project.id },
        developerId: project.developerId,
        isParent: false,
        childProjects: { none: {} },
      },
      select: {
        ...projectSummary,
        parentProject: { select: { id: true, name: true, nameArabic: true } },
        _count: { select: { units: true } },
      },
      orderBy: { name: 'asc' },
    })

    return NextResponse.json({ project, candidates })
  } catch (cause) {
    console.error('CEO project hierarchy fetch error:', cause)
    return NextResponse.json({ error: 'Failed to fetch project hierarchy' }, { status: 500 })
  }
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const { error, session } = await requireCEOApi()
  if (error) return error

  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const actorId = (session!.user as { id: string }).id

  if (typeof body.isParent === 'boolean') {
    const result = await db.$transaction(async (tx) => {
      const project = await tx.project.findUnique({
        where: { id: params.id },
        select: { id: true, name: true, isParent: true, parentProjectId: true },
      })
      if (!project) return { error: 'Project not found', status: 404 as const }

      if (body.isParent && project.parentProjectId) {
        return { error: 'افصل المشروع من المشروع الأم الحالي قبل ما تخليه مشروع أم.', status: 409 as const }
      }
      if (!body.isParent) {
        const childrenCount = await tx.project.count({ where: { parentProjectId: project.id } })
        if (childrenCount > 0) {
          return { error: 'افصل المشاريع التابعة الأول قبل إلغاء صفة المشروع الأم.', status: 409 as const }
        }
      }

      const updated = project.isParent === body.isParent
        ? project
        : await tx.project.update({
            where: { id: project.id },
            data: { isParent: body.isParent },
            select: { id: true, name: true, isParent: true, parentProjectId: true },
          })
      return { project: updated, previous: project.isParent }
    })

    if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status })
    if (result.previous !== result.project.isParent) {
      await logAudit({
        action: result.project.isParent ? 'PROJECT_PARENT_ENABLED' : 'PROJECT_PARENT_DISABLED',
        entity: 'Project',
        entityId: result.project.id,
        userId: actorId,
        changes: { name: result.project.name, isParent: result.project.isParent },
      })
    }
    return NextResponse.json({ project: result.project })
  }

  const action = body.action
  const childProjectId = typeof body.childProjectId === 'string' ? body.childProjectId : ''
  if (!childProjectId || (action !== 'assign' && action !== 'remove')) {
    return NextResponse.json({ error: 'action and childProjectId are required' }, { status: 400 })
  }
  if (childProjectId === params.id) {
    return NextResponse.json({ error: 'المشروع مينفعش يبقى أب لنفسه.' }, { status: 400 })
  }

  const result = await db.$transaction(async (tx) => {
    const parent = await tx.project.findUnique({
      where: { id: params.id },
      select: { id: true, name: true, isParent: true, parentProjectId: true, developerId: true },
    })
    if (!parent) return { error: 'Project not found', status: 404 as const }

    const child = await tx.project.findUnique({
      where: { id: childProjectId },
      select: { id: true, name: true, isParent: true, parentProjectId: true, developerId: true },
    })
    if (!child) return { error: 'المشروع اللي اخترته مش موجود.', status: 404 as const }

    if (action === 'assign') {
      if (!parent.isParent || parent.parentProjectId) {
        return { error: 'فعّل المشروع كمشروع أم الأول، ولازم يكون مشروع رئيسي.', status: 409 as const }
      }
      if (child.developerId !== parent.developerId) {
        return { error: 'مينفعش نحط مشاريع لمطورين مختلفين جوه بعض.', status: 409 as const }
      }
      if (child.isParent || (await tx.project.count({ where: { parentProjectId: child.id } })) > 0) {
        return { error: 'المشروع اللي اخترته عنده مشاريع تابعة؛ التداخل مسموح بمستوى واحد بس.', status: 409 as const }
      }
      if (child.parentProjectId === parent.id) return { child, previousParentId: parent.id, unchanged: true }

      const updated = await tx.project.update({
        where: { id: child.id },
        data: { parentProjectId: parent.id },
        select: { id: true, name: true, parentProjectId: true },
      })
      return { child: updated, previousParentId: child.parentProjectId, parentName: parent.name }
    }

    if (child.parentProjectId !== parent.id) {
      return { error: 'المشروع ده مش تابع للمشروع الأم ده.', status: 404 as const }
    }
    const updated = await tx.project.update({
      where: { id: child.id },
      data: { parentProjectId: null },
      select: { id: true, name: true, parentProjectId: true },
    })
    return { child: updated, previousParentId: parent.id, parentName: parent.name }
  })

  if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status })
  if (!('unchanged' in result) || !result.unchanged) {
    await logAudit({
      action: action === 'assign' ? 'PROJECT_CHILD_ASSIGNED' : 'PROJECT_CHILD_REMOVED',
      entity: 'Project',
      entityId: result.child.id,
      userId: actorId,
      changes: {
        childName: result.child.name,
        previousParentId: result.previousParentId,
        parentProjectId: action === 'assign' ? params.id : null,
        parentName: result.parentName,
      },
    })
  }
  return NextResponse.json({ child: result.child })
}
