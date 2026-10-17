import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireCEOApi, logAudit } from '@/lib/permissions'
import { syncDealCommission } from '@/lib/commission'
import { notifyUser, brokerUserId, developerUserId } from '@/lib/notify'

export const dynamic = 'force-dynamic'

// ─── POST /api/ceo/deals — CEO closes/reports a deal on a broker's record ──
// Body: { leadId*, brokerId* (attributed broker — overwrites deal attribution),
//   projectId? (default lead.projectId), unitId?, dealValue* (>0),
//   status? (RESERVATION | CONTRACT | SOLD, default SOLD),
//   reservationDate? | contractDate? | saleDate? (ISO datetimes; the date for
//   the target stage auto-stamps when omitted), source? (PLATFORM |
//   OFF_PLATFORM_REPORT, default PLATFORM), ruleId? (explicit commission-rule
//   override — amounts are always recomputed server-side, never from client),
//   notes? }
// Creates the deal when the lead has none open, otherwise closes/updates the
// open deal in place. Mirrors the stage onto the lead, records attribution +
// commission, audits, and notifies broker + developer (fail-soft).
// NOTE: leadId is required (Deal.leadId is NOT NULL); there is no per-deal
// ad-hoc percentage override column — use ruleId (a CommissionRule) instead.

const CLOSE_STATUSES = ['RESERVATION', 'CONTRACT', 'SOLD'] as const
const DEAL_SOURCES = ['PLATFORM', 'OFF_PLATFORM_REPORT'] as const

const DEAL_INCLUDE = {
  lead: {
    select: {
      id: true, leadCode: true, name: true, status: true, brokerId: true,
      developerId: true, projectId: true,
    },
  },
  broker: { select: { id: true, user: { select: { name: true, email: true } } } },
  developer: { select: { id: true, companyName: true } },
  project: { select: { id: true, name: true, slug: true } },
  unit: { select: { id: true, name: true } },
  commissions: true,
} as const

function parseDate(value: unknown, field: string): Date | null | { error: string } {
  if (value === undefined) return null
  if (value === null) return null
  const d = new Date(String(value))
  if (!Number.isFinite(d.getTime())) return { error: `Invalid ${field}` }
  return d
}

export async function POST(req: Request) {
  try {
    const { error, session } = await requireCEOApi()
    if (error) return error
    const actorId = (session!.user as any)?.id as string

    const body = (await req.json().catch(() => null)) as Record<string, any> | null
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
    }

    const leadId = typeof body.leadId === 'string' ? body.leadId.trim() : ''
    if (!leadId) return NextResponse.json({ error: 'leadId required' }, { status: 400 })
    const brokerId = typeof body.brokerId === 'string' ? body.brokerId.trim() : ''
    if (!brokerId) return NextResponse.json({ error: 'brokerId required' }, { status: 400 })
    const dealValue = body.dealValue
    if (typeof dealValue !== 'number' || !Number.isFinite(dealValue) || dealValue <= 0) {
      return NextResponse.json({ error: 'dealValue must be a positive number' }, { status: 400 })
    }
    const status = body.status === undefined || body.status === null ? 'SOLD' : String(body.status)
    if (!(CLOSE_STATUSES as readonly string[]).includes(status)) {
      return NextResponse.json({ error: `Invalid status. Must be one of: ${CLOSE_STATUSES.join(', ')}` }, { status: 400 })
    }
    const source = body.source === undefined || body.source === null ? 'PLATFORM' : String(body.source)
    if (!(DEAL_SOURCES as readonly string[]).includes(source)) {
      return NextResponse.json({ error: `Invalid source. Must be one of: ${DEAL_SOURCES.join(', ')}` }, { status: 400 })
    }
    if (body.notes !== undefined && body.notes !== null && (typeof body.notes !== 'string' || body.notes.length > 4000)) {
      return NextResponse.json({ error: 'Notes too long' }, { status: 400 })
    }
    const reservationDate = parseDate(body.reservationDate, 'reservationDate')
    const contractDate = parseDate(body.contractDate, 'contractDate')
    const saleDate = parseDate(body.saleDate, 'saleDate')
    for (const [v, f] of [[reservationDate, 'reservationDate'], [contractDate, 'contractDate'], [saleDate, 'saleDate']] as const) {
      if (v && typeof v === 'object' && 'error' in (v as object)) {
        return NextResponse.json({ error: (v as { error: string }).error }, { status: 400 })
      }
    }

    const [lead, broker] = await Promise.all([
      db.lead.findUnique({
        where: { id: leadId },
        include: { project: { select: { id: true, developerId: true } } },
      }),
      db.brokerProfile.findUnique({
        where: { id: brokerId },
        select: { id: true, user: { select: { name: true, email: true } } },
      }),
    ])
    if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
    if (!broker) return NextResponse.json({ error: 'Broker not found' }, { status: 404 })

    const projectId = (typeof body.projectId === 'string' && body.projectId.trim())
      || lead.projectId
      || lead.project?.id
      || null
    if (!projectId) {
      return NextResponse.json(
        { error: 'Lead has no project. Pass projectId to close the deal.' },
        { status: 400 }
      )
    }
    const project = await db.project.findUnique({
      where: { id: projectId },
      select: { id: true, developerId: true, name: true },
    })
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

    let unitId: string | null = lead.unitId
    if (body.unitId !== undefined) {
      unitId = typeof body.unitId === 'string' && body.unitId.trim() ? body.unitId.trim() : null
      if (unitId) {
        const unit = await db.unit.findUnique({ where: { id: unitId }, select: { id: true, projectId: true } })
        if (!unit) return NextResponse.json({ error: 'Unit not found' }, { status: 404 })
        if (unit.projectId !== project.id) {
          return NextResponse.json({ error: 'Unit does not belong to the deal project' }, { status: 400 })
        }
      }
    }

    // Explicit commission-rule override (CEO-authorized). Amounts are still
    // computed server-side by syncDealCommission — never from client input.
    let explicitRuleId: string | null = null
    if (body.ruleId !== undefined && body.ruleId !== null) {
      if (typeof body.ruleId !== 'string' || !body.ruleId.trim()) {
        return NextResponse.json({ error: 'Invalid ruleId' }, { status: 400 })
      }
      const rule = await db.commissionRule.findUnique({
        where: { id: body.ruleId.trim() },
        select: { id: true, isActive: true },
      })
      if (!rule || !rule.isActive) {
        return NextResponse.json({ error: 'Commission rule not found or inactive' }, { status: 400 })
      }
      explicitRuleId = rule.id
    }

    const now = new Date()
    const existing = await db.deal.findFirst({
      where: { leadId: lead.id, status: { notIn: ['CANCELLED', 'LOST'] } },
    })

    let deal
    let created = false
    if (existing) {
      // Close/update the open deal in place — attribution moves to the CEO's broker.
      const updateData: Record<string, unknown> = {
        status,
        dealValue,
        brokerId: broker.id,
        unitId,
      }
      if (body.notes !== undefined) updateData.notes = body.notes || null
      if (reservationDate) updateData.reservationDate = reservationDate
      else if (status === 'RESERVATION' && !existing.reservationDate) updateData.reservationDate = now
      if (contractDate) updateData.contractDate = contractDate
      else if (status === 'CONTRACT' && !existing.contractDate) updateData.contractDate = now
      if (saleDate) updateData.saleDate = saleDate
      else if (status === 'SOLD' && !existing.saleDate) updateData.saleDate = now
      const previousBrokerId = existing.brokerId
      deal = await db.deal.update({ where: { id: existing.id }, data: updateData, include: DEAL_INCLUDE })
      await syncDealCommission({
        dealId: deal.id,
        dealValue,
        projectId: project.id,
        developerId: project.developerId,
        explicitRuleId,
      })
      await logAudit({
        userId: actorId,
        action: 'DEAL_CLOSED',
        entity: 'Deal',
        entityId: deal.id,
        changes: { leadId: lead.id, status, dealValue, previousBrokerId, brokerId: broker.id, ruleId: explicitRuleId, via: 'ceo-close' },
      })
    } else {
      deal = await db.deal.create({
        data: {
          leadId: lead.id,
          brokerId: broker.id,
          developerId: project.developerId,
          projectId: project.id,
          unitId,
          status,
          dealValue,
          reservationDate: (reservationDate as Date | null) || (status === 'RESERVATION' ? now : null),
          contractDate: (contractDate as Date | null) || (status === 'CONTRACT' ? now : null),
          saleDate: (saleDate as Date | null) || (status === 'SOLD' ? now : null),
          source,
          reportedById: actorId,
          notes: typeof body.notes === 'string' ? body.notes : null,
        },
        include: DEAL_INCLUDE,
      })
      created = true
      await syncDealCommission({
        dealId: deal.id,
        dealValue,
        projectId: project.id,
        developerId: project.developerId,
        explicitRuleId,
      })
      await logAudit({
        userId: actorId,
        action: 'DEAL_CREATED',
        entity: 'Deal',
        entityId: deal.id,
        changes: { leadId: lead.id, status, dealValue, brokerId: broker.id, ruleId: explicitRuleId, source, via: 'ceo-close' },
      })
    }

    // Mirror the close stage onto the lead so pipeline and deal never diverge.
    const leadUpdate: Record<string, unknown> = { lastActivityAt: now, updatedBy: actorId }
    if (lead.status !== status) {
      leadUpdate.status = status
      if (status === 'SOLD') leadUpdate.convertedAt = now
    }
    await db.lead.update({ where: { id: lead.id }, data: leadUpdate })
    await db.leadActivity.create({
      data: {
        leadId: lead.id,
        type: 'DEAL_CLOSED',
        content: `CEO closed deal as ${status} — attributed to ${broker.user.name || broker.user.email} — value ${dealValue}${explicitRuleId ? ' (explicit commission rule)' : ''}`,
      },
    })

    const commission = await db.commission.findFirst({ where: { dealId: deal.id } })

    // Fail-soft: broker attribution + value, and developer heads-up.
    const brokerName = broker.user.name || 'broker'
    await notifyUser(await brokerUserId(broker.id), {
      type: 'DEAL_CLOSED',
      title: `Deal ${status.toLowerCase()} — attributed to you`,
      message: `Lead ${lead.leadCode || lead.id.slice(0, 8)} closed as ${status} on your record — value ${dealValue}${commission ? `, your commission ${commission.brokerAmount} ${commission.currency}` : ''}.`,
      link: '/dashboard/deals',
      metadata: { dealId: deal.id, leadId: lead.id },
    })
    await notifyUser(await developerUserId(project.developerId), {
      type: 'DEAL_REQUIRING_ACTION',
      title: `Deal ${status.toLowerCase()} reported by administration`,
      message: `${lead.leadCode || lead.id.slice(0, 8)} closed${project.name ? ` on ${project.name}` : ''} — value ${dealValue}.`,
      link: '/dashboard/deals',
      metadata: { dealId: deal.id, leadId: lead.id },
    })
    // Target hit alerts (fail-soft, SOLD only): congrats broker + CEO at 100%.
    try {
      if (status === 'SOLD') {
        const { checkTargetHit } = await import('@/lib/targets')
        await checkTargetHit({ brokerProfileId: broker.id, dealValue, saleDate: deal.saleDate ?? null })
      }
    } catch { /* targets never break deal close */ }

    return NextResponse.json(
      { deal, commission, brokerId: broker.id, created },
      { status: created ? 201 : 200 }
    )
  } catch (err) {
    console.error('CEO close deal error:', err)
    return NextResponse.json({ error: 'Failed to close deal' }, { status: 500 })
  }
}
