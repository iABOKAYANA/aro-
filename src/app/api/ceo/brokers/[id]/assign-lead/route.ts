import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireCEOApi, logAudit } from '@/lib/permissions'
import { notifyUser, brokerUserId } from '@/lib/notify'

export const dynamic = 'force-dynamic'

// ─── POST /api/ceo/brokers/[id]/assign-lead ──────────────
// Body: { leadId } or { leadIds: string[] }. Moves ownership of one or more
// leads onto this broker and records the transfer in LeadOwnershipHistory.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const { error, session } = await requireCEOApi()
    if (error) return error
    const actorId = (session!.user as any)?.id as string

    const broker = await db.brokerProfile.findUnique({
      where: { id: params.id },
      include: { user: { select: { name: true, email: true } } },
    })
    if (!broker) {
      return NextResponse.json({ error: 'Broker not found' }, { status: 404 })
    }

    const body = await req.json().catch(() => ({}) as Record<string, unknown>)
    const single = typeof body.leadId === 'string' ? body.leadId.trim() : ''
    const bulk = Array.isArray(body.leadIds) ? body.leadIds : []
    const leadIds = [...new Set([single, ...bulk.map((v: unknown) => String(v))].filter(Boolean))]

    if (leadIds.length === 0) {
      return NextResponse.json({ error: 'Select at least one lead to assign' }, { status: 400 })
    }

    const leads = await db.lead.findMany({ where: { id: { in: leadIds } } })
    if (leads.length === 0) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
    }

    let assigned = 0
    const alreadyOwned: string[] = []

    for (const lead of leads) {
      if (lead.brokerId === broker.id) {
        alreadyOwned.push(lead.leadCode || lead.id)
        continue
      }

      await db.$transaction([
        db.lead.update({
          where: { id: lead.id },
          data: {
            brokerId: broker.id,
            updatedBy: actorId,
            lastActivityAt: new Date(),
          },
        }),
        db.leadOwnershipHistory.create({
          data: {
            leadId: lead.id,
            action: lead.brokerId ? 'TRANSFERRED' : 'ASSIGNED',
            fromBrokerId: lead.brokerId,
            toBrokerId: broker.id,
            changedById: actorId,
            reason: 'Assigned by CEO',
            previousExpiresAt: lead.protectionExpiresAt,
            newExpiresAt: lead.protectionExpiresAt,
          },
        }),
        db.leadActivity.create({
          data: {
            leadId: lead.id,
            type: 'ASSIGNED',
            content: `Assigned to ${broker.user.name || 'broker'} by CEO`,
          },
        }),
      ])
      assigned += 1
    }

    await logAudit({
      action: 'LEADS_ASSIGNED_TO_BROKER',
      entity: 'Lead',
      entityId: leads[0].id,
      userId: actorId,
      changes: {
        brokerId: broker.id,
        brokerEmail: broker.user.email,
        leadIds: leads.map((l) => l.id),
        assigned,
        alreadyOwned: alreadyOwned.length,
      },
    })

    // Fail-soft: the broker must hear about new ownership (matches the
    // LEAD_ASSIGNED contract used by the transfer flow).
    if (assigned > 0) {
      await notifyUser(await brokerUserId(broker.id), {
        type: 'LEAD_ASSIGNED',
        title: assigned === 1 ? 'Lead assigned to you' : `${assigned} leads assigned to you`,
        message: `EstateAI administration assigned ${assigned === 1 ? 'a lead' : `${assigned} leads`} to your account.`,
        link: '/dashboard/leads',
        metadata: { leadIds: leads.map((l) => l.id), assigned },
      })
    }

    return NextResponse.json({
      success: true,
      assigned,
      alreadyOwned,
      broker: { id: broker.id, name: broker.user.name },
    })
  } catch (err) {
    console.error('Assign lead error:', err)
    return NextResponse.json({ error: 'Failed to assign lead' }, { status: 500 })
  }
}
