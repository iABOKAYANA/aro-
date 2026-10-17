import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireActor } from '@/lib/lead-access'
import { logAudit } from '@/lib/permissions'
import { notifyRole } from '@/lib/notify'
import {
  EDIT_ENTITIES,
  coerceEditValue,
  isWhitelistedField,
  snapshotValue,
  type EditEntity,
} from '@/lib/edit-requests'

export const dynamic = 'force-dynamic'

/**
 * POST /api/developer/edit-requests ← { entity, entityId, field, newValue, message? }
 *
 * Developer-authed field change request on an OWN project/unit/plan.
 * `entity` must be PROJECT|UNIT|PLAN; the entity must belong to the caller's
 * own projects (requireOwnProject-style ownership check); `field` must be in
 * the per-entity whitelist (see src/lib/edit-requests.ts) else 400.
 * `newValue` is validated/coerced at submit time so a request that could
 * never apply is rejected early — but the value is only APPLIED on CEO
 * approval. → 201 { request } with status PENDING.
 */
export async function POST(req: Request) {
  try {
    const gate = await requireActor(['DEVELOPER'])
    if (!gate.ok) return gate.response
    const { ctx } = gate

    if (!ctx.developerId) {
      return NextResponse.json(
        { error: 'No developer profile linked to this account' },
        { status: 403 }
      )
    }

    const body = await req.json()
    const { entity, entityId, field, newValue, message } = body as {
      entity?: unknown
      entityId?: unknown
      field?: unknown
      newValue?: unknown
      message?: unknown
    }

    if (typeof entity !== 'string' || !(EDIT_ENTITIES as readonly string[]).includes(entity)) {
      return NextResponse.json({ error: 'entity must be one of: PROJECT, UNIT, PLAN' }, { status: 400 })
    }
    if (typeof entityId !== 'string' || !entityId) {
      return NextResponse.json({ error: 'entityId is required' }, { status: 400 })
    }
    if (typeof field !== 'string' || !isWhitelistedField(entity, field)) {
      return NextResponse.json(
        { error: `field "${typeof field === 'string' ? field : ''}" cannot be changed via edit request` },
        { status: 400 }
      )
    }
    if (newValue === undefined || newValue === null) {
      return NextResponse.json({ error: 'newValue is required' }, { status: 400 })
    }

    const ent = entity as EditEntity

    // Ownership: the entity must sit under one of the caller's OWN projects.
    let projectId: string | null = null
    let current: Record<string, unknown> | null = null
    if (ent === 'PROJECT') {
      const project = await db.project.findUnique({ where: { id: entityId } })
      if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })
      if (project.developerId !== ctx.developerId) {
        return NextResponse.json(
          { error: 'Forbidden: this project belongs to another developer' },
          { status: 403 }
        )
      }
      projectId = project.id
      current = project as unknown as Record<string, unknown>
    } else if (ent === 'UNIT') {
      const unit = await db.unit.findUnique({
        where: { id: entityId },
        include: { project: { select: { id: true, developerId: true } } },
      })
      if (!unit) return NextResponse.json({ error: 'Unit not found' }, { status: 404 })
      if (unit.project.developerId !== ctx.developerId) {
        return NextResponse.json(
          { error: 'Forbidden: this unit belongs to another developer' },
          { status: 403 }
        )
      }
      projectId = unit.project.id
      const { project: _ignored, ...rest } = unit as unknown as Record<string, unknown> & { project: unknown }
      void _ignored
      current = rest
    } else {
      const plan = await db.paymentPlan.findUnique({
        where: { id: entityId },
        include: { project: { select: { id: true, developerId: true } } },
      })
      if (!plan) return NextResponse.json({ error: 'Payment plan not found' }, { status: 404 })
      if (plan.project.developerId !== ctx.developerId) {
        return NextResponse.json(
          { error: 'Forbidden: this payment plan belongs to another developer' },
          { status: 403 }
        )
      }
      projectId = plan.project.id
      const { project: _ignored, ...rest } = plan as unknown as Record<string, unknown> & { project: unknown }
      void _ignored
      current = rest
    }

    // FK-valued project fields must point at real rows.
    if (
      ent === 'PROJECT' &&
      (field === 'governorateId' || field === 'cityId' || field === 'districtId')
    ) {
      const ref = String(newValue).trim()
      if (ref !== '') {
        const exists =
          field === 'governorateId'
            ? await db.governorate.findUnique({ where: { id: ref }, select: { id: true } })
            : field === 'cityId'
              ? await db.city.findUnique({ where: { id: ref }, select: { id: true } })
              : await db.district.findUnique({ where: { id: ref }, select: { id: true } })
        if (!exists) {
          return NextResponse.json({ error: `${field} does not reference an existing row` }, { status: 400 })
        }
      }
    }

    const coerced = coerceEditValue(ent, field, newValue)
    if (!coerced.ok) {
      return NextResponse.json({ error: coerced.error }, { status: 400 })
    }

    const request = await db.editRequest.create({
      data: {
        entity: ent,
        entityId,
        field,
        oldValue: snapshotValue(current[field]),
        newValue: typeof newValue === 'string' ? newValue : String(newValue),
        message: typeof message === 'string' && message.trim() ? message.trim().slice(0, 2000) : null,
        developerId: ctx.userId,
        status: 'PENDING',
      },
    })

    await logAudit({
      userId: ctx.userId,
      action: 'EDIT_REQUEST_CREATED',
      entity: ent === 'PLAN' ? 'PaymentPlan' : ent === 'UNIT' ? 'Unit' : 'Project',
      entityId,
      changes: { requestId: request.id, field, projectId },
    })

    // Review-queue nudge (fail-soft — never breaks the 201). Link uses the
    // existing website URL space resolvable by mobile links.ts.
    try {
      await notifyRole(['CEO', 'ADMIN'], {
        type: 'EDIT_REQUEST',
        title: 'New edit request awaiting review',
        message: `A developer requested ${ent} ${field} on ${entityId}.`,
        link: '/ceo/developers',
        metadata: { requestId: request.id, entity: ent, entityId, field, projectId },
      })
    } catch (e) {
      console.error('[notify] edit-request hook failed:', e)
    }

    return NextResponse.json({ request }, { status: 201 })
  } catch (e) {
    console.error('Developer edit-request error:', e)
    return NextResponse.json({ error: 'Failed to submit edit request' }, { status: 500 })
  }
}

const MINE_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'] as const

/**
 * GET /api/developer/edit-requests[?status=] — the CALLER's own requests,
 * newest-first. `status` optionally filters PENDING|APPROVED|REJECTED.
 * → 200 { requests }, each with target-entity context (its project at
 * minimum; unit/plan rows also name the unit/plan) plus the decision
 * (`status`) and the CEO's `reason`.
 *
 * Developer-scoped: only rows the caller created (`developerId` is the
 * caller's userId, as POST stores it) — never another developer's.
 */
export async function GET(req: Request) {
  try {
    const gate = await requireActor(['DEVELOPER'])
    if (!gate.ok) return gate.response
    const { ctx } = gate

    if (!ctx.developerId) {
      return NextResponse.json(
        { error: 'No developer profile linked to this account' },
        { status: 403 }
      )
    }

    const { searchParams } = new URL(req.url)
    const status = searchParams.get('status')
    if (status !== null && status !== '' && !(MINE_STATUSES as readonly string[]).includes(status)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${MINE_STATUSES.join(', ')}` },
        { status: 400 }
      )
    }

    const rows = await db.editRequest.findMany({
      where: { developerId: ctx.userId, ...(status ? { status } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })

    // Target context in three batched queries (no per-row N+1). Deleted
    // targets resolve to null context rather than dropping the row.
    const projectIds = [...new Set(rows.filter((r) => r.entity === 'PROJECT').map((r) => r.entityId))]
    const unitIds = [...new Set(rows.filter((r) => r.entity === 'UNIT').map((r) => r.entityId))]
    const planIds = [...new Set(rows.filter((r) => r.entity === 'PLAN').map((r) => r.entityId))]
    const [projects, units, plans] = await Promise.all([
      projectIds.length > 0
        ? db.project.findMany({ where: { id: { in: projectIds } }, select: { id: true, name: true } })
        : Promise.resolve([] as { id: string; name: string }[]),
      unitIds.length > 0
        ? db.unit.findMany({
            where: { id: { in: unitIds } },
            select: { id: true, name: true, project: { select: { id: true, name: true } } },
          })
        : Promise.resolve([] as { id: string; name: string; project: { id: string; name: string } }[]),
      planIds.length > 0
        ? db.paymentPlan.findMany({
            where: { id: { in: planIds } },
            select: { id: true, name: true, project: { select: { id: true, name: true } } },
          })
        : Promise.resolve([] as { id: string; name: string; project: { id: string; name: string } }[]),
    ])
    const projectById = new Map(projects.map((p) => [p.id, p]))
    const unitById = new Map(units.map((u) => [u.id, u]))
    const planById = new Map(plans.map((p) => [p.id, p]))

    const requests = rows.map((r) => {
      const unit = r.entity === 'UNIT' ? (unitById.get(r.entityId) ?? null) : null
      const plan = r.entity === 'PLAN' ? (planById.get(r.entityId) ?? null) : null
      const project =
        r.entity === 'PROJECT'
          ? (projectById.get(r.entityId) ?? null)
          : ((unit?.project ?? plan?.project ?? null) as { id: string; name: string } | null)
      return {
        id: r.id,
        entity: r.entity,
        entityId: r.entityId,
        field: r.field,
        oldValue: r.oldValue,
        newValue: r.newValue,
        message: r.message,
        status: r.status,
        reason: r.reason,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
        project,
        unit: unit ? { id: unit.id, name: unit.name } : null,
        plan: plan ? { id: plan.id, name: plan.name } : null,
      }
    })

    return NextResponse.json({ requests })
  } catch (e) {
    console.error('Developer list edit-requests error:', e)
    return NextResponse.json({ error: 'Failed to list edit requests' }, { status: 500 })
  }
}
