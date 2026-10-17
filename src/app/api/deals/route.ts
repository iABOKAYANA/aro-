import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/permissions'
import { dealCreateSchema } from '@/lib/validations'
import { requireActor, leadScopeWhere, leadAccessLevel } from '@/lib/lead-access'
import { syncDealCommission } from '@/lib/commission'
import { canBrokerAccess } from '@/lib/partnerships'
import { notifyUser, notifyRole, brokerUserId, developerUserId } from '@/lib/notify'

export const dynamic = 'force-dynamic'

const DEAL_INCLUDE = {
  lead: {
    select: {
      id: true, leadCode: true, name: true, status: true, brokerId: true,
      developerId: true, projectId: true, protectionExpiresAt: true,
    },
  },
  broker: { select: { id: true, user: { select: { name: true, email: true } } } },
  developer: { select: { id: true, companyName: true } },
  project: { select: { id: true, name: true, slug: true } },
  unit: { select: { id: true, name: true } },
  commissions: true,
} as const

// ─── GET /api/deals — scoped deal list ────────────────────
// CEO → all, DEVELOPER → own org, BROKER → own attribution
export async function GET(req: Request) {
  try {
    const actor = await requireActor(['BROKER', 'DEVELOPER', 'CEO', 'ADMIN'])
    if (!actor.ok) return actor.response
    const { ctx } = actor

    const { searchParams } = new URL(req.url)
    const status = searchParams.get('status')
    const search = searchParams.get('search')
    const projectId = searchParams.get('projectId')

    const scope: Record<string, unknown> = {}
    if (ctx.role === 'BROKER') {
      if (!ctx.brokerId) return NextResponse.json({ deals: [] })
      scope.brokerId = ctx.brokerId
    } else if (ctx.role === 'DEVELOPER') {
      if (!ctx.developerId) return NextResponse.json({ deals: [] })
      scope.developerId = ctx.developerId
    }
    if (status) scope.status = status
    if (projectId) scope.projectId = projectId
    if (search) {
      scope.OR = [
        { lead: { name: { contains: search } } },
        { lead: { leadCode: { contains: search } } },
        { project: { name: { contains: search } } },
      ]
    }

    const deals = await db.deal.findMany({
      where: scope,
      include: DEAL_INCLUDE,
      orderBy: { createdAt: 'desc' },
      take: 200,
    })

    // Brokers see their own commission figures; developers see totals
    const decorated = deals.map((deal) => {
      const commission = deal.commissions[0] || null
      return {
        ...deal,
        commission:
          commission && ctx.role === 'BROKER'
            ? {
                id: commission.id,
                status: commission.status,
                totalPct: commission.totalPct,
                brokerPct: commission.brokerPct,
                brokerAmount: commission.brokerAmount,
                totalAmount: commission.totalAmount,
                dueDate: commission.dueDate,
                paidDate: commission.paidDate,
                currency: commission.currency,
              }
            : commission,
      }
    })

    return NextResponse.json({ deals: decorated })
  } catch (error) {
    console.error('Fetch deals error:', error)
    return NextResponse.json({ error: 'Failed to fetch deals' }, { status: 500 })
  }
}

// ─── POST /api/deals — create/link a deal to a lead ───────
// CEO/ADMIN always; DEVELOPER for their own org (partnership-checked).
export async function POST(req: Request) {
  try {
    const actor = await requireActor(['CEO', 'ADMIN', 'DEVELOPER'])
    if (!actor.ok) return actor.response
    const { ctx } = actor

    const body = await req.json()
    const parsed = dealCreateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Invalid input' },
        { status: 400 }
      )
    }
    const input = parsed.data

    const lead = await db.lead.findUnique({
      where: { id: input.leadId },
      include: { project: { select: { id: true, developerId: true } } },
    })
    if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })

    // Developer can only attach deals to their own organization's leads
    if (ctx.role === 'DEVELOPER') {
      const level = leadAccessLevel(ctx, {
        brokerId: lead.brokerId,
        developerId: lead.developerId,
        projectDeveloperId: lead.project?.developerId ?? null,
      })
      if (level === 'none') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const projectId = input.projectId || lead.projectId || lead.project?.id
    if (!projectId) {
      return NextResponse.json(
        { error: 'Lead has no project. Link the lead to a project before recording the deal.' },
        { status: 400 }
      )
    }
    const project = await db.project.findUnique({
      where: { id: projectId },
      select: { id: true, developerId: true },
    })
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    if (ctx.role === 'DEVELOPER' && project.developerId !== ctx.developerId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Broker attribution: from the protected lead, never from client input
    const attributedBroker = lead.brokerId

    // Off-platform reports still require partnership access when a broker is involved
    if (input.source === 'OFF_PLATFORM_REPORT' && attributedBroker) {
      const access = await canBrokerAccess({
        brokerId: attributedBroker,
        developerId: project.developerId,
        projectId: project.id,
      })
      if (!access.allowed) {
        return NextResponse.json({ error: access.reason || 'Access denied' }, { status: 403 })
      }
    }

    // A lead can only carry one open deal at a time. The check and the
    // create run inside one Prisma transaction so a double-submit cannot
    // slip two active deals through the check-then-create gap.
    // RESIDUAL RACE NOTE: two fully concurrent transactions can still both
    // pass the findFirst before either commits (read-committed snapshot) —
    // closing that micro-window needs a partial-unique DB index on open
    // deals per lead (deferred schema change, not applied here).
    const now = new Date()
    let duplicateDeal = false
    const deal = await db.$transaction(async (tx) => {
      const existing = await tx.deal.findFirst({
        where: { leadId: lead.id, status: { notIn: ['CANCELLED', 'LOST'] } },
      })
      if (existing) {
        duplicateDeal = true
        return null
      }
      return tx.deal.create({
        data: {
          leadId: lead.id,
          brokerId: attributedBroker,
          developerId: project.developerId,
          projectId: project.id,
          unitId: input.unitId || lead.unitId,
          status: input.status,
          dealValue: input.dealValue ?? null,
          reservationDate: input.reservationDate ? new Date(input.reservationDate) : input.status === 'RESERVATION' ? now : null,
          contractDate: input.contractDate ? new Date(input.contractDate) : input.status === 'CONTRACT' ? now : null,
          saleDate: input.saleDate ? new Date(input.saleDate) : input.status === 'SOLD' ? now : null,
          source: input.source,
          reportedById: ctx.userId,
          notes: input.notes || null,
        },
        include: DEAL_INCLUDE,
      })
    })
    if (duplicateDeal || !deal) {
      return NextResponse.json(
        { error: 'This lead already has an active deal. Update it instead.' },
        { status: 409 }
      )
    }

    // Sync the lead lifecycle + protection with the deal stage
    if (input.status === 'RESERVATION' && lead.status !== 'RESERVATION' && lead.status !== 'SOLD') {
      await db.lead.update({
        where: { id: lead.id },
        data: { status: 'RESERVATION', lastActivityAt: now, updatedBy: ctx.userId },
      })
      await db.leadActivity.create({
        data: { leadId: lead.id, type: 'STATUS_CHANGED', content: `→ RESERVATION (deal created)` },
      })
    } else {
      await db.lead.update({ where: { id: lead.id }, data: { lastActivityAt: now, updatedBy: ctx.userId } })
    }

    if (input.dealValue && input.dealValue > 0) {
      await syncDealCommission({
        dealId: deal.id,
        dealValue: input.dealValue,
        projectId: project.id,
        developerId: project.developerId,
      })
    }

    await logAudit({
      userId: ctx.userId,
      action: 'DEAL_CREATED',
      entity: 'Deal',
      entityId: deal.id,
      changes: { leadId: lead.id, status: input.status, dealValue: input.dealValue ?? null, source: input.source },
    })

    const dealLabel = input.status.toLowerCase()
    await notifyUser(await brokerUserId(attributedBroker), {
      type: 'DEAL_UPDATED',
      title: `Deal ${dealLabel} recorded`,
      message: `Lead ${lead.leadCode || lead.id.slice(0, 8)} — ${dealLabel} registered on EstateAI.`,
      link: '/dashboard/deals',
      metadata: { dealId: deal.id },
    })
    await notifyUser(await developerUserId(project.developerId), {
      type: 'DEAL_REQUIRING_ACTION',
      title: `New deal ${dealLabel}`,
      message: `${dealLabel} on ${deal.project ? 'project' : 'lead'} ${lead.leadCode || ''}.`,
      link: '/dashboard/deals',
      metadata: { dealId: deal.id },
    })
    await notifyRole(['CEO', 'ADMIN'], {
      type: 'DEAL_UPDATED',
      title: `DEAL ${input.status} recorded`,
      message: `${lead.leadCode || lead.id.slice(0, 8)} — value ${input.dealValue ?? 'TBD'}.`,
      link: '/ceo/deals',
      metadata: { dealId: deal.id },
    })

    return NextResponse.json({ deal }, { status: 201 })
  } catch (error) {
    console.error('Create deal error:', error)
    return NextResponse.json({ error: 'Failed to create deal' }, { status: 500 })
  }
}
