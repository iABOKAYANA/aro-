import { NextResponse } from 'next/server'
import { randomBytes } from 'node:crypto'
import { db } from '@/lib/db'
import { auth } from '@/lib/auth'
import { getClientIp, rateLimit } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

const viewingsInclude = {
  unit: {
    select: {
      id: true,
      name: true,
      slug: true,
      project: { select: { id: true, name: true, slug: true } },
    },
  },
  project: { select: { id: true, name: true, slug: true } },
  broker: {
    select: {
      id: true,
      user: { select: { name: true, email: true, avatar: true } },
    },
  },
} as const

// Resolve the signed-in user and make sure the account still exists.
// A stale JWT (e.g. after the DB was re-seeded with new user ids) passes
// `auth()` but fails every insert with a foreign-key violation (P2003),
// so we reject it with 401 and let the client force a fresh login.
async function resolveUserId(): Promise<string | null> {
  const session = await auth()
  const id = (session?.user as any)?.id
  if (!id) return null
  const user = await db.user.findUnique({ where: { id }, select: { id: true } })
  return user ? id : null
}

export async function GET() {
  try {
    const userId = await resolveUserId()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // DEVELOPER sees appointments for their own projects only (direct link or
    // via the booked unit). Every other role keeps the exact previous
    // behaviour: only rows booked by the signed-in user. CEO/ADMIN manage the
    // full inbox through the CEO-only /api/ceo/viewings surface instead.
    const session = await auth().catch(() => null)
    const role = (session?.user as any)?.role as string | undefined
    if (role === 'DEVELOPER') {
      const profile = await db.developerProfile.findFirst({
        where: { userId },
        select: { id: true },
      })
      if (!profile) return NextResponse.json({ viewings: [] })
      const viewings = await db.viewing.findMany({
        where: {
          OR: [
            { project: { developerId: profile.id } },
            { unit: { project: { developerId: profile.id } } },
          ],
        },
        include: viewingsInclude,
        orderBy: { scheduledAt: 'desc' },
      })
      return NextResponse.json({ viewings })
    }

    const viewings = await db.viewing.findMany({
      where: { userId },
      include: viewingsInclude,
      orderBy: { scheduledAt: 'desc' },
    })

    return NextResponse.json({ viewings })
  } catch (error) {
    console.error('Fetch viewings error:', error)
    return NextResponse.json({ error: 'Failed to fetch viewings' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    // Anonymous booking is spam-prone: 5 bookings/hr per IP, mirroring
    // POST /api/jobs/[id]/apply. Authed + anon share the bucket (by IP).
    // IP via the shared extractor (src/lib/rate-limit.ts).
    const ip = getClientIp(req.headers)
    const rl = rateLimit(`viewings:${ip}`, { limit: 5, windowMs: 60 * 60_000 })
    if (!rl.ok) {
      const retryAfter = Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000))
      return NextResponse.json(
        { error: 'Too many booking attempts. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(retryAfter) } }
      )
    }
    // Booking needs NO login: everyone gets a Lead on the Leads page, and a
    // signed-in user additionally gets the appointment in their dashboard.
    // A stale JWT (user gone after a re-seed) is treated as a guest, not an error.
    const session = await auth()
    const sid = (session?.user as any)?.id
    const me = sid
      ? await db.user.findUnique({ where: { id: sid }, select: { id: true, name: true, phone: true } })
      : null
    const userId = me?.id ?? null

    const body = await req.json()
    const { projectId, unitId, meetingType, scheduledAt, duration, notes, phone, name } = body

    const type = meetingType === 'online' ? 'online' : 'in_person'

    const rawName = typeof name === 'string' ? name.trim() : ''
    const leadName = rawName || me?.name || ''
    if (!leadName) {
      console.warn('[viewings] 400: missing name')
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }

    const rawPhone = typeof phone === 'string' ? phone.trim() : me?.phone || ''
    const contactPhone = rawPhone.replace(/[\s\-().]/g, '')
    if (!contactPhone || !/^\+?\d{7,15}$/.test(contactPhone)) {
      console.warn(`[viewings] 400: invalid phone "${rawPhone}"`)
      return NextResponse.json({ error: 'Invalid phone number' }, { status: 400 })
    }

    if (!projectId && !unitId) {
      console.warn('[viewings] 400: missing projectId/unitId')
      return NextResponse.json({ error: 'projectId or unitId required' }, { status: 400 })
    }

    const date = new Date(scheduledAt)
    if (Number.isNaN(date.getTime()) || date.getTime() <= Date.now()) {
      console.warn(`[viewings] 400: invalid/past date received="${scheduledAt}" now=${new Date().toISOString()}`)
      return NextResponse.json({ error: 'Invalid appointment date' }, { status: 400 })
    }

    let propertyName: string | null = null
    if (projectId) {
      const project = await db.project.findUnique({ where: { id: projectId }, select: { id: true, name: true } })
      if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })
      propertyName = project.name
    }
    if (unitId) {
      const unit = await db.unit.findUnique({
        where: { id: unitId },
        select: { id: true, name: true, isSample: true, project: { select: { name: true } } },
      })
      if (!unit) return NextResponse.json({ error: 'Unit not found' }, { status: 404 })
      // Showcase samples are illustrative, never bookable — inquiry CTA only.
      if (unit.isSample) return NextResponse.json({ error: 'Showcase model units cannot be booked. Please send an inquiry instead.' }, { status: 400 })
      propertyName = unit.project ? `${unit.project.name} — ${unit.name}` : unit.name
    }

    // Online meetings get a free, instantly usable Jitsi room link
    const meetingLink =
      type === 'online'
        ? `https://meet.jit.si/GHAYA-${randomBytes(6).toString('hex')}`
        : null

    const cleanNotes = typeof notes === 'string' && notes.trim() ? notes.trim().slice(0, 1000) : null

    // Every booking lands on the Leads page so the team can follow up by phone
    const leadNotes = [
      `Meeting booking (${type === 'online' ? 'online' : 'in-person viewing'})`,
      `When: ${date.toISOString()}`,
      propertyName ? `Property: ${propertyName}` : null,
      meetingLink ? `Meeting link: ${meetingLink}` : null,
      cleanNotes ? `Customer notes: ${cleanNotes}` : null,
    ].filter(Boolean).join('\n')

    const lead = await db.lead.create({
      data: {
        name: leadName,
        phone: contactPhone,
        source: 'MEETING_BOOKING',
        status: 'NEW',
        notes: leadNotes,
        // brokerId left null → unassigned, picked up from the Leads page
      },
    })

    // Every booking (guest or signed-in) becomes a Viewing so it shows up
    // on the CEO meetings page and the header notification bell
    const viewing = await db.viewing.create({
      data: {
        userId,
        projectId: projectId || null,
        unitId: unitId || null,
        leadId: lead.id,
        meetingType: type,
        meetingLink,
        contactPhone,
        scheduledAt: date,
        duration: Number(duration) > 0 ? Number(duration) : 30,
        notes: cleanNotes,
        status: 'REQUESTED',
      },
      include: viewingsInclude,
    })

    return NextResponse.json({ lead, viewing })
  } catch (error) {
    console.error('Create viewing error:', error)
    return NextResponse.json({ error: 'Failed to book appointment' }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  try {
    const userId = await resolveUserId()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

    const existing = await db.viewing.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: 'Viewing not found' }, { status: 404 })
    if (existing.userId !== userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const viewing = await db.viewing.update({
      where: { id },
      data: { status: 'CANCELLED' },
      include: viewingsInclude,
    })

    return NextResponse.json({ success: true, viewing })
  } catch (error) {
    console.error('Cancel viewing error:', error)
    return NextResponse.json({ error: 'Failed to cancel appointment' }, { status: 500 })
  }
}
