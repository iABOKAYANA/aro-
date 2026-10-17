import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/permissions'
import { leadSchema } from '@/lib/validations'
import { requireActor, leadScopeWhere } from '@/lib/lead-access'
import {
  getProtectionConfig,
  resolveProtectionWindow,
  getProtectionStatus,
  normalizePhone,
  normalizeEmail,
  findDuplicateLead,
  nextLeadCode,
} from '@/lib/lead-protection'
import { LEAD_STATUSES } from '@/lib/lead-lifecycle'
import { canBrokerAccess } from '@/lib/partnerships'
import { notifyUser, notifyRole, brokerUserId, developerUserId } from '@/lib/notify'

export const dynamic = 'force-dynamic'

const LIST_INCLUDE = {
  broker: { select: { id: true, user: { select: { name: true, email: true } } } },
  project: { select: { id: true, name: true, slug: true, developerId: true } },
  unit: { select: { id: true, name: true } },
  developer: { select: { id: true, companyName: true } },
  deals: { select: { id: true, status: true, dealValue: true }, take: 1, orderBy: { createdAt: 'desc' as const } },
} as const

function maskForRole<T extends { phone?: string; email?: string | null }>(role: string, row: T): T {
  if (role !== 'DEVELOPER') return row
  return { ...row, phone: row.phone ? `${row.phone.slice(0, 4)}•••••${row.phone.slice(-3)}` : row.phone,
    email: row.email ? `${row.email.slice(0, 2)}•••@${row.email.split('@')[1] || ''}` : row.email }
}

// ─── GET /api/leads — scoped list with protection filters ───
export async function GET(req: Request) {
  try {
    const actor = await requireActor(['BROKER', 'DEVELOPER', 'CEO', 'ADMIN'])
    if (!actor.ok) return actor.response
    const { ctx } = actor

    const { searchParams } = new URL(req.url)
    const status = searchParams.get('status')
    const reviewStatus = searchParams.get('reviewStatus')
    const protection = searchParams.get('protection') // active | expiring | expired | none
    const search = searchParams.get('search')
    const projectId = searchParams.get('projectId')
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1)
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50', 10) || 50))

    const scopeWhere: Record<string, unknown> = { ...leadScopeWhere(ctx) }
    if (status) {
      if (!(LEAD_STATUSES as readonly string[]).includes(status)) {
        return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
      }
      scopeWhere.status = status
    }
    if (reviewStatus) {
      if (!['ACTIVE', 'DUPLICATE_REVIEW', 'TRANSFERRED', 'CLOSED'].includes(reviewStatus)) {
        return NextResponse.json({ error: 'Invalid reviewStatus' }, { status: 400 })
      }
      scopeWhere.reviewStatus = reviewStatus
    }
    if (projectId) scopeWhere.projectId = projectId
    // NOTE: the text search must AND with the actor scope, never replace it.
    // `leadScopeWhere` returns an `OR` key for DEVELOPER, so a plain
    // `where.OR = ...` assignment here used to silently drop the own-projects
    // filter and hand a developer the whole table on any search.
    const and: Record<string, unknown>[] = [scopeWhere]
    if (search) {
      const or: Record<string, unknown>[] = [
        { name: { contains: search } },
        { leadCode: { contains: search } },
      ]
      if (search.length >= 3) or.push({ phone: { contains: search } }, { email: { contains: search } })
      and.push({ OR: or })
    }

    const config = await getProtectionConfig()
    const now = Date.now()
    const soon = now + config.expiringSoonDays * 86_400_000
    if (protection === 'active') {
      scopeWhere.protectionExpiresAt = { gte: new Date(soon) }
    } else if (protection === 'expiring') {
      scopeWhere.protectionExpiresAt = { gt: new Date(now), lte: new Date(soon) }
    } else if (protection === 'expired') {
      scopeWhere.protectionExpiresAt = { lte: new Date(now) }
    } else if (protection === 'none') {
      scopeWhere.protectionExpiresAt = null
    }
    const where: Record<string, unknown> = { AND: and }

    const [total, leads] = await Promise.all([
      db.lead.count({ where }),
      db.lead.findMany({
        where,
        include: LIST_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ])

    const decorated = leads.map((lead) => ({
      ...maskForRole(ctx.role, lead),
      protectionStatus: getProtectionStatus(lead, config),
    }))

    return NextResponse.json({
      leads: decorated,
      total,
      page,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      protectionConfig: {
        defaultDays: config.defaultDays,
        expiringSoonDays: config.expiringSoonDays,
      },
    })
  } catch (error) {
    console.error('Fetch leads error:', error)
    return NextResponse.json({ error: 'Failed to fetch leads' }, { status: 500 })
  }
}

// ─── POST /api/leads — register a lead with protection ──────
export async function POST(req: Request) {
  try {
    const actor = await requireActor(['BROKER', 'CEO', 'ADMIN'])
    if (!actor.ok) return actor.response
    const { ctx } = actor

    const body = await req.json()
    const parsed = leadSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Invalid input', issues: parsed.error.issues },
        { status: 400 }
      )
    }
    const input = parsed.data

    // Only CEOs can register on behalf of another broker — and the target
    // must be a real broker profile (never a raw client-supplied id).
    let targetBrokerId = ctx.brokerId
    if (ctx.isCEO && body.brokerId !== undefined && body.brokerId !== null) {
      const candidate = String(body.brokerId).trim()
      if (!candidate) {
        return NextResponse.json({ error: 'Invalid brokerId' }, { status: 400 })
      }
      const broker = await db.brokerProfile.findUnique({ where: { id: candidate }, select: { id: true } })
      if (!broker) return NextResponse.json({ error: 'Broker not found' }, { status: 404 })
      targetBrokerId = broker.id
    }
    if (ctx.role === 'BROKER' && !ctx.brokerId) {
      return NextResponse.json({ error: 'Broker profile not found' }, { status: 404 })
    }

    // Resolve project / unit / developer
    let projectId: string | null = input.projectId || null
    let unitId: string | null = input.unitId || null
    let developerId: string | null = input.developerId || null
    if (unitId) {
      const unit = await db.unit.findUnique({
        where: { id: unitId },
        select: { id: true, projectId: true, project: { select: { id: true, developerId: true } } },
      })
      if (!unit) return NextResponse.json({ error: 'Unit not found' }, { status: 404 })
      projectId = unit.projectId
      developerId = unit.project.developerId
    }
    if (projectId && !developerId) {
      const project = await db.project.findUnique({
        where: { id: projectId },
        select: { id: true, developerId: true, isActive: true },
      })
      if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })
      developerId = project.developerId
    }

    // Partnership / broker-access gate (server-side)
    if (targetBrokerId && (developerId || projectId)) {
      const access = await canBrokerAccess({ brokerId: targetBrokerId, developerId, projectId })
      if (!access.allowed) {
        return NextResponse.json({ error: access.reason || 'Access denied' }, { status: 403 })
      }
    }
    // Auto-routing (fail-open): brokerless lead (CEO w/o brokerId) + routing
    // on → assign when the routed broker passes the access gate, else unassigned.
    if (!targetBrokerId) {
      try {
        const { routeNewLead } = await import('@/lib/lead-routing')
        const routed = await routeNewLead()
        if (routed && (await canBrokerAccess({ brokerId: routed, developerId, projectId })).allowed) targetBrokerId = routed
      } catch { /* stay unassigned */ }
    }

    // Duplicate detection — never expose the other broker's client details
    const duplicate = await findDuplicateLead({ phone: input.phone, email: input.email })

    if (duplicate && duplicate.brokerId === targetBrokerId && duplicate.brokerId) {
      // Same broker re-registering: return the existing lead instead of duplicating
      const existing = await db.lead.findUnique({
        where: { id: duplicate.id },
        include: LIST_INCLUDE,
      })
      return NextResponse.json(
        {
          lead: existing,
          duplicate: true,
          sameBroker: true,
          message: 'This client is already registered on your account.',
        },
        { status: 200 }
      )
    }

    if (duplicate && duplicate.brokerId && duplicate.brokerId !== targetBrokerId) {
      // Another broker owns this client → create a review case, never overwrite
      const leadCode = await nextLeadCode()
      const created = await db.lead.create({
        data: {
          leadCode,
          brokerId: targetBrokerId,
          developerId,
          projectId,
          unitId,
          name: input.name,
          email: input.email || null,
          phone: input.phone,
          normalizedPhone: normalizePhone(input.phone),
          normalizedEmail: normalizeEmail(input.email),
          source: input.source,
          status: 'NEW',
          reviewStatus: 'DUPLICATE_REVIEW',
          duplicateOfId: duplicate.id,
          duplicateNote: 'Possible duplicate — ownership under review by EstateAI.',
          budgetMin: input.budgetMin ?? null,
          budgetMax: input.budgetMax ?? null,
          notes: input.notes || null,
          createdBy: ctx.userId,
          lastActivityAt: new Date(),
        },
        include: LIST_INCLUDE,
      })

      await db.leadActivity.create({
        data: { leadId: created.id, type: 'DUPLICATE_DETECTED', content: `Matched existing lead ${duplicate.leadCode || duplicate.id.slice(0, 8)}` },
      })
      await logAudit({
        userId: ctx.userId,
        action: 'DUPLICATE_DETECTED',
        entity: 'Lead',
        entityId: created.id,
        changes: { duplicateOf: duplicate.id, requestedBy: ctx.userId },
      })
      await notifyRole(['CEO', 'ADMIN'], {
        type: 'DUPLICATE_REVIEW',
        title: 'Duplicate lead needs review',
        message: `Lead ${leadCode} may duplicate ${duplicate.leadCode || 'an existing lead'} — ownership decision required.`,
        link: `/ceo/leads/${created.id}`,
        metadata: { leadId: created.id, duplicateOf: duplicate.id },
      })

      return NextResponse.json(
        {
          lead: created,
          duplicate: true,
          sameBroker: false,
          message: 'This client may already be registered on EstateAI by another partner. The case was sent to EstateAI for review.',
        },
        { status: 201 }
      )
    }

    // Unassigned lead (e.g. from a booking) with no owner → claim it
    if (duplicate && !duplicate.brokerId && targetBrokerId && !ctx.isCEO) {
      const claimConfig = await getProtectionConfig()
      const claimWindow = await resolveProtectionWindow({ projectId, developerId, config: claimConfig })
      const claimStart = new Date()
      const claimEnd = new Date(claimStart.getTime() + claimWindow.days * 86_400_000)
      const claimed = await db.$transaction(async (tx) => {
        const lead = await tx.lead.update({
          where: { id: duplicate.id },
          data: {
            brokerId: targetBrokerId,
            developerId,
            projectId,
            unitId,
            reviewStatus: 'ACTIVE',
            createdBy: ctx.userId,
            lastActivityAt: new Date(),
            protectionStartsAt: claimStart,
            protectionExpiresAt: claimEnd,
            protectionDays: claimWindow.days,
            protectionSource: claimWindow.source,
          },
          include: LIST_INCLUDE,
        })
        await tx.leadActivity.create({
          data: { leadId: lead.id, type: 'LEAD_CLAIMED', content: 'Unassigned lead claimed with protection activated' },
        })
        return lead
      })

      await logAudit({
        userId: ctx.userId,
        action: 'LEAD_ASSIGNED',
        entity: 'Lead',
        entityId: claimed.id,
        changes: { brokerId: targetBrokerId, via: 'claim' },
      })

      return NextResponse.json(
        { lead: claimed, claimed: true, message: 'Existing unassigned lead claimed and protection activated.' },
        { status: 200 }
      )
    }

    // Normal registration with protection
    const config = await getProtectionConfig()
    const protWindow = await resolveProtectionWindow({ projectId, developerId, config })
    const leadCode = await nextLeadCode()
    const now = new Date()

    const lead = await db.lead.create({
      data: {
        leadCode,
        brokerId: targetBrokerId,
        developerId,
        projectId,
        unitId,
        name: input.name,
        email: input.email || null,
        phone: input.phone,
        normalizedPhone: normalizePhone(input.phone),
        normalizedEmail: normalizeEmail(input.email),
        source: input.source,
        status: input.status || 'NEW',
        reviewStatus: 'ACTIVE',
        budgetMin: input.budgetMin ?? null,
        budgetMax: input.budgetMax ?? null,
        preferredPropertyTypes: JSON.stringify(input.preferredPropertyTypes || []),
        preferredAreas: JSON.stringify(input.preferredAreas || []),
        notes: input.notes || null,
        tags: JSON.stringify(input.tags || []),
        nextFollowUp: input.nextFollowUp ? new Date(input.nextFollowUp) : null,
        protectionStartsAt: now,
        protectionExpiresAt: new Date(now.getTime() + protWindow.days * 86_400_000),
        protectionDays: protWindow.days,
        protectionSource: protWindow.source,
        createdBy: ctx.userId,
        lastActivityAt: now,
      },
      include: LIST_INCLUDE,
    })

    await db.leadActivity.create({
      data: {
        leadId: lead.id,
        type: 'LEAD_CREATED',
        content: `Registered ${leadCode} — protection until ${lead.protectionExpiresAt!.toISOString().slice(0, 10)} (${protWindow.days}d, ${protWindow.source.toLowerCase()})`,
      },
    })
    await db.leadOwnershipHistory.create({
      data: {
        leadId: lead.id,
        action: 'ASSIGNED',
        toBrokerId: targetBrokerId,
        changedById: ctx.userId,
        newExpiresAt: lead.protectionExpiresAt,
        metadata: JSON.stringify({ source: protWindow.source, days: protWindow.days }),
      },
    })
    await logAudit({
      userId: ctx.userId,
      action: 'LEAD_CREATED',
      entity: 'Lead',
      entityId: lead.id,
      changes: { leadCode, brokerId: targetBrokerId, protectionDays: protWindow.days },
    })

    // Notifications (broker + developer + CEO on new lead)
    const bUserId = await brokerUserId(targetBrokerId)
    await notifyUser(bUserId, {
      type: 'LEAD_CREATED',
      title: `New lead ${leadCode}`,
      message: `${input.name} registered — protection active for ${protWindow.days} days.`,
      link: `/dashboard/leads/${lead.id}`,
      metadata: { leadId: lead.id },
    })
    await notifyUser(bUserId, {
      type: 'PROTECTION_ACTIVATED',
      title: `Protection activated for ${leadCode}`,
      message: `Your attribution is protected until ${lead.protectionExpiresAt!.toISOString().slice(0, 10)}.`,
      link: `/dashboard/leads/${lead.id}`,
      metadata: { leadId: lead.id },
    })
    if (developerId) {
      await notifyUser(await developerUserId(developerId), {
        type: 'NEW_ESTATEAI_LEAD',
        title: 'New EstateAI lead',
        message: `A partner registered lead ${leadCode}${lead.project ? ` for ${lead.project.name}` : ''}.`,
        link: `/dashboard/leads/${lead.id}`,
        metadata: { leadId: lead.id },
      })
    }
    if (ctx.role === 'BROKER') {
      await notifyRole(['CEO', 'ADMIN'], {
        type: 'LEAD_CREATED',
        title: `Lead ${leadCode} registered`,
        message: `${input.name} registered by a partner broker.`,
        link: `/ceo/leads/${lead.id}`,
        metadata: { leadId: lead.id },
      })
    }

    return NextResponse.json({ lead, message: 'Lead registered and protection activated.' }, { status: 201 })
  } catch (error) {
    console.error('Create lead error:', error)
    return NextResponse.json({ error: 'Failed to create lead' }, { status: 500 })
  }
}
