import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/permissions'
import { requireCEOApi } from '@/lib/permissions'
import { leadTransferSchema, leadProtectionActionSchema, duplicateResolveSchema } from '@/lib/validations'
import { getProtectionConfig } from '@/lib/lead-protection'
import { notifyUser, notifyRole, brokerUserId } from '@/lib/notify'

export const dynamic = 'force-dynamic'

// ─── POST /api/ceo/leads/actions ──────────────────────────
// CEO/Admin-only ownership & protection operations:
//   TRANSFER | EXTEND | EXPIRE | RESOLVE_DUPLICATE
// Every action writes LeadOwnershipHistory + AuditLog + notifications.
export async function POST(req: Request) {
  try {
    const { error, session } = await requireCEOApi()
    if (error) return error
    const actorId = (session!.user as any).id as string

    const body = await req.json()
    const action = body.action as string

    if (action === 'TRANSFER') {
      const parsed = leadTransferSchema.safeParse(body)
      if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 })
      const { leadId, toBrokerId, reason } = parsed.data

      const [lead, broker] = await Promise.all([
        db.lead.findUnique({ where: { id: leadId } }),
        db.brokerProfile.findUnique({ where: { id: toBrokerId }, select: { id: true, userId: true } }),
      ])
      if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
      if (!broker) return NextResponse.json({ error: 'Broker not found' }, { status: 404 })

      const fromBrokerId = lead.brokerId
      const updated = await db.lead.update({
        where: { id: lead.id },
        data: {
          brokerId: toBrokerId,
          reviewStatus: lead.reviewStatus === 'DUPLICATE_REVIEW' ? 'TRANSFERRED' : lead.reviewStatus,
          updatedBy: actorId,
          lastActivityAt: new Date(),
        },
      })

      await db.leadOwnershipHistory.create({
        data: {
          leadId: lead.id,
          action: 'TRANSFERRED',
          fromBrokerId,
          toBrokerId,
          changedById: actorId,
          reason: reason || null,
          previousExpiresAt: lead.protectionExpiresAt,
          newExpiresAt: lead.protectionExpiresAt,
        },
      })
      await db.leadActivity.create({
        data: {
          leadId: lead.id,
          type: 'LEAD_TRANSFERRED',
          content: `Ownership transferred${fromBrokerId ? '' : ' (was unassigned)'}${reason ? ` — ${reason}` : ''}`,
        },
      })
      await logAudit({
        userId: actorId,
        action: 'LEAD_TRANSFERRED',
        entity: 'Lead',
        entityId: lead.id,
        changes: { from: fromBrokerId, to: toBrokerId, reason: reason || null },
      })

      await notifyUser(broker.userId, {
        type: 'LEAD_ASSIGNED',
        title: `Lead ${lead.leadCode || lead.id.slice(0, 8)} assigned to you`,
        message: reason || 'EstateAI transferred this lead to your account.',
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

      return NextResponse.json({ lead: updated, action: 'TRANSFER' })
    }

    if (action === 'EXTEND' || action === 'EXPIRE' || action === 'RENEW') {
      const parsed = leadProtectionActionSchema.safeParse(body)
      if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 })
      const { leadId, days, reason } = parsed.data

      const lead = await db.lead.findUnique({ where: { id: leadId } })
      if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })

      const config = await getProtectionConfig()
      let newExpires: Date
      let historyAction: string
      let activityType: string

      if (action === 'EXPIRE') {
        newExpires = new Date(Date.now() - 86_400_000)
        historyAction = 'EXPIRED'
        activityType = 'PROTECTION_EXPIRED'
      } else {
        // extend from the current expiry (or now if already lapsed)
        const base = lead.protectionExpiresAt
          ? Math.max(new Date(lead.protectionExpiresAt).getTime(), Date.now())
          : Date.now()
        const addDays = days || (action === 'RENEW' ? config.renewalDays : config.renewalDays)
        newExpires = new Date(base + addDays * 86_400_000)
        historyAction = 'EXTENDED'
        activityType = 'PROTECTION_EXTENDED'
      }

      const updated = await db.lead.update({
        where: { id: lead.id },
        data: {
          protectionExpiresAt: newExpires,
          protectionStartsAt: lead.protectionStartsAt || new Date(),
          updatedBy: actorId,
          lastActivityAt: new Date(),
          jobFlags: '{}',
        },
      })

      await db.leadOwnershipHistory.create({
        data: {
          leadId: lead.id,
          action: historyAction,
          fromBrokerId: lead.brokerId,
          toBrokerId: lead.brokerId,
          changedById: actorId,
          reason: reason || null,
          previousExpiresAt: lead.protectionExpiresAt,
          newExpiresAt: newExpires,
        },
      })
      await db.leadActivity.create({
        data: { leadId: lead.id, type: activityType, content: `Protection now until ${newExpires.toISOString().slice(0, 10)}${reason ? ` — ${reason}` : ''}` },
      })
      await logAudit({
        userId: actorId,
        action: action === 'EXPIRE' ? 'PROTECTION_EXPIRED' : 'PROTECTION_EXTENDED',
        entity: 'Lead',
        entityId: lead.id,
        changes: { previous: lead.protectionExpiresAt, next: newExpires, days: days || null, reason: reason || null },
      })

      await notifyUser(await brokerUserId(lead.brokerId), {
        type: activityType,
        title: `Protection ${action === 'EXPIRE' ? 'expired' : 'extended'} for ${lead.leadCode || lead.id.slice(0, 8)}`,
        message: action === 'EXPIRE'
          ? 'The protection window was closed by EstateAI administration.'
          : `Protection now lasts until ${newExpires.toISOString().slice(0, 10)}.`,
        link: `/dashboard/leads/${lead.id}`,
      })

      return NextResponse.json({ lead: updated, action, protectionExpiresAt: newExpires })
    }

    if (action === 'RESOLVE_DUPLICATE') {
      const parsed = duplicateResolveSchema.safeParse(body)
      if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 })
      const { leadId, resolution, winnerBrokerId, reason } = parsed.data

      const duplicateLead = await db.lead.findUnique({ where: { id: leadId } })
      if (!duplicateLead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
      if (duplicateLead.reviewStatus !== 'DUPLICATE_REVIEW') {
        return NextResponse.json({ error: 'Lead is not in duplicate review' }, { status: 409 })
      }

      const originalId = duplicateLead.duplicateOfId
      const original = originalId ? await db.lead.findUnique({ where: { id: originalId } }) : null
      const now = new Date()

      const winnerBroker = resolution === 'CHALLENGER_WINS'
        ? (winnerBrokerId || duplicateLead.brokerId)
        : (original?.brokerId || duplicateLead.brokerId)
      const winnerLead = resolution === 'CHALLENGER_WINS' ? duplicateLead : (original || duplicateLead)
      const loserLead = winnerLead.id === duplicateLead.id ? original : duplicateLead

      // Winner keeps/gets ownership + protection anchored to the earliest registration
      const anchorDate = original ? new Date(original.createdAt) : new Date(duplicateLead.createdAt)
      const cfg = await getProtectionConfig()
      const protDays = original?.protectionDays || duplicateLead.protectionDays || cfg.defaultDays

      await db.lead.update({
        where: { id: winnerLead.id },
        data: {
          brokerId: winnerBroker,
          reviewStatus: 'ACTIVE',
          duplicateOfId: null,
          resolvedById: actorId,
          resolvedAt: now,
          resolutionNote: reason || `Duplicate resolved: ${resolution}`,
          protectionStartsAt: anchorDate,
          protectionExpiresAt: new Date(anchorDate.getTime() + protDays * 86_400_000),
          protectionDays: protDays,
          updatedBy: actorId,
          lastActivityAt: now,
        },
      })

      if (loserLead) {
        await db.lead.update({
          where: { id: loserLead.id },
          data: {
            reviewStatus: 'TRANSFERRED',
            duplicateOfId: winnerLead.id,
            resolvedById: actorId,
            resolvedAt: now,
            resolutionNote: reason || `Merged into ${winnerLead.leadCode || 'winning lead'}`,
            updatedBy: actorId,
            lastActivityAt: now,
          },
        })
      }

      await db.leadOwnershipHistory.create({
        data: {
          leadId: winnerLead.id,
          action: 'DUPLICATE_RESOLVED',
          fromBrokerId: original?.brokerId ?? null,
          toBrokerId: winnerBroker,
          changedById: actorId,
          reason: reason || resolution,
          previousExpiresAt: original?.protectionExpiresAt ?? null,
          newExpiresAt: new Date(anchorDate.getTime() + protDays * 86_400_000),
        },
      })
      await db.leadActivity.create({
        data: {
          leadId: winnerLead.id,
          type: 'DUPLICATE_RESOLVED',
          content: `${resolution} — winner keeps lead, protection anchored to ${anchorDate.toISOString().slice(0, 10)}`,
        },
      })
      await logAudit({
        userId: actorId,
        action: 'DUPLICATE_RESOLVED',
        entity: 'Lead',
        entityId: winnerLead.id,
        changes: {
          resolution,
          winnerBrokerId: winnerBroker,
          loserLeadId: loserLead?.id ?? null,
          reason: reason || null,
        },
      })

      await notifyUser(await brokerUserId(winnerBroker), {
        type: 'DUPLICATE_RESOLVED',
        title: `Ownership confirmed for ${winnerLead.leadCode || winnerLead.id.slice(0, 8)}`,
        message: 'EstateAI confirmed your ownership of this client. Protection is active.',
        link: `/dashboard/leads/${winnerLead.id}`,
      })
      const loserBrokerId = loserLead
        ? (loserLead.id === duplicateLead.id ? duplicateLead.brokerId : original?.brokerId)
        : null
      const loserUser = await brokerUserId(loserBrokerId)
      if (loserUser && loserUser !== (await brokerUserId(winnerBroker))) {
        await notifyUser(loserUser, {
          type: 'DUPLICATE_RESOLVED',
          title: `Review closed for ${loserLead?.leadCode || ''}`,
          message: 'EstateAI resolved this ownership case. See lead details for the decision.',
          link: `/dashboard/leads/${loserLead?.id ?? winnerLead.id}`,
        })
      }
      await notifyRole(['CEO', 'ADMIN'], {
        type: 'DUPLICATE_RESOLVED',
        title: 'Duplicate case resolved',
        message: `${resolution} — ${winnerLead.leadCode || winnerLead.id.slice(0, 8)} wins.`,
        link: `/ceo/leads/${winnerLead.id}`,
      })

      return NextResponse.json({ action: 'RESOLVE_DUPLICATE', winnerLeadId: winnerLead.id, loserLeadId: loserLead?.id ?? null })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (err) {
    console.error('CEO lead action error:', err)
    return NextResponse.json({ error: 'Action failed' }, { status: 500 })
  }
}
