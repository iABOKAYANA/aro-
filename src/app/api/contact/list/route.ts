import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireActor } from '@/lib/lead-access'

export const dynamic = 'force-dynamic'

const STATUSES = ['NEW', 'READ', 'REPLIED', 'ARCHIVED']

export async function GET(req: NextRequest) {
  try {
    // CEO/ADMIN only (requireActor lets super roles through any list).
    const gate = await requireActor(['CEO'])
    if (!gate.ok) return gate.response

    const rawPage = parseInt(req.nextUrl.searchParams.get('page') || '1', 10)
    const rawLimit = parseInt(req.nextUrl.searchParams.get('limit') || '20', 10)
    const page = Number.isFinite(rawPage) ? Math.max(1, rawPage) : 1
    const limit = Number.isFinite(rawLimit) ? Math.min(100, Math.max(1, rawLimit)) : 20
    const status = req.nextUrl.searchParams.get('status')
    const skip = (page - 1) * limit

    const where: Record<string, unknown> = {}
    if (status) {
      if (!STATUSES.includes(status)) {
        return NextResponse.json(
          { error: `status must be one of ${STATUSES.join(', ')}` },
          { status: 400 }
        )
      }
      where.status = status
    }

    const [items, total] = await Promise.all([
      db.contactSubmission.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      db.contactSubmission.count({ where }),
    ])

    return NextResponse.json({
      items,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    })
  } catch (error) {
    console.error('Fetch contact submissions error:', error)
    return NextResponse.json({ error: 'Failed to fetch contact submissions' }, { status: 500 })
  }
}

/** CEO/ADMIN only — NEW → READ → REPLIED → ARCHIVED from /ceo/contacts. */
export async function PATCH(req: NextRequest) {
  try {
    const gate = await requireActor(['CEO'])
    if (!gate.ok) return gate.response

    const body = await req.json()
    const { id, status } = body as { id?: string; status?: string }
    if (!id || typeof id !== 'string') {
      return NextResponse.json({ error: 'id is required' }, { status: 400 })
    }
    if (!status || !STATUSES.includes(status)) {
      return NextResponse.json({ error: `status must be one of ${STATUSES.join(', ')}` }, { status: 400 })
    }

    const existing = await db.contactSubmission.findUnique({ where: { id }, select: { id: true } })
    if (!existing) return NextResponse.json({ error: 'Submission not found' }, { status: 404 })

    const submission = await db.contactSubmission.update({ where: { id }, data: { status } })
    return NextResponse.json({ submission })
  } catch (error) {
    console.error('Update contact submission error:', error)
    return NextResponse.json({ error: 'Failed to update submission' }, { status: 500 })
  }
}
