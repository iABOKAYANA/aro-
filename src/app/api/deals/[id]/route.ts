import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/permissions'
import { dealUpdateSchema } from '@/lib/validations'
import { requireActor, leadAccessLevel } from '@/lib/lead-access'
import { syncDealCommission } from '@/lib/commission'
import { notifyUser, notifyRole, brokerUserId } from '@/lib/notify'

export const dynamic = 'force-dynamic'

type Params = { params: { id: string } }

const DEAL_INCLUDE = {
  lead: { select: { id: true, leadCode: true, name: true, status: true, brokerId: true, developerId: true, projectId: true } },
  broker: { select: { id: true, user: { select: { name: true, email: true } } } },
  developer: { select: { id: true, companyName: true } },
  project: { select: { id: true, name: true, slug: true } },
  unit: { select: { id: true, name: true } },
  commissions: true,
} as const

async function loadDeal(id: string) {
  return db.deal.findUnique({
    where: { id },
    include: { ...DEAL_INCLUDE, lead: { include: { project: { select: { developerId: true } } } } },
  })
}

// ─── GET /api/deals/[id] ──────────────────────────────────
export async function GET(_req: Request, { params }: Params) {
  try {
    const actor = await requireActor(['BROKER', 'DEVELOPER', 'CEO', 'ADMIN'])
    if (!actor.ok) return actor.response
    const { ctx } = actor

    const deal = await db.deal.findUnique({ where: { id: params.id }, include: DEAL_INCLUDE })
    if (!deal) return NextResponse.json({ error: 'Deal not found' }, { status: 404 })

    if (ctx.role === 'BROKER' && deal.brokerId !== ctx.brokerId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    if (ctx.role === 'DEVELOPER' && deal.developerId !== ctx.developerId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const commission = deal.commissions[0] || null
    return NextResponse.json({
      deal: {
        ...deal,
        commission:
          commission && ctx.role === 'BROKER'
            ? {
                id: commission.id,
                status: commission.status,
                totalPct: commission.totalPct,
                brokerPct: commission.brokerPct,
                brokerAmount: commission.brokerAmount,
                dueDate: commission.dueDate,
                paidDate: commission.paidDate,
              }
            : commission,
      },
    })
  } catch (error) {
    console.error('Fetch deal error:', error)
    return NextResponse.json({ error: 'Failed to fetch deal' }, { status: 500 })
  }
}

// ─── PATCH /api/deals/[id] — update stage / record sale ───
export async function PATCH(req: Request, { params }: Params) {
  try {
    const actor = await requireActor(['CEO', 'ADMIN', 'DEVELOPER'])
    if (!actor.ok) return actor.response
    const { ctx } = actor

    const deal = await loadDeal(params.id)
    if (!deal) return NextResponse.json({ error: 'Deal not found' }, { status: 404 })

    if (ctx.role === 'DEVELOPER') {
      const level = leadAccessLevel(ctx, {
        brokerId: deal.lead.brokerId,
        developerId: deal.lead.developerId,
        projectDeveloperId: deal.developerId,
      })
      if (level === 'none') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await req.json()
    const parsed = dealUpdateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid input' }, { status: 400 })
    }
    const input = parsed.data

    const STAGES = ['RESERVATION', 'CONTRACT', 'SOLD', 'CANCELLED', 'LOST']
    if (input.status && !STAGES.includes(input.status)) {
      return NextResponse.json({ error: 'Invalid deal status' }, { status: 400 })
    }

    // Deal stage machine (server-enforced, uniform for every role — the
    // codebase grants no CEO override for state transitions elsewhere, e.g.
    // lead transitions go through applyStatusTransition for CEO too):
    // RESERVATION → CONTRACT / CANCELLED / LOST
    // CONTRACT → SOLD / CANCELLED
    // SOLD, CANCELLED, LOST are terminal (no resurrection, no stage skips).
    const DEAL_TRANSITIONS: Record<string, string[]> = {
      RESERVATION: ['CONTRACT', 'CANCELLED', 'LOST'],
      CONTRACT: ['SOLD', 'CANCELLED'],
      SOLD: [],
      CANCELLED: [],
      LOST: [],
    }
    if (input.status && input.status !== deal.status) {
      const allowed = DEAL_TRANSITIONS[deal.status] ?? []
      if (!allowed.includes(input.status)) {
        return NextResponse.json(
          { error: `Cannot move deal from ${deal.status} to ${input.status}` },
          { status: 409 }
        )
      }
    }

    const now = new Date()
    const updateData: Record<string, unknown> = {}
    if (input.status !== undefined) updateData.status = input.status
    if (input.dealValue !== undefined) updateData.dealValue = input.dealValue
    if (input.notes !== undefined) updateData.notes = input.notes
    if (input.reservationDate !== undefined) updateData.reservationDate = input.reservationDate ? new Date(input.reservationDate) : null
    if (input.contractDate !== undefined) updateData.contractDate = input.contractDate ? new Date(input.contractDate) : null
    if (input.saleDate !== undefined) updateData.saleDate = input.saleDate ? new Date(input.saleDate) : null

    const stageChanged = input.status && input.status !== deal.status
    if (stageChanged) {
      if (input.status === 'SOLD' && !updateData.saleDate) updateData.saleDate = now
      if (input.status === 'CONTRACT' && !updateData.contractDate) updateData.contractDate = now
      if (input.status === 'RESERVATION' && !updateData.reservationDate) updateData.reservationDate = now
    }

    const updated = await db.deal.update({ where: { id: deal.id }, data: updateData, include: DEAL_INCLUDE })

    // Commission re-sync (server-side math; ignored once status left PENDING).
    // Explicit ruleId is CEO/Admin-only: stripped for non-privileged callers
    // so a DEVELOPER can never dictate commission math (defense in depth —
    // resolveCommissionRule additionally ignores explicitRuleId without
    // allowExplicitRule).
    const newValue = input.dealValue ?? deal.dealValue
    if (newValue && newValue > 0) {
      const canSetRule = ctx.role === 'CEO' || ctx.role === 'ADMIN'
      await syncDealCommission({
        dealId: deal.id,
        dealValue: newValue,
        projectId: deal.projectId,
        developerId: deal.developerId,
        explicitRuleId: canSetRule ? (input.ruleId ?? null) : null,
        allowExplicitRule: canSetRule,
      })
    }

    // Mirror the stage on the lead so the pipeline never diverges
    if (stageChanged) {
      const leadStatusMap: Record<string, string> = {
        RESERVATION: 'RESERVATION',
        CONTRACT: 'CONTRACT',
        SOLD: 'SOLD',
        CANCELLED: deal.lead.status === 'RESERVATION' ? 'CANCELLED' : deal.lead.status,
        LOST: 'LOST',
      }
      const targetLeadStatus = leadStatusMap[input.status!]
      if (targetLeadStatus && targetLeadStatus !== deal.lead.status) {
        await db.lead.update({
          where: { id: deal.leadId },
          data: { status: targetLeadStatus, lastActivityAt: now, updatedBy: ctx.userId },
        })
        await db.leadActivity.create({
          data: { leadId: deal.leadId, type: 'STATUS_CHANGED', content: `Deal ${deal.status} → ${input.status}` },
        })
      }
      await notifyRole(['CEO', 'ADMIN'], {
        type: 'DEAL_UPDATED',
        title: `Deal ${input.status}`,
        message: `${deal.lead.leadCode || deal.leadId.slice(0, 8)} moved to ${input.status}.`,
        link: '/ceo/deals',
      })
      await notifyUser(await brokerUserId(deal.brokerId), {
        type: 'DEAL_UPDATED',
        title: `Deal ${input.status}`,
        message: `Your deal is now ${input.status}.`,
        link: '/dashboard/deals',
      })
    }

    await logAudit({
      userId: ctx.userId,
      action: 'DEAL_UPDATED',
      entity: 'Deal',
      entityId: deal.id,
      changes: { ...input, previousStatus: deal.status },
    })

    return NextResponse.json({ deal: updated })
  } catch (error) {
    console.error('Update deal error:', error)
    return NextResponse.json({ error: 'Failed to update deal' }, { status: 500 })
  }
}
