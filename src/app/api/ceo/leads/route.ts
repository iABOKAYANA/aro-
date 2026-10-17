import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireCEOApi, logAudit } from '@/lib/permissions'
import { getProtectionConfig, getProtectionStatus } from '@/lib/lead-protection'
import { applyStatusTransition } from '@/lib/lead-lifecycle'
import { LEAD_STATUSES } from '@/lib/lead-lifecycle'
import {
  resolveProtectionWindow,
  normalizePhone,
  normalizeEmail,
  findDuplicateLead,
  nextLeadCode,
} from '@/lib/lead-protection'
import { notifyUser, brokerUserId, developerUserId } from '@/lib/notify'

export const dynamic = 'force-dynamic'

const CEO_LEAD_INCLUDE = {
  broker: { select: { id: true, user: { select: { name: true, email: true } } } },
  project: { select: { id: true, name: true, slug: true, developerId: true } },
  unit: { select: { id: true, name: true } },
  developer: { select: { id: true, companyName: true } },
} as const

export async function GET(req: Request) {
  try {
    const { error } = await requireCEOApi()
    if (error) return error

    const { searchParams } = new URL(req.url)
    const search = searchParams.get('search')?.slice(0, 120) || null
    const status = searchParams.get('status')
    const brokerId = searchParams.get('brokerId')
    const reviewStatus = searchParams.get('reviewStatus')
    const developerId = searchParams.get('developerId')
    const projectId = searchParams.get('projectId')

    const where: Record<string, unknown> = {}
    if (status) {
      if (!(LEAD_STATUSES as readonly string[]).includes(status)) {
        return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
      }
      where.status = status
    }
    if (brokerId) where.brokerId = brokerId
    if (reviewStatus) {
      if (!['ACTIVE', 'DUPLICATE_REVIEW', 'TRANSFERRED', 'CLOSED'].includes(reviewStatus)) {
        return NextResponse.json({ error: 'Invalid reviewStatus' }, { status: 400 })
      }
      where.reviewStatus = reviewStatus
    }
    if (developerId) where.developerId = developerId
    if (projectId) where.projectId = projectId
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { email: { contains: search } },
        { phone: { contains: search } },
        { leadCode: { contains: search } },
      ]
    }

    const leads = await db.lead.findMany({
      where,
      include: {
        broker: {
          select: {
            id: true,
            user: { select: { name: true, email: true } },
          },
        },
        activities: {
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
        viewings: {
          orderBy: { scheduledAt: 'desc' },
          take: 3,
        },
        project: { select: { id: true, name: true, developerId: true } },
        developer: { select: { id: true, companyName: true } },
        deals: {
          select: { id: true, status: true, dealValue: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { createdAt: 'desc' },
      // Guardrail: the console renders newest-first; never dump the table.
      take: 2000,
    })

    const config = await getProtectionConfig()
    const decorated = leads.map((lead) => ({
      ...lead,
      protectionStatus: getProtectionStatus(lead, config),
    }))

    return NextResponse.json({ leads: decorated })
  } catch (error) {
    console.error('CEO fetch leads error:', error)
    return NextResponse.json({ error: 'Failed to fetch leads' }, { status: 500 })
  }
}

// ─── POST /api/ceo/leads — CEO creates a lead with source + broker ──
// Body: { name*, phone*, email?, source? (default WEBSITE; COLD_CALL and
// any other ≤40-char label accepted — Lead.source is an open string, there
// is no closed enum), brokerId? (assign at creation; omitted/null =
// unassigned), projectId?, unitId?, developerId?, notes?, budgetMin?,
// budgetMax?, status? (default NEW), priority? (validated int 0..5;
// NOT persisted — Lead has no priority column — recorded in activity only),
// reason? (assignment reason for ownership history) }
// Creates the lead, activates protection, writes ownership history +
// activity, audits, and notifies the assigned broker (fail-soft).
export async function POST(req: Request) {
  try {
    const { error, session } = await requireCEOApi()
    if (error) return error
    const actorId = (session!.user as any)?.id as string

    const body = (await req.json().catch(() => null)) as Record<string, any> | null
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
    }

    const name = typeof body.name === 'string' ? body.name.trim() : ''
    if (!name || name.length < 2 || name.length > 100) {
      return NextResponse.json({ error: 'Name is required (2-100 characters)' }, { status: 400 })
    }
    // Lead.phone is NOT NULL in the schema, so phone stays required here.
    const phone = typeof body.phone === 'string' ? body.phone.trim() : ''
    if (!phone || phone.length > 30 || !/^\+?[\d\s\-().]{7,30}$/.test(phone)) {
      return NextResponse.json({ error: 'A valid phone number is required' }, { status: 400 })
    }
    const emailRaw = typeof body.email === 'string' ? body.email.trim() : ''
    if (emailRaw && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(emailRaw.slice(0, 254))) {
      return NextResponse.json({ error: 'Invalid email address' }, { status: 400 })
    }
    const source = body.source === undefined || body.source === null
      ? 'WEBSITE'
      : String(body.source).trim()
    if (!source || source.length > 40) {
      return NextResponse.json({ error: 'Invalid source' }, { status: 400 })
    }
    const status = body.status === undefined || body.status === null ? 'NEW' : String(body.status)
    if (!(LEAD_STATUSES as readonly string[]).includes(status)) {
      return NextResponse.json({ error: `Unknown status: ${status}` }, { status: 400 })
    }
    let priority: number | null = null
    if (body.priority !== undefined && body.priority !== null) {
      const p = Number(body.priority)
      if (!Number.isInteger(p) || p < 0 || p > 5) {
        return NextResponse.json({ error: 'priority must be an integer 0-5' }, { status: 400 })
      }
      priority = p
    }
    for (const [k, v] of [['budgetMin', body.budgetMin], ['budgetMax', body.budgetMax]] as const) {
      if (v !== undefined && v !== null && (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 1_000_000_000_000)) {
        return NextResponse.json({ error: `Invalid ${k}` }, { status: 400 })
      }
    }
    if (body.notes !== undefined && body.notes !== null && (typeof body.notes !== 'string' || body.notes.length > 4000)) {
      return NextResponse.json({ error: 'Notes too long' }, { status: 400 })
    }

    // Broker assignment at creation (validated; omitted/null = unassigned).
    let targetBrokerId: string | null = null
    if (body.brokerId !== undefined && body.brokerId !== null) {
      if (typeof body.brokerId !== 'string' || !body.brokerId.trim()) {
        return NextResponse.json({ error: 'Invalid brokerId' }, { status: 400 })
      }
      const broker = await db.brokerProfile.findUnique({
        where: { id: body.brokerId.trim() },
        select: { id: true },
      })
      if (!broker) return NextResponse.json({ error: 'Broker not found' }, { status: 404 })
      targetBrokerId = broker.id
    }
    // Auto-routing (fail-open): brokerless lead + routing on → assign.
    if (!targetBrokerId) {
      try {
        const { routeNewLead } = await import('@/lib/lead-routing')
        targetBrokerId = (await routeNewLead()) ?? targetBrokerId
      } catch { /* stay unassigned */ }
    }

    // Resolve project / unit / developer (unit wins, then project).
    let projectId: string | null = typeof body.projectId === 'string' && body.projectId.trim() ? body.projectId.trim() : null
    let unitId: string | null = typeof body.unitId === 'string' && body.unitId.trim() ? body.unitId.trim() : null
    let developerId: string | null = typeof body.developerId === 'string' && body.developerId.trim() ? body.developerId.trim() : null
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
        select: { id: true, developerId: true },
      })
      if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })
      developerId = project.developerId
    }
    if (developerId) {
      const dev = await db.developerProfile.findUnique({ where: { id: developerId }, select: { id: true } })
      if (!dev) return NextResponse.json({ error: 'Developer not found' }, { status: 404 })
    }

    // Duplicate detection — same outcomes as the broker registration flow.
    const duplicate = await findDuplicateLead({ phone, email: emailRaw || null })
    if (duplicate && duplicate.brokerId === targetBrokerId && duplicate.brokerId) {
      const existing = await db.lead.findUnique({ where: { id: duplicate.id }, include: CEO_LEAD_INCLUDE })
      return NextResponse.json(
        { lead: existing, duplicate: true, sameBroker: true, message: 'This client is already registered on that broker account.' },
        { status: 200 }
      )
    }
    if (duplicate && duplicate.brokerId && duplicate.brokerId !== targetBrokerId) {
      const leadCode = await nextLeadCode()
      const created = await db.lead.create({
        data: {
          leadCode,
          brokerId: targetBrokerId,
          developerId,
          projectId,
          unitId,
          name,
          email: emailRaw || null,
          phone,
          normalizedPhone: normalizePhone(phone),
          normalizedEmail: normalizeEmail(emailRaw),
          source,
          status: 'NEW',
          reviewStatus: 'DUPLICATE_REVIEW',
          duplicateOfId: duplicate.id,
          duplicateNote: 'Possible duplicate — ownership under review by EstateAI.',
          budgetMin: body.budgetMin ?? null,
          budgetMax: body.budgetMax ?? null,
          notes: (typeof body.notes === 'string' ? body.notes : null),
          createdBy: actorId,
          lastActivityAt: new Date(),
        },
        include: CEO_LEAD_INCLUDE,
      })
      await db.leadActivity.create({
        data: { leadId: created.id, type: 'DUPLICATE_DETECTED', content: `CEO-created ${leadCode} matched existing lead ${duplicate.leadCode || duplicate.id.slice(0, 8)}` },
      })
      await logAudit({
        userId: actorId,
        action: 'DUPLICATE_DETECTED',
        entity: 'Lead',
        entityId: created.id,
        changes: { duplicateOf: duplicate.id, requestedBy: actorId, via: 'ceo-create' },
      })
      await notifyUser(await brokerUserId(targetBrokerId), {
        type: 'LEAD_ASSIGNED',
        title: `Lead ${leadCode} assigned to you (review pending)`,
        message: `${name} created by EstateAI administration — possible duplicate under review.`,
        link: `/dashboard/leads/${created.id}`,
        metadata: { leadId: created.id },
      })
      return NextResponse.json(
        { lead: created, duplicate: true, sameBroker: false, message: 'Possible duplicate — case sent for review.' },
        { status: 201 }
      )
    }
    // Unassigned duplicate: CEO either claims it for the broker or returns it.
    if (duplicate && !duplicate.brokerId) {
      if (targetBrokerId) {
        const config = await getProtectionConfig()
        const window = await resolveProtectionWindow({ projectId, developerId, config })
        const start = new Date()
        const claimed = await db.lead.update({
          where: { id: duplicate.id },
          data: {
            brokerId: targetBrokerId,
            developerId,
            projectId,
            unitId,
            source,
            reviewStatus: 'ACTIVE',
            createdBy: actorId,
            updatedBy: actorId,
            lastActivityAt: new Date(),
            protectionStartsAt: start,
            protectionExpiresAt: new Date(start.getTime() + window.days * 86_400_000),
            protectionDays: window.days,
            protectionSource: window.source,
          },
          include: CEO_LEAD_INCLUDE,
        })
        await db.leadActivity.create({
          data: { leadId: claimed.id, type: 'LEAD_CLAIMED', content: `Unassigned lead claimed for broker by CEO (source: ${source})` },
        })
        await db.leadOwnershipHistory.create({
          data: {
            leadId: claimed.id,
            action: 'ASSIGNED',
            toBrokerId: targetBrokerId,
            changedById: actorId,
            reason: typeof body.reason === 'string' ? body.reason : 'Assigned by CEO at creation',
            newExpiresAt: claimed.protectionExpiresAt,
          },
        })
        await logAudit({
          userId: actorId,
          action: 'LEAD_ASSIGNED',
          entity: 'Lead',
          entityId: claimed.id,
          changes: { brokerId: targetBrokerId, via: 'ceo-create-claim' },
        })
        await notifyUser(await brokerUserId(targetBrokerId), {
          type: 'LEAD_ASSIGNED',
          title: `Lead ${claimed.leadCode || claimed.id.slice(0, 8)} assigned to you`,
          message: `${claimed.name} assigned by EstateAI administration (source: ${source}).`,
          link: `/dashboard/leads/${claimed.id}`,
          metadata: { leadId: claimed.id },
        })
        return NextResponse.json({ lead: claimed, claimed: true, message: 'Existing unassigned lead claimed and assigned.' }, { status: 200 })
      }
      const existing = await db.lead.findUnique({ where: { id: duplicate.id }, include: CEO_LEAD_INCLUDE })
      return NextResponse.json({ lead: existing, duplicate: true, message: 'An unassigned lead already exists for this client.' }, { status: 200 })
    }

    // Normal creation with protection.
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
        name,
        email: emailRaw || null,
        phone,
        normalizedPhone: normalizePhone(phone),
        normalizedEmail: normalizeEmail(emailRaw),
        source,
        status,
        reviewStatus: 'ACTIVE',
        budgetMin: body.budgetMin ?? null,
        budgetMax: body.budgetMax ?? null,
        notes: typeof body.notes === 'string' ? body.notes : null,
        createdBy: actorId,
        updatedBy: actorId,
        lastActivityAt: now,
        protectionStartsAt: now,
        protectionExpiresAt: new Date(now.getTime() + protWindow.days * 86_400_000),
        protectionDays: protWindow.days,
        protectionSource: protWindow.source,
      },
      include: CEO_LEAD_INCLUDE,
    })

    await db.leadActivity.create({
      data: {
        leadId: lead.id,
        type: 'LEAD_CREATED',
        content: `Created by CEO ${leadCode} (source: ${source})${priority !== null ? ` — priority P${priority}` : ''} — protection until ${lead.protectionExpiresAt!.toISOString().slice(0, 10)} (${protWindow.days}d, ${protWindow.source.toLowerCase()})`,
      },
    })
    await db.leadOwnershipHistory.create({
      data: {
        leadId: lead.id,
        action: 'ASSIGNED',
        toBrokerId: targetBrokerId,
        changedById: actorId,
        reason: typeof body.reason === 'string' ? body.reason : 'Created + assigned by CEO',
        newExpiresAt: lead.protectionExpiresAt,
        metadata: JSON.stringify({ source: protWindow.source, days: protWindow.days, leadSource: source, priority }),
      },
    })
    await logAudit({
      userId: actorId,
      action: 'LEAD_CREATED',
      entity: 'Lead',
      entityId: lead.id,
      changes: { leadCode, brokerId: targetBrokerId, source, priority, protectionDays: protWindow.days, via: 'ceo-create' },
    })

    // Fail-soft broker + developer notifications.
    await notifyUser(await brokerUserId(targetBrokerId), {
      type: 'LEAD_ASSIGNED',
      title: `Lead ${leadCode} assigned to you`,
      message: `${name} created by EstateAI administration (source: ${source}) — protection active for ${protWindow.days} days.`,
      link: `/dashboard/leads/${lead.id}`,
      metadata: { leadId: lead.id },
    })
    if (developerId) {
      await notifyUser(await developerUserId(developerId), {
        type: 'NEW_ESTATEAI_LEAD',
        title: 'New EstateAI lead',
        message: `Administration registered lead ${leadCode}${lead.project ? ` for ${lead.project.name}` : ''} (source: ${source}).`,
        link: `/dashboard/leads/${lead.id}`,
        metadata: { leadId: lead.id },
      })
    }

    return NextResponse.json(
      { lead, priority, message: 'Lead created, assigned and protection activated.' },
      { status: 201 }
    )
  } catch (err) {
    console.error('CEO create lead error:', err)
    return NextResponse.json({ error: 'Failed to create lead' }, { status: 500 })
  }
}

export async function PATCH(req: Request) {
  try {
    const { error } = await requireCEOApi()
    if (error) return error

    const body = (await req.json().catch(() => null)) ?? {}
    const { id, status, brokerId, notes, email, phone, name, budgetMin, budgetMax, lostReason } = body
    if (!id) return NextResponse.json({ error: 'Lead ID required' }, { status: 400 })

    // Email/phone formats validated server-side (was written raw).
    const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
    if (email !== undefined && email !== null && email !== '') {
      const e = String(email).trim().slice(0, 254)
      if (!EMAIL_RE.test(e)) return NextResponse.json({ error: 'Invalid email address' }, { status: 400 })
    }
    if (phone !== undefined && phone !== null && phone !== '') {
      const p = String(phone).trim()
      if (p.length > 30 || !/^\+?[\d\s\-().]{7,30}$/.test(p)) {
        return NextResponse.json({ error: 'Invalid phone number' }, { status: 400 })
      }
    }
    if (name !== undefined && (typeof name !== 'string' || !name.trim() || name.trim().length > 100)) {
      return NextResponse.json({ error: 'Invalid name' }, { status: 400 })
    }
    for (const [k, v] of [['budgetMin', budgetMin], ['budgetMax', budgetMax]] as const) {
      if (v !== undefined && v !== null && (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 1_000_000_000_000)) {
        return NextResponse.json({ error: `Invalid ${k}` }, { status: 400 })
      }
    }
    if (typeof notes === 'string' && notes.length > 4000) {
      return NextResponse.json({ error: 'Notes too long' }, { status: 400 })
    }
    if (typeof lostReason === 'string' && lostReason.length > 1000) {
      return NextResponse.json({ error: 'lostReason too long' }, { status: 400 })
    }
    // Explicit broker-reassign intent: `brokerId: null` unassigns, a string
    // transfers, `undefined` leaves ownership untouched. An empty string is
    // rejected (was silently written through).
    if (brokerId !== undefined && brokerId !== null && (typeof brokerId !== 'string' || !brokerId.trim())) {
      return NextResponse.json({ error: 'Invalid brokerId' }, { status: 400 })
    }

    const existing = await db.lead.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })

    // Reassigning to a non-existent broker must 404, not write a dangling id.
    if (typeof brokerId === 'string' && brokerId !== existing.brokerId) {
      const target = await db.brokerProfile.findUnique({ where: { id: brokerId }, select: { id: true } })
      if (!target) return NextResponse.json({ error: 'Broker not found' }, { status: 404 })
    }

    const { session } = await requireCEOApi()
    const actorId = (session!.user as any)?.id as string | undefined

    // Status changes go through the deterministic state machine — same path
    // as the broker flow: validates the transition, stamps lifecycle fields,
    // writes LeadActivity and auto-creates the linked Deal at reservation+.
    let transitionFailed: string | null = null
    if (status !== undefined && status !== existing.status) {
      const result = await applyStatusTransition({
        leadId: id,
        to: status,
        actorId: actorId || null,
        actorRole: 'CEO',
        dealValue: typeof body.dealValue === 'number' ? body.dealValue : null,
        notes: typeof body.notes === 'string' ? body.notes : null,
      })
      if (!result.ok) {
        transitionFailed = result.error || 'Invalid transition'
      }
    }

    const updateData: Record<string, unknown> = {}
    if (brokerId !== undefined) updateData.brokerId = brokerId
    if (notes !== undefined) updateData.notes = notes
    if (email !== undefined) updateData.email = email
    if (phone !== undefined) updateData.phone = phone
    if (name !== undefined) updateData.name = name
    if (budgetMin !== undefined) updateData.budgetMin = budgetMin
    if (budgetMax !== undefined) updateData.budgetMax = budgetMax
    if (lostReason !== undefined) updateData.lostReason = lostReason
    updateData.updatedBy = actorId
    updateData.lastActivityAt = new Date()

    if (status === 'CONTACTED' && !body.contactedAt) {
      updateData.contactedAt = new Date()
    }
    if (status === 'CONVERTED') {
      updateData.convertedAt = new Date()
    }

    const lead = await db.lead.update({
      where: { id },
      data: updateData,
    })

    // Audit + ownership history for sensitive changes
    if (brokerId !== undefined && brokerId !== existing.brokerId) {
      await db.leadOwnershipHistory.create({
        data: {
          leadId: id,
          action: 'TRANSFERRED',
          fromBrokerId: existing.brokerId,
          toBrokerId: brokerId,
          changedById: actorId || 'unknown',
          reason: typeof body.reason === 'string' ? body.reason : null,
          previousExpiresAt: existing.protectionExpiresAt,
          newExpiresAt: existing.protectionExpiresAt,
        },
      })
    }
    await logAudit({
      userId: actorId,
      action: 'LEAD_UPDATED',
      entity: 'Lead',
      entityId: id,
      changes: { status: status ?? null, brokerId: brokerId ?? null, fields: Object.keys(updateData) },
    })

    if (transitionFailed) {
      return NextResponse.json({ error: transitionFailed, lead }, { status: 409 })
    }

    return NextResponse.json({ lead })
  } catch (error) {
    console.error('CEO update lead error:', error)
    return NextResponse.json({ error: 'Failed to update lead' }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  try {
    const { error } = await requireCEOApi()
    if (error) return error

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'Lead ID required' }, { status: 400 })

    // Never delete a lead that carries deal attribution
    const dealCount = await db.deal.count({ where: { leadId: id } })
    if (dealCount > 0) {
      return NextResponse.json(
        { error: 'This lead has linked deals and cannot be deleted.' },
        { status: 409 }
      )
    }

    await db.lead.delete({ where: { id } })
    const { session } = await requireCEOApi()
    await logAudit({
      userId: (session!.user as any)?.id,
      action: 'LEAD_DELETED',
      entity: 'Lead',
      entityId: id,
    })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('CEO delete lead error:', error)
    return NextResponse.json({ error: 'Failed to delete lead' }, { status: 500 })
  }
}
