import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireCEOApi, logAudit } from '@/lib/permissions'

export const dynamic = 'force-dynamic'

const VALID_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ['PENDING', 'ARCHIVED'],
  PENDING: ['APPROVED', 'REJECTED', 'DRAFT'],
  APPROVED: ['PUBLISHED', 'REJECTED', 'ARCHIVED'],
  REJECTED: ['DRAFT', 'PENDING'],
  PUBLISHED: ['HIDDEN', 'ARCHIVED'],
  HIDDEN: ['PUBLISHED', 'ARCHIVED'],
  // ARCHIVED → PUBLISHED is the single-click "publish an archived project"
  // flow: CEO restores, then hits Publish — no re-approval needed for our own
  // catalog imports (approval already happened when it was first listed).
  ARCHIVED: ['DRAFT', 'PUBLISHED'],
}

const ACTION_TO_STATUS: Record<string, string> = {
  submit: 'PENDING',
  approve: 'APPROVED',
  reject: 'REJECTED',
  publish: 'PUBLISHED',
  unpublish: 'HIDDEN',
  hide: 'HIDDEN',
  archive: 'ARCHIVED',
  restore: 'DRAFT',
}

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { error, session } = await requireCEOApi()
    if (error) return error

    const body = await req.json()
    const { action: rawAction, reason } = body

    if (!rawAction) {
      return NextResponse.json({ error: 'Action is required' }, { status: 400 })
    }

    // Case-insensitive: the detail page historically sent UPPERCASE
    // ('APPROVE') while the list page sends lowercase ('approve').
    const action = String(rawAction).toLowerCase()
    const targetStatus = ACTION_TO_STATUS[action]
    if (!targetStatus) {
      return NextResponse.json({ error: `Invalid action: ${action}. Valid actions: ${Object.keys(ACTION_TO_STATUS).join(', ')}` }, { status: 400 })
    }

    const project = await db.project.findUnique({ where: { id: params.id } })
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const allowed = VALID_TRANSITIONS[project.approvalStatus] || []
    if (!allowed.includes(targetStatus)) {
      return NextResponse.json({
        error: `Cannot ${action} project in ${project.approvalStatus} status. Allowed transitions: ${allowed.join(', ') || 'none'}`,
      }, { status: 400 })
    }

    if (action === 'reject' && !reason) {
      return NextResponse.json({ error: 'Rejection reason is required' }, { status: 400 })
    }

    const updateData: Record<string, unknown> = {
      approvalStatus: targetStatus,
    }

    if (action === 'reject') {
      updateData.rejectionReason = reason
    } else {
      updateData.rejectionReason = null
    }

    if (targetStatus === 'PUBLISHED' && !project.publishedAt) {
      updateData.publishedAt = new Date()
    }
    // Publishing MUST reactivate the row: the archive deactivation sets
    // `isActive:false` (soft-delete) and are reversed here — otherwise an
    // archived project stays invisible even with approvalStatus='PUBLISHED'
    // (the exact trap the owner hit: "نشرت مشروع مؤرشف وما ظهرش").
    // HIDDEN→PUBLISHED keeps isActive true; APPROVED→PUBLISHED unaffected.
    if (targetStatus === 'PUBLISHED' && !project.isActive) {
      updateData.isActive = true
    }

    const updated = await db.project.update({
      where: { id: params.id },
      data: updateData,
    })

    // Honest visibility verdict for the CEO: approval labels are not enough —
    // the public gate also requires a verifiable price (startPrice > 0, any
    // priced unit, or an approved active child). Without one the project
    // stays invisible and the console now says so instead of implying success.
    const pricedCheck = await db.project.findUnique({
      where: { id: params.id },
      select: {
        isActive: true,
        approvalStatus: true,
        parentProjectId: true,
        startPrice: true,
        units: { where: { price: { gt: 0 } }, select: { id: true }, take: 1 },
        childProjects: {
          where: { isActive: true, approvalStatus: { in: ['APPROVED', 'PUBLISHED'] } },
          select: { id: true, startPrice: true, units: { where: { price: { gt: 0 } }, select: { id: true }, take: 1 } },
          take: 1,
        },
      },
    })
    const publiclyVisible =
      !!pricedCheck?.isActive &&
      ['APPROVED', 'PUBLISHED'].includes(pricedCheck.approvalStatus) &&
      pricedCheck.parentProjectId === null &&
      ((pricedCheck.startPrice ?? 0) > 0 ||
        pricedCheck.units.length > 0 ||
        pricedCheck.childProjects.some((c) => (c.startPrice ?? 0) > 0 || c.units.length > 0))

    await logAudit({
      action: `PROJECT_${action.toUpperCase()}`,
      entity: 'Project',
      entityId: params.id,
      userId: (session!.user as any).id,
      changes: {
        previousApprovalStatus: project.approvalStatus,
        newApprovalStatus: targetStatus,
        reason: reason || null,
      },
    })

    // Developer self-publishing workflow: tell the owning developer the
    // verdict (fail-soft — never breaks the transition). Link = their portal.
    if (action === 'approve' || action === 'reject' || action === 'publish') {
      try {
        const { developerUserId, notifyUser } = await import('@/lib/notify')
        const devUserId = await developerUserId(project.developerId)
        const verdict =
          action === 'approve'
            ? { title: 'Project approved', message: `${project.name} was approved and is now publicly visible.` }
            : action === 'publish'
              ? { title: 'Project published', message: `${project.name} was published and is now publicly visible.` }
              : { title: 'Project needs changes', message: `${project.name} was not approved.${reason ? ` Reason: ${reason}` : ' Check your developer portal for details.'}` }
        await notifyUser(devUserId, {
          type: action === 'reject' ? 'PROJECT_REJECTED' : 'PROJECT_APPROVED',
          ...verdict,
          link: '/developer',
          metadata: { projectId: params.id, slug: project.slug, approvalStatus: targetStatus },
        })
      } catch (e) {
        console.error('[notify] ceo verdict hook failed:', e)
      }
    }

    // F7: watchers hear about project status changes (fail-soft)
    try {
      const { onProjectInfoChanged } = await import('@/lib/watch')
      await onProjectInfoChanged(params.id, ['status'])
    } catch (e) {
      console.error('[watch] project status hook failed:', e)
    }

    // F2: publishing a project triggers auto-matching against existing buyers
    if (action === 'publish') {
      try {
        const { autoMatchEnabled, matchProject, persistAutoMatch } = await import('@/lib/auto-match')
        if (await autoMatchEnabled()) {
          const result = await matchProject(params.id)
          await persistAutoMatch(params.id, result)
        }
      } catch (e) {
        console.error('[auto-match] publish hook failed:', e)
      }
    }

    // F5: a project only starts "existing" once it is visible — alert the
    // buyers whose saved search matches exactly at that moment (once only).
    const wasVisible = ['APPROVED', 'PUBLISHED'].includes(project.approvalStatus)
    const isVisible = ['APPROVED', 'PUBLISHED'].includes(targetStatus)
    if (isVisible && !wasVisible) {
      try {
        const { alertSavedSearchesForProject } = await import('@/lib/saved-searches')
        await alertSavedSearchesForProject(params.id)
      } catch (e) {
        console.error('[saved-searches] publish hook failed:', e)
      }
      // F12: city follows — tell CITY watchers about the new project in
      // their city (deduped per city + project, fail-soft).
      try {
        const { notifyCityWatchersForProject } = await import('@/lib/price-alerts')
        await notifyCityWatchersForProject(params.id)
      } catch (e) {
        console.error('[city-alerts] publish hook failed:', e)
      }
    }

    return NextResponse.json({ project: updated, publiclyVisible })
  } catch (error) {
    console.error('CEO project status error:', error)
    return NextResponse.json({ error: 'Failed to update project status' }, { status: 500 })
  }
}
