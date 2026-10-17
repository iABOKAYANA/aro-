import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { auth } from '@/lib/auth'
import { requireActor } from '@/lib/lead-access'

export const dynamic = 'force-dynamic'

const reviewInclude = {
  user: { select: { id: true, name: true, avatar: true } },
  project: { select: { id: true, name: true, slug: true } },
} as const

// ─── GET /api/reviews?projectId= — public approved list + average/count ─────
// Only APPROVED reviews are ever public. CEOs/ADMINs may pass
// ?status=PENDING (or ALL) to drive the moderation queue — that branch
// requires requireActor(['CEO', 'ADMIN']) and never leaks otherwise.
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const projectId = searchParams.get('projectId')
    const statusParam = (searchParams.get('status') || 'APPROVED').toUpperCase()

    // No projectId → global moderation queue, CEO/ADMIN only.
    if (!projectId) {
      const gate = await requireActor(['CEO', 'ADMIN'])
      if (!gate.ok) return gate.response
      if (!['PENDING', 'APPROVED', 'REJECTED', 'ALL'].includes(statusParam)) {
        return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
      }
      const where: Record<string, unknown> =
        statusParam === 'ALL' ? {} : { status: statusParam }
      const reviews = await db.review.findMany({
        where,
        include: reviewInclude,
        orderBy: { createdAt: 'desc' },
        take: 200,
      })
      return NextResponse.json({ reviews })
    }

    let status = 'APPROVED'
    if (statusParam !== 'APPROVED') {
      const gate = await requireActor(['CEO', 'ADMIN'])
      if (!gate.ok) return gate.response
      if (!['PENDING', 'REJECTED', 'ALL'].includes(statusParam)) {
        return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
      }
      status = statusParam
    }

    const where: Record<string, unknown> =
      status === 'ALL' ? { projectId } : { projectId, status }

    const [reviews, approved] = await Promise.all([
      db.review.findMany({
        where,
        include: reviewInclude,
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
      db.review.findMany({
        where: { projectId, status: 'APPROVED' },
        select: { rating: true },
      }),
    ])

    const count = approved.length
    const average =
      count > 0
        ? Math.round((approved.reduce((sum, r) => sum + r.rating, 0) / count) * 10) / 10
        : null

    return NextResponse.json({ reviews, average, count })
  } catch (error) {
    console.error('Fetch reviews error:', error)
    return NextResponse.json({ error: 'Failed to fetch reviews' }, { status: 500 })
  }
}

// ─── POST /api/reviews — rate a COMPLETED viewing (1–5 + comment) ────────────
// Anti-fake checks, all server-side — nothing from the client is trusted:
//   1. the viewing must exist
//   2. it must belong to the signed-in caller
//   3. its status must be COMPLETED
//   4. its project (direct or via the booked unit) must match `projectId`
//   + no review may already exist for that viewing (viewingId is @unique)
export async function POST(req: Request) {
  try {
    const session = await auth()
    const userId = (session?.user as any)?.id
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { projectId, viewingId, rating, comment } = body

    if (!projectId || !viewingId) {
      return NextResponse.json({ error: 'projectId and viewingId required' }, { status: 400 })
    }

    const stars = Number(rating)
    if (!Number.isInteger(stars) || stars < 1 || stars > 5) {
      return NextResponse.json({ error: 'rating must be an integer from 1 to 5' }, { status: 400 })
    }

    const cleanComment =
      typeof comment === 'string' && comment.trim() ? comment.trim().slice(0, 1000) : null

    const project = await db.project.findUnique({ where: { id: projectId }, select: { id: true } })
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const viewing = await db.viewing.findUnique({
      where: { id: viewingId },
      include: { unit: { select: { projectId: true } } },
    })
    if (!viewing) {
      return NextResponse.json({ error: 'Viewing not found' }, { status: 404 })
    }
    if (viewing.userId !== userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    if (viewing.status !== 'COMPLETED') {
      return NextResponse.json(
        { error: 'Only completed viewings can be rated' },
        { status: 403 }
      )
    }
    const viewingProjectId = viewing.projectId ?? viewing.unit?.projectId ?? null
    if (viewingProjectId !== projectId) {
      return NextResponse.json({ error: 'Viewing does not belong to this project' }, { status: 400 })
    }

    const existing = await db.review.findUnique({ where: { viewingId } })
    if (existing) {
      return NextResponse.json({ error: 'This viewing was already rated' }, { status: 409 })
    }

    const review = await db.review.create({
      data: {
        projectId,
        userId,
        viewingId,
        rating: stars,
        comment: cleanComment,
        status: 'PENDING',
      },
      include: reviewInclude,
    })

    return NextResponse.json({ review }, { status: 201 })
  } catch (error) {
    console.error('Create review error:', error)
    return NextResponse.json({ error: 'Failed to submit review' }, { status: 500 })
  }
}
