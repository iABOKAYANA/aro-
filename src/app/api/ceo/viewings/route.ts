import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireCEOApi, logAudit } from '@/lib/permissions'

export const dynamic = 'force-dynamic'

const viewingPatchSchema = z.object({
  id: z.string().min(1, 'Viewing ID required'),
  status: z.enum(['REQUESTED', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW', 'RESCHEDULED', 'scheduled', 'requested', 'confirmed', 'completed', 'cancelled']).optional(),
  notes: z.string().max(2000).optional().nullable(),
  feedback: z.string().max(2000).optional().nullable(),
  rating: z.number().int().min(1).max(5).optional().nullable(),
  brokerId: z.string().min(1).optional().nullable(),
  scheduledAt: z.string().refine((v) => !Number.isNaN(Date.parse(v)), 'Invalid date').optional(),
  duration: z.number().int().min(5).max(480).optional(),
})

export async function GET(req: Request) {
  try {
    const { error } = await requireCEOApi()
    if (error) return error

    const { searchParams } = new URL(req.url)
    const status = searchParams.get('status')
    const search = searchParams.get('search')

    const where: Record<string, unknown> = {}
    if (status) where.status = status

    if (search) {
      where.OR = [
        { user: { name: { contains: search } } },
        { user: { email: { contains: search } } },
        { unit: { name: { contains: search } } },
        { notes: { contains: search } },
      ]
    }

    const viewings = await db.viewing.findMany({
      where,
      include: {
        user: {
          select: { id: true, name: true, email: true, phone: true, avatar: true },
        },
        unit: {
          select: {
            id: true,
            name: true,
            unitNumber: true,
            unitType: true,
            price: true,
            project: { select: { id: true, name: true } },
          },
        },
        broker: {
          select: {
            id: true,
            user: { select: { id: true, name: true, email: true, avatar: true } },
          },
        },
        project: {
          select: { id: true, name: true, slug: true, address: true },
        },
        lead: {
          select: { id: true, name: true, phone: true, email: true },
        },
      },
      orderBy: { scheduledAt: 'desc' },
    })

    return NextResponse.json({ viewings })
  } catch (error) {
    console.error('CEO fetch viewings error:', error)
    return NextResponse.json({ error: 'Failed to fetch viewings' }, { status: 500 })
  }
}

export async function PATCH(req: Request) {
  try {
    const { error, session } = await requireCEOApi()
    if (error) return error

    const body = await req.json().catch(() => null)
    const parsed = viewingPatchSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid input' }, { status: 400 })
    }
    const { id, status, notes, feedback, rating, brokerId, scheduledAt, duration } = parsed.data

    const existing = await db.viewing.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: 'Viewing not found' }, { status: 404 })

    const updateData: Record<string, unknown> = {}
    if (status !== undefined) updateData.status = status
    if (notes !== undefined) updateData.notes = notes
    if (feedback !== undefined) updateData.feedback = feedback
    if (rating !== undefined) updateData.rating = rating
    if (brokerId !== undefined) updateData.brokerId = brokerId
    if (scheduledAt !== undefined) updateData.scheduledAt = new Date(scheduledAt)
    if (duration !== undefined) updateData.duration = duration

    const viewing = await db.viewing.update({ where: { id }, data: updateData })

    await logAudit({
      userId: (session!.user as any).id,
      action: 'UPDATE',
      entity: 'Viewing',
      entityId: id,
      changes: updateData,
    })

    // Completion → rate-your-visit nudge. Fail-soft inside (never throws),
    // deduped per viewing — the visitor is only ever nudged while the
    // previous nudge for this viewing is still unread.
    if (
      typeof status === 'string' &&
      status.toUpperCase() === 'COMPLETED' &&
      (existing.status ?? '').toUpperCase() !== 'COMPLETED'
    ) {
      const { notifyViewingCompleted } = await import('@/lib/viewing-completed')
      await notifyViewingCompleted(id)
    }

    return NextResponse.json({ viewing })
  } catch (error) {
    console.error('CEO update viewing error:', error)
    return NextResponse.json({ error: 'Failed to update viewing' }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  try {
    const { error, session } = await requireCEOApi()
    if (error) return error

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'Viewing ID required' }, { status: 400 })

    const existing = await db.viewing.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: 'Viewing not found' }, { status: 404 })

    const viewing = await db.viewing.update({
      where: { id },
      data: { status: 'CANCELLED' },
    })

    await logAudit({
      userId: (session!.user as any).id,
      action: 'CANCEL',
      entity: 'Viewing',
      entityId: id,
      changes: { previousStatus: existing.status },
    })

    return NextResponse.json({ success: true, viewing })
  } catch (error) {
    console.error('CEO cancel viewing error:', error)
    return NextResponse.json({ error: 'Failed to cancel viewing' }, { status: 500 })
  }
}
