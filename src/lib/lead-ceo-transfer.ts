import { db } from '@/lib/db'
import { logAudit } from '@/lib/permissions'
import { notifyUser, brokerUserId } from '@/lib/notify'

// ─── CEO lead transfer — single shared implementation ────
// Mirrors the TRANSFER branch of POST /api/ceo/leads/actions field-for-field
// (broker-exists 404, brokerId swap, DUPLICATE_REVIEW → TRANSFERRED flip,
// LeadOwnershipHistory TRANSFERRED, LeadActivity LEAD_TRANSFERRED,
// AuditLog LEAD_TRANSFERRED, fail-soft notifies to new + previous broker).
// The bulk endpoint reuses this helper so assign never drifts from the
// single-assign path.
export async function transferLeadOwnership(params: {
  leadId: string
  toBrokerId: string
  actorId: string
  reason?: string | null
}) {
  const [lead, broker] = await Promise.all([
    db.lead.findUnique({ where: { id: params.leadId } }),
    db.brokerProfile.findUnique({ where: { id: params.toBrokerId }, select: { id: true, userId: true } }),
  ])
  if (!lead) throw new Error('Lead not found')
  if (!broker) throw new Error('Broker not found')

  const fromBrokerId = lead.brokerId
  const updated = await db.lead.update({
    where: { id: lead.id },
    data: {
      brokerId: params.toBrokerId,
      reviewStatus: lead.reviewStatus === 'DUPLICATE_REVIEW' ? 'TRANSFERRED' : lead.reviewStatus,
      updatedBy: params.actorId,
      lastActivityAt: new Date(),
    },
  })

  await db.leadOwnershipHistory.create({
    data: {
      leadId: lead.id,
      action: 'TRANSFERRED',
      fromBrokerId,
      toBrokerId: params.toBrokerId,
      changedById: params.actorId,
      reason: params.reason || null,
      previousExpiresAt: lead.protectionExpiresAt,
      newExpiresAt: lead.protectionExpiresAt,
    },
  })
  await db.leadActivity.create({
    data: {
      leadId: lead.id,
      type: 'LEAD_TRANSFERRED',
      content: `Ownership transferred${fromBrokerId ? '' : ' (was unassigned)'}${params.reason ? ` — ${params.reason}` : ''}`,
    },
  })
  await logAudit({
    userId: params.actorId,
    action: 'LEAD_TRANSFERRED',
    entity: 'Lead',
    entityId: lead.id,
    changes: { from: fromBrokerId, to: params.toBrokerId, reason: params.reason || null },
  })

  try {
    await notifyUser(broker.userId, {
      type: 'LEAD_ASSIGNED',
      title: `Lead ${lead.leadCode || lead.id.slice(0, 8)} assigned to you`,
      message: params.reason || 'EstateAI transferred this lead to your account.',
      link: `/dashboard/leads/${lead.id}`,
    })
    const prevUser = await brokerUserId(fromBrokerId)
    if (prevUser && prevUser !== broker.userId) {
      await notifyUser(prevUser, {
        type: 'LEAD_TRANSFERRED',
        title: `Lead ${lead.leadCode || lead.id.slice(0, 8)} transferred`,
        message: 'Ownership was transferred by EstateAI administration.',
        link: `/dashboard/leads/${lead.id}`,
      })
    }
  } catch (e) {
    console.error('[transfer] notify failed:', e)
  }

  return updated
}
