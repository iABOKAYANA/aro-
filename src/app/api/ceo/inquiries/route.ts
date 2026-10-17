import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireCEOApi } from '@/lib/permissions'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    const { error } = await requireCEOApi()
    if (error) return error

    const { searchParams } = new URL(req.url)
    const search = searchParams.get('search')?.slice(0, 120) || null
    const status = searchParams.get('status')
    const rawPage = parseInt(searchParams.get('page') || '1', 10)
    const rawLimit = parseInt(searchParams.get('limit') || '50', 10)
    const page = Number.isFinite(rawPage) ? Math.max(1, rawPage) : 1
    const limit = Number.isFinite(rawLimit) ? Math.min(100, Math.max(1, rawLimit)) : 50

    const where: Record<string, unknown> = {}
    if (status) where.status = status
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { email: { contains: search } },
        { phone: { contains: search } },
        { message: { contains: search } },
      ]
    }

    const [inquiries, total] = await Promise.all([
      db.inquiry.findMany({
        where,
        include: {
          unit: {
            select: {
              id: true,
              name: true,
              slug: true,
              unitType: true,
              price: true,
              project: { select: { id: true, name: true } },
            },
          },
          user: { select: { id: true, name: true, email: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.inquiry.count({ where }),
    ])

    return NextResponse.json({
      inquiries,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    })
  } catch (error) {
    console.error('CEO fetch inquiries error:', error)
    return NextResponse.json({ error: 'Failed to fetch inquiries' }, { status: 500 })
  }
}

export async function PATCH(req: Request) {
  try {
    const { error } = await requireCEOApi()
    if (error) return error

    const body = await req.json()
    const { id, status, assignedTo, notes, priority } = body
    if (!id || typeof id !== 'string') return NextResponse.json({ error: 'Inquiry ID required' }, { status: 400 })

    const updateData: Record<string, unknown> = {}
    if (status !== undefined) {
      if (typeof status !== 'string' || !status.trim() || status.length > 40) {
        return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
      }
      updateData.status = status.trim()
    }
    if (assignedTo !== undefined) {
      if (assignedTo !== null && (typeof assignedTo !== 'string' || !assignedTo.trim())) {
        return NextResponse.json({ error: 'Invalid assignedTo' }, { status: 400 })
      }
      if (typeof assignedTo === 'string' && assignedTo.trim()) {
        const assignee = await db.user.findUnique({ where: { id: assignedTo.trim() }, select: { id: true } })
        if (!assignee) return NextResponse.json({ error: 'Assignee not found' }, { status: 404 })
        updateData.assignedTo = assignedTo.trim()
      } else {
        updateData.assignedTo = null
      }
    }
    if (notes !== undefined) {
      if (notes !== null && typeof notes !== 'string') {
        return NextResponse.json({ error: 'Invalid notes' }, { status: 400 })
      }
      updateData.notes = typeof notes === 'string' ? notes.slice(0, 2000) : null
    }
    if (priority !== undefined) {
      if (!Number.isInteger(priority) || priority < 0 || priority > 5) {
        return NextResponse.json({ error: 'priority must be an integer 0-5' }, { status: 400 })
      }
      updateData.priority = priority
    }

    if (updateData.status === 'CONTACTED' && !body.contactedAt) {
      updateData.contactedAt = new Date()
    }
    if (updateData.status === 'RESOLVED') {
      updateData.resolvedAt = new Date()
    }

    const inquiry = await db.inquiry.update({
      where: { id },
      data: updateData,
    })

    return NextResponse.json({ inquiry })
  } catch (error) {
    console.error('CEO update inquiry error:', error)
    return NextResponse.json({ error: 'Failed to update inquiry' }, { status: 500 })
  }
}
