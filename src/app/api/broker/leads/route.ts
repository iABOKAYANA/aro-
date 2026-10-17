import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { currentPortalUser } from '@/lib/portal'
import { applyStatusTransition } from '@/lib/lead-lifecycle'
import { logAudit } from '@/lib/permissions'

export const dynamic = 'force-dynamic'

const STATUSES = [
  'NEW', 'CONTACTED', 'QUALIFIED', 'VIEWING', 'NEGOTIATION', 'CONVERTED', 'LOST',
] as const

async function myBrokerId(): Promise<string | null> {
  const user = await currentPortalUser()
  if (!user || (user.role !== 'BROKER' && user.role !== 'CEO' && user.role !== 'ADMIN')) return null
  const broker = await db.brokerProfile.findUnique({
    where: { userId: user.id },
    select: { id: true },
  })
  return broker?.id ?? null
}

/**
 * PATCH /api/broker/leads  { id, status?, nextFollowUp?, notes? }
 *
 * Scoped to the caller's own lead set: the `brokerId` filter means a broker can
 * never touch a lead they don't own, even with a guessed id.
 *
 * - `status` (optional) goes through the shared state machine + audit,
 *   identical bookkeeping to PATCH /api/leads/[id].
 * - `nextFollowUp` (optional ISO string, or null/'' to clear) and `notes`
 *   (optional, max 2000 chars) are plain field updates on the owned row.
 * At least one of the three must be present.
 */
export async function PATCH(req: NextRequest) {
  try {
    const brokerId = await myBrokerId()
    if (!brokerId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await req.json().catch(() => ({}))
    const id = String(body.id || '')
    const rawStatus = body.status === undefined || body.status === null ? '' : String(body.status).toUpperCase()

    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
    if (rawStatus && !(STATUSES as readonly string[]).includes(rawStatus)) {
      return NextResponse.json(
        { error: `status must be one of: ${STATUSES.join(', ')}` },
        { status: 400 }
      )
    }

    const hasFollowUp = body.nextFollowUp !== undefined
    const hasNotes = body.notes !== undefined
    if (!rawStatus && !hasFollowUp && !hasNotes) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
    }

    let nextFollowUp: Date | null | undefined
    if (hasFollowUp) {
      const raw = body.nextFollowUp
      if (raw === null || raw === '') {
        nextFollowUp = null
      } else {
        const d = new Date(String(raw))
        if (Number.isNaN(d.getTime())) {
          return NextResponse.json({ error: 'nextFollowUp must be a valid date' }, { status: 400 })
        }
        nextFollowUp = d
      }
    }

    let notes: string | null | undefined
    if (hasNotes) {
      const raw = body.notes
      if (raw === null) notes = null
      else if (typeof raw !== 'string') {
        return NextResponse.json({ error: 'notes must be a string' }, { status: 400 })
      } else notes = raw.trim() ? raw.trim().slice(0, 2000) : null
    }

    const now = new Date()
    const user = await currentPortalUser()

    // Ownership scope first (same `brokerId` guard as before), then the
    // shared state machine + audit — identical bookkeeping to PATCH
    // /api/leads/[id] so broker-portal writes get lifecycle stamps,
    // LeadActivity, and auto-created deals.
    const owned = await db.lead.findFirst({ where: { id, brokerId }, select: { id: true, status: true } })
    if (!owned) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
    }

    if (rawStatus) {
      const result = await applyStatusTransition({
        leadId: id,
        to: rawStatus,
        actorId: user?.id ?? null,
        actorRole: user?.role ?? 'BROKER',
        notes: 'via broker-portal',
      })
      if (!result.ok) {
        return NextResponse.json({ error: result.error || 'Invalid transition' }, { status: 409 })
      }
    }

    const data: Record<string, unknown> = { lastActivityAt: now, updatedBy: user?.id ?? undefined }
    if (nextFollowUp !== undefined) data.nextFollowUp = nextFollowUp
    if (notes !== undefined) data.notes = notes

    await db.lead.update({
      where: { id },
      data,
    }).catch(() => undefined)

    await logAudit({
      userId: user?.id,
      action: rawStatus ? 'STATUS_CHANGED' : 'LEAD_UPDATED',
      entity: 'Lead',
      entityId: id,
      changes: { to: rawStatus || undefined, nextFollowUp: hasFollowUp, notes: hasNotes, via: 'broker-portal' },
    })

    return NextResponse.json({
      updated: 1,
      ...(rawStatus ? { status: rawStatus } : {}),
      ...(hasFollowUp ? { nextFollowUp: nextFollowUp ? nextFollowUp.toISOString() : null } : {}),
      ...(hasNotes ? { notes } : {}),
    })
  } catch (error) {
    console.error('Broker lead update error:', error)
    return NextResponse.json({ error: 'Failed to update lead' }, { status: 500 })
  }
}
