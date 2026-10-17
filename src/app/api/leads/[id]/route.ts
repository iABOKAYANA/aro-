import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/permissions'
import { leadSchema, leadStatusUpdateSchema } from '@/lib/validations'
import { requireActor, leadAccessLevel } from '@/lib/lead-access'
import { getProtectionConfig, getProtectionStatus } from '@/lib/lead-protection'
import { applyStatusTransition } from '@/lib/lead-lifecycle'
import { notifyUser, notifyRole, brokerUserId, developerUserId } from '@/lib/notify'

export const dynamic = 'force-dynamic'

type Params = { params: { id: string } }

async function loadLead(id: string) {
  return db.lead.findUnique({
    where: { id },
    include: {
      broker: { select: { id: true, user: { select: { id: true, name: true, email: true } } } },
      project: { select: { id: true, name: true, slug: true, developerId: true } },
      unit: { select: { id: true, name: true, price: true } },
      developer: { select: { id: true, companyName: true } },
      activities: { orderBy: { createdAt: 'desc' }, take: 30 },
      ownershipHistory: {
        orderBy: { createdAt: 'desc' },
        take: 20,
        include: {
          fromBroker: { select: { id: true, user: { select: { name: true } } } },
          toBroker: { select: { id: true, user: { select: { name: true } } } },
        },
      },
      deals: {
        include: { commissions: true, project: { select: { name: true } }, unit: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
      },
      viewings: { orderBy: { scheduledAt: 'desc' }, take: 5 },
    },
  })
}

// ─── GET /api/leads/[id] — detail (scoped) ────────────────
export async function GET(_req: Request, { params }: Params) {
  try {
    const actor = await requireActor()
    if (!actor.ok) return actor.response
    const { ctx } = actor

    const lead = await loadLead(params.id)
    if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })

    const level = leadAccessLevel(ctx, {
      brokerId: lead.brokerId,
      developerId: lead.developerId,
      projectDeveloperId: lead.project?.developerId ?? null,
    })
    if (level === 'none') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const config = await getProtectionConfig()
    let payload: Record<string, unknown> = {
      ...lead,
      protectionStatus: getProtectionStatus(lead, config),
      accessLevel: level,
    }

    // Developers must not receive raw client phone/email
    if (level === 'masked') {
      payload = {
        ...payload,
        phone: `${lead.phone.slice(0, 4)}•••••${lead.phone.slice(-3)}`,
        email: lead.email ? `${lead.email.slice(0, 2)}•••@${lead.email.split('@')[1] || ''}` : null,
        normalizedPhone: undefined,
        normalizedEmail: undefined,
      }
    }

    return NextResponse.json({ lead: payload })
  } catch (error) {
    console.error('Fetch lead error:', error)
    return NextResponse.json({ error: 'Failed to fetch lead' }, { status: 500 })
  }
}

// ─── PATCH /api/leads/[id] — update / lifecycle ───────────
export async function PATCH(req: Request, { params }: Params) {
  try {
    const actor = await requireActor()
    if (!actor.ok) return actor.response
    const { ctx } = actor

    const lead = await db.lead.findUnique({
      where: { id: params.id },
      include: { project: { select: { developerId: true } } },
    })
    if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })

    const level = leadAccessLevel(ctx, {
      brokerId: lead.brokerId,
      developerId: lead.developerId,
      projectDeveloperId: lead.project?.developerId ?? null,
    })
    if (level === 'none') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await req.json()

    // Status transitions go through the state machine
    if (body.status !== undefined) {
      if (level !== 'full') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      const parsedStatus = leadStatusUpdateSchema.safeParse({ status: body.status, notes: body.notes, dealValue: body.dealValue })
      if (!parsedStatus.success) {
        return NextResponse.json({ error: parsedStatus.error.issues[0]?.message || 'Invalid status' }, { status: 400 })
      }
      const result = await applyStatusTransition({
        leadId: lead.id,
        to: parsedStatus.data.status,
        actorId: ctx.userId,
        actorRole: ctx.role,
        dealValue: parsedStatus.data.dealValue ?? null,
        notes: parsedStatus.data.notes ?? null,
      })
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 })

      await logAudit({
        userId: ctx.userId,
        action: 'STATUS_CHANGED',
        entity: 'Lead',
        entityId: lead.id,
        changes: { from: lead.status, to: parsedStatus.data.status },
      })

      const dealLabel: Record<string, string> = { RESERVATION: 'reservation', CONTRACT: 'contract', SOLD: 'sale' }
      if (dealLabel[parsedStatus.data.status]) {
        const bUser = await brokerUserId(lead.brokerId)
        await notifyUser(bUser, {
          type: 'DEAL_UPDATED',
          title: `Lead ${lead.leadCode || lead.id.slice(0, 8)} → ${dealLabel[parsedStatus.data.status]}`,
          message: `Status updated to ${parsedStatus.data.status}.`,
          link: '/dashboard/deals',
        })
        if (lead.project) {
          await notifyUser(await developerUserId(lead.project.developerId), {
            type: 'DEAL_REQUIRING_ACTION',
            title: `New ${dealLabel[parsedStatus.data.status]}`,
            message: `Lead ${lead.leadCode || ''} moved to ${parsedStatus.data.status}.`,
            link: '/dashboard/deals',
          })
        }
        await notifyRole(['CEO', 'ADMIN'], {
          type: 'DEAL_UPDATED',
          title: `${dealLabel[parsedStatus.data.status].toUpperCase()} recorded`,
          message: `Lead ${lead.leadCode || ''} is now ${parsedStatus.data.status}.`,
          link: '/ceo/deals',
        })
      }
    }

    // Field updates — brokers may edit their own lead; developers may only add internal notes
    const updateData: Record<string, unknown> = { updatedBy: ctx.userId, lastActivityAt: new Date() }
    const editableByBroker = ['notes', 'budgetMin', 'budgetMax', 'nextFollowUp', 'tags', 'preferredAreas', 'name', 'email', 'phone', 'score', 'lostReason']
    const editableByDev = ['notes']

    const allowed = ctx.isCEO ? editableByBroker : ctx.role === 'DEVELOPER' ? editableByDev : editableByBroker
    let touched = false
    for (const key of allowed) {
      if (body[key] !== undefined) {
        if (['tags', 'preferredAreas'].includes(key) && Array.isArray(body[key])) {
          updateData[key] = JSON.stringify(body[key])
        } else if (key === 'nextFollowUp') {
          updateData[key] = body[key] ? new Date(body[key]) : null
        } else {
          updateData[key] = body[key]
        }
        touched = true
      }
    }
    if (body.nextFollowUp === null && allowed.includes('nextFollowUp')) {
      updateData.nextFollowUp = null
      touched = true
    }

    if (!touched && body.status === undefined) {
      return NextResponse.json({ error: 'No updatable fields' }, { status: 400 })
    }

    const updated = await db.lead.update({ where: { id: lead.id }, data: updateData })
    return NextResponse.json({ lead: updated })
  } catch (error) {
    console.error('Update lead error:', error)
    return NextResponse.json({ error: 'Failed to update lead' }, { status: 500 })
  }
}

// ─── DELETE /api/leads/[id] — owner broker or CEO only ────
export async function DELETE(_req: Request, { params }: Params) {
  try {
    const actor = await requireActor()
    if (!actor.ok) return actor.response
    const { ctx } = actor

    const lead = await db.lead.findUnique({
      where: { id: params.id },
      include: { project: { select: { developerId: true } } },
    })
    if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })

    const level = leadAccessLevel(ctx, {
      brokerId: lead.brokerId,
      developerId: lead.developerId,
      projectDeveloperId: lead.project?.developerId ?? null,
    })
    if (level === 'none') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    // Masked (developer) callers may read notes but must never delete.
    if (level !== 'full') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    // Deleting a lead that already has deals would break attribution → refuse
    const dealCount = await db.deal.count({ where: { leadId: lead.id } })
    if (dealCount > 0) {
      return NextResponse.json(
        { error: 'This lead has linked deals. Close the deals first or contact an administrator.' },
        { status: 409 }
      )
    }

    await db.lead.delete({ where: { id: lead.id } })
    await logAudit({
      userId: ctx.userId,
      action: 'LEAD_DELETED',
      entity: 'Lead',
      entityId: params.id,
      changes: { leadCode: lead.leadCode, brokerId: lead.brokerId },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Delete lead error:', error)
    return NextResponse.json({ error: 'Failed to delete lead' }, { status: 500 })
  }
}
