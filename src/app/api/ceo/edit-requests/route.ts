import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireCEOApi, logAudit } from '@/lib/permissions'
import { notifyUser } from '@/lib/notify'
import { coerceEditValue, type EditEntity } from '@/lib/edit-requests'

export const dynamic = 'force-dynamic'

const VALID_STATUSES = ['PENDING', 'APPROVED', 'REJECTED']
const VALID_DECISIONS = ['APPROVED', 'REJECTED']

async function withContext(rows: Array<{
  id: string
  entity: string
  entityId: string
  field: string
  oldValue: string | null
  newValue: string
  message: string | null
  developerId: string
  status: string
  reason: string | null
  createdAt: Date
  updatedAt: Date
}>) {
  // Batched: 1 users query + 1 per entity kind (project/unit/plan) instead
  // of 2 sequential queries per row (1 + 2N → ≤5 total). Output shape is
  // unchanged — maps below resolve the same developer/project/unit/plan
  // objects the per-row lookups used to return.
  const uniq = (ids: string[]) => [...new Set(ids)]
  const developerIds = uniq(rows.map((r) => r.developerId))
  const projectIds = uniq(rows.filter((r) => r.entity === 'PROJECT').map((r) => r.entityId))
  const unitIds = uniq(rows.filter((r) => r.entity === 'UNIT').map((r) => r.entityId))
  const planIds = uniq(rows.filter((r) => r.entity === 'PLAN').map((r) => r.entityId))

  const [developers, projects, units, plans] = await Promise.all([
    developerIds.length
      ? db.user.findMany({
          where: { id: { in: developerIds } },
          select: {
            id: true,
            name: true,
            email: true,
            developerProfile: { select: { id: true, companyName: true } },
          },
        })
      : [],
    projectIds.length
      ? db.project.findMany({
          where: { id: { in: projectIds } },
          select: { id: true, name: true, developerId: true },
        })
      : [],
    unitIds.length
      ? db.unit.findMany({
          where: { id: { in: unitIds } },
          select: { id: true, name: true, project: { select: { id: true, name: true, developerId: true } } },
        })
      : [],
    planIds.length
      ? db.paymentPlan.findMany({
          where: { id: { in: planIds } },
          select: { id: true, name: true, project: { select: { id: true, name: true, developerId: true } } },
        })
      : [],
  ])

  const developerById = new Map(developers.map((d) => [d.id, d]))
  const projectById = new Map(projects.map((p) => [p.id, p]))
  const unitById = new Map(units.map((u) => [u.id, u]))
  const planById = new Map(plans.map((p) => [p.id, p]))

  const shapeDeveloper = (id: string) => {
    const developer = developerById.get(id)
    return developer
      ? {
          id: developer.id,
          name: developer.name,
          email: developer.email,
          profileId: developer.developerProfile?.id ?? null,
          companyName: developer.developerProfile?.companyName ?? null,
        }
      : null
  }

  return rows.map((r) => {
    const developer = shapeDeveloper(r.developerId)
    if (r.entity === 'PROJECT') {
      return { ...r, developer, project: projectById.get(r.entityId) ?? null }
    }
    if (r.entity === 'UNIT') {
      const unit = unitById.get(r.entityId)
      if (unit) {
        return { ...r, developer, project: unit.project, unit: { id: unit.id, name: unit.name } }
      }
      return { ...r, developer, project: null }
    }
    if (r.entity === 'PLAN') {
      const plan = planById.get(r.entityId)
      if (plan) {
        return { ...r, developer, project: plan.project, plan: { id: plan.id, name: plan.name } }
      }
      return { ...r, developer, project: null }
    }
    return { ...r, developer, project: null }
  })
}

/**
 * GET /api/ceo/edit-requests?status= — CEO review queue for developer edit
 * requests. `status` optionally filters PENDING|APPROVED|REJECTED (else all).
 * → 200 { requests } with developer + project/unit/plan context per row.
 */
export async function GET(req: Request) {
  try {
    const { error } = await requireCEOApi()
    if (error) return error

    const { searchParams } = new URL(req.url)
    const status = searchParams.get('status')
    if (status !== null && !VALID_STATUSES.includes(status)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` },
        { status: 400 }
      )
    }

    const rows = await db.editRequest.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: 'desc' },
      take: 500,
    })

    return NextResponse.json({ requests: await withContext(rows) })
  } catch (e) {
    console.error('CEO list edit-requests error:', e)
    return NextResponse.json({ error: 'Failed to list edit requests' }, { status: 500 })
  }
}

/**
 * PATCH /api/ceo/edit-requests ← { id, decision: 'APPROVED'|'REJECTED', reason? }
 *
 * APPROVED: coerces newValue to the real column type, applies the whitelisted
 * change (unit price changes also write a PriceHistory row + refresh
 * pricePerSqm, mirroring the developer PATCH route), marks the request
 * APPROVED, audits, and notifies the developer (decision + reason).
 * REJECTED: marks REJECTED (reason stored) and notifies the developer.
 * Only PENDING rows can be decided. → 200 { request, entity }
 */
export async function PATCH(req: Request) {
  try {
    const { error, session } = await requireCEOApi()
    if (error) return error
    const actorId = (session!.user as any)?.id as string

    const body = await req.json()
    const { id, decision, reason } = body as { id?: unknown; decision?: unknown; reason?: unknown }
    if (typeof id !== 'string' || !id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 })
    }
    if (typeof decision !== 'string' || !VALID_DECISIONS.includes(decision)) {
      return NextResponse.json(
        { error: 'decision must be one of: APPROVED, REJECTED' },
        { status: 400 }
      )
    }
    const note = typeof reason === 'string' && reason.trim() ? reason.trim().slice(0, 2000) : null

    const request = await db.editRequest.findUnique({ where: { id } })
    if (!request) {
      return NextResponse.json({ error: 'Edit request not found' }, { status: 404 })
    }
    if (request.status !== 'PENDING') {
      return NextResponse.json(
        { error: `This request is already ${request.status}` },
        { status: 400 }
      )
    }

    let applied: unknown = null

    if (decision === 'APPROVED') {
      const ent = request.entity as EditEntity
      const coerced = coerceEditValue(ent, request.field, request.newValue)
      if (!coerced.ok) {
        return NextResponse.json(
          { error: `Stored value no longer applies: ${coerced.error}` },
          { status: 400 }
        )
      }

      if (ent === 'PROJECT') {
        const existing = await db.project.findUnique({ where: { id: request.entityId } })
        if (!existing) return NextResponse.json({ error: 'Target project no longer exists' }, { status: 404 })
        applied = await db.project.update({
          where: { id: request.entityId },
          data: { [request.field]: coerced.value } as never,
        })
      } else if (ent === 'UNIT') {
        const existing = await db.unit.findUnique({ where: { id: request.entityId } })
        if (!existing) return NextResponse.json({ error: 'Target unit no longer exists' }, { status: 404 })
        const data: Record<string, unknown> = { [request.field]: coerced.value }
        // Mirror the developer PATCH route: keep the derived pricePerSqm in sync.
        if (request.field === 'price' || request.field === 'area') {
          const price = request.field === 'price' ? (coerced.value as number) : existing.price
          const area = request.field === 'area' ? (coerced.value as number) : existing.area
          if (area > 0) data.pricePerSqm = price / area
        }
        applied = await db.unit.update({ where: { id: request.entityId }, data: data as never })
        if (request.field === 'price' && (coerced.value as number) !== existing.price) {
          await db.priceHistory.create({
            data: {
              unitId: request.entityId,
              price: coerced.value as number,
              change: (coerced.value as number) - existing.price,
              reason: 'Price updated via approved edit request',
            },
          })
        }
      } else {
        const existing = await db.paymentPlan.findUnique({ where: { id: request.entityId } })
        if (!existing) return NextResponse.json({ error: 'Target payment plan no longer exists' }, { status: 404 })
        applied = await db.paymentPlan.update({
          where: { id: request.entityId },
          data: { [request.field]: coerced.value } as never,
        })
      }
    }

    const updated = await db.editRequest.update({
      where: { id },
      data: { status: decision, reason: note },
    })

    await logAudit({
      userId: actorId,
      action: decision === 'APPROVED' ? 'EDIT_REQUEST_APPROVED' : 'EDIT_REQUEST_REJECTED',
      entity: 'EditRequest',
      entityId: id,
      changes: {
        entity: request.entity,
        entityId: request.entityId,
        field: request.field,
        newValue: request.newValue,
        reason: note,
      },
    })

    // Notify the developer with the decision + reason (fail-soft). Link uses
    // the existing website URL space resolvable by mobile links.ts.
    try {
      const userId = request.developerId
      const verdict = decision === 'APPROVED' ? 'approved' : 'rejected'
      await notifyUser(userId || null, {
        type: 'EDIT_REQUEST_DECISION',
        title: `Edit request ${verdict}`,
        message:
          `Your ${request.entity} ${request.field} change was ${verdict}.` +
          (note ? ` Reason: ${note}` : ''),
        link: '/developer',
        metadata: { requestId: id, entity: request.entity, entityId: request.entityId, field: request.field, decision },
      })
    } catch (e) {
      console.error('[notify] edit-request decision hook failed:', e)
    }

    return NextResponse.json({ request: updated, entity: applied })
  } catch (e) {
    console.error('CEO decide edit-request error:', e)
    return NextResponse.json({ error: 'Failed to decide edit request' }, { status: 500 })
  }
}
