import { NextResponse } from 'next/server'
import { randomBytes } from 'node:crypto'
import { db } from '@/lib/db'
import { requireActor } from '@/lib/lead-access'
import { logAudit } from '@/lib/permissions'

export const dynamic = 'force-dynamic'

/**
 * Broker-assigned viewings.
 *
 * GET /api/viewings only returns rows booked BY the signed-in user
 * (`where: { userId }`) plus the developer-projects branch — a broker's
 * assigned viewings (`brokerId` set, `userId` = the client) are invisible
 * there, and DELETE /api/viewings only honours `userId` ownership. This
 * route is the broker-owned counterpart: every query is scoped by the
 * caller's OWN BrokerProfile id resolved from the session, so a broker can
 * only ever list / create / reschedule / cancel their own viewings.
 */

async function myBrokerId(userId: string): Promise<string | null> {
  const broker = await db.brokerProfile.findFirst({
    where: { userId },
    select: { id: true },
  })
  return broker?.id ?? null
}

const viewingSelect = {
  id: true,
  scheduledAt: true,
  duration: true,
  status: true,
  meetingType: true,
  meetingLink: true,
  contactPhone: true,
  notes: true,
  createdAt: true,
  project: { select: { id: true, name: true, slug: true } },
  unit: {
    select: {
      id: true,
      name: true,
      project: { select: { id: true, name: true, slug: true } },
    },
  },
  lead: { select: { id: true, name: true, phone: true } },
} as const

function cleanPhone(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const digits = raw.replace(/[\s\-().]/g, '')
  return /^\+?\d{7,15}$/.test(digits) ? digits : null
}

// ─── GET /api/broker/viewings — my assigned viewings ─────
export async function GET() {
  try {
    const gate = await requireActor(['BROKER'])
    if (!gate.ok) return gate.response
    const brokerId = await myBrokerId(gate.ctx.userId)
    if (!brokerId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const viewings = await db.viewing.findMany({
      where: { brokerId },
      select: viewingSelect,
      orderBy: { scheduledAt: 'desc' },
      take: 100,
    })

    return NextResponse.json({ viewings })
  } catch (error) {
    console.error('Broker viewings fetch error:', error)
    return NextResponse.json({ error: 'Failed to load viewings' }, { status: 500 })
  }
}

// ─── POST /api/broker/viewings — schedule for my lead ────
// body: { leadId, scheduledAt, meetingType?, notes?, contactPhone?, duration? }
// Project/unit are derived from the owned lead — never trusted from the client.
export async function POST(req: Request) {
  try {
    const gate = await requireActor(['BROKER'])
    if (!gate.ok) return gate.response
    const brokerId = await myBrokerId(gate.ctx.userId)
    if (!brokerId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await req.json().catch(() => ({}))
    const leadId = String(body.leadId || '')
    if (!leadId) return NextResponse.json({ error: 'leadId is required' }, { status: 400 })

    const lead = await db.lead.findFirst({
      where: { id: leadId, brokerId },
      select: { id: true, phone: true, projectId: true, unitId: true },
    })
    if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })

    const date = new Date(String(body.scheduledAt || ''))
    if (Number.isNaN(date.getTime()) || date.getTime() <= Date.now()) {
      return NextResponse.json({ error: 'scheduledAt must be a future date' }, { status: 400 })
    }

    const meetingType = body.meetingType === 'online' ? 'online' : 'in_person'
    const contactPhone =
      body.contactPhone !== undefined ? cleanPhone(body.contactPhone) : cleanPhone(lead.phone)
    if (!contactPhone) {
      return NextResponse.json({ error: 'Invalid phone number' }, { status: 400 })
    }
    const duration =
      Number(body.duration) > 0 ? Math.min(240, Math.max(15, Math.floor(Number(body.duration)))) : 30
    const notes =
      typeof body.notes === 'string' && body.notes.trim()
        ? body.notes.trim().slice(0, 1000)
        : null

    const viewing = await db.viewing.create({
      data: {
        brokerId,
        leadId: lead.id,
        projectId: lead.projectId,
        unitId: lead.unitId,
        scheduledAt: date,
        duration,
        meetingType,
        meetingLink:
          meetingType === 'online'
            ? `https://meet.jit.si/GHAYA-${randomBytes(6).toString('hex')}`
            : null,
        contactPhone,
        notes,
        status: 'REQUESTED',
      },
      select: viewingSelect,
    })

    await db.lead
      .update({ where: { id: lead.id }, data: { lastActivityAt: new Date() } })
      .catch(() => undefined)
    await logAudit({
      userId: gate.ctx.userId,
      action: 'VIEWING_SCHEDULED',
      entity: 'Viewing',
      entityId: viewing.id,
      changes: { leadId: lead.id, via: 'broker-portal' },
    })

    return NextResponse.json({ viewing }, { status: 201 })
  } catch (error) {
    console.error('Broker viewing create error:', error)
    return NextResponse.json({ error: 'Failed to schedule viewing' }, { status: 500 })
  }
}

// ─── PATCH /api/broker/viewings — reschedule mine ────────
// body: { id, scheduledAt } — upcoming REQUESTED/CONFIRMED rows only.
export async function PATCH(req: Request) {
  try {
    const gate = await requireActor(['BROKER'])
    if (!gate.ok) return gate.response
    const brokerId = await myBrokerId(gate.ctx.userId)
    if (!brokerId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await req.json().catch(() => ({}))
    const id = String(body.id || '')
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

    const owned = await db.viewing.findFirst({
      where: { id, brokerId },
      select: { id: true, status: true, scheduledAt: true },
    })
    if (!owned) return NextResponse.json({ error: 'Viewing not found' }, { status: 404 })

    if (!['REQUESTED', 'CONFIRMED'].includes(String(owned.status).toUpperCase())) {
      return NextResponse.json(
        { error: 'Only upcoming requested or confirmed viewings can be rescheduled' },
        { status: 409 }
      )
    }
    if (owned.scheduledAt.getTime() <= Date.now()) {
      return NextResponse.json(
        { error: 'Past viewings cannot be rescheduled' },
        { status: 409 }
      )
    }

    const date = new Date(String(body.scheduledAt || ''))
    if (Number.isNaN(date.getTime()) || date.getTime() <= Date.now()) {
      return NextResponse.json({ error: 'scheduledAt must be a future date' }, { status: 400 })
    }

    const viewing = await db.viewing.update({
      where: { id },
      data: { scheduledAt: date },
      select: viewingSelect,
    })

    await logAudit({
      userId: gate.ctx.userId,
      action: 'VIEWING_RESCHEDULED',
      entity: 'Viewing',
      entityId: id,
      changes: { to: date.toISOString(), via: 'broker-portal' },
    })

    return NextResponse.json({ viewing })
  } catch (error) {
    console.error('Broker viewing reschedule error:', error)
    return NextResponse.json({ error: 'Failed to reschedule viewing' }, { status: 500 })
  }
}

// ─── DELETE /api/broker/viewings?id= — cancel mine ───────
export async function DELETE(req: Request) {
  try {
    const gate = await requireActor(['BROKER'])
    if (!gate.ok) return gate.response
    const brokerId = await myBrokerId(gate.ctx.userId)
    if (!brokerId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const id = new URL(req.url).searchParams.get('id') || ''
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

    const owned = await db.viewing.findFirst({
      where: { id, brokerId },
      select: { id: true, status: true, scheduledAt: true },
    })
    if (!owned) return NextResponse.json({ error: 'Viewing not found' }, { status: 404 })

    if (!['REQUESTED', 'CONFIRMED'].includes(String(owned.status).toUpperCase())) {
      return NextResponse.json(
        { error: 'Only upcoming requested or confirmed viewings can be cancelled' },
        { status: 409 }
      )
    }
    if (owned.scheduledAt.getTime() <= Date.now()) {
      return NextResponse.json(
        { error: 'Past viewings cannot be cancelled' },
        { status: 409 }
      )
    }

    const viewing = await db.viewing.update({
      where: { id },
      data: { status: 'CANCELLED' },
      select: viewingSelect,
    })

    await logAudit({
      userId: gate.ctx.userId,
      action: 'VIEWING_CANCELLED',
      entity: 'Viewing',
      entityId: id,
      changes: { via: 'broker-portal' },
    })

    return NextResponse.json({ success: true, viewing })
  } catch (error) {
    console.error('Broker viewing cancel error:', error)
    return NextResponse.json({ error: 'Failed to cancel viewing' }, { status: 500 })
  }
}
