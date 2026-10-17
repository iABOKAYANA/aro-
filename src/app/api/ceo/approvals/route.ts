import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireCEOApi, logAudit } from '@/lib/permissions'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    const { error } = await requireCEOApi()
    if (error) return error

    const { searchParams } = new URL(req.url)
    const status = searchParams.get('status')
    const type = searchParams.get('type')

    const where: Record<string, unknown> = {}
    if (status) where.status = status
    if (type) where.type = type

    const approvals = await db.approvalRequest.findMany({
      where,
      include: {
        requestor: {
          select: { id: true, name: true, email: true, avatar: true, role: true },
        },
        reviewer: {
          select: { id: true, name: true, email: true, avatar: true },
        },
      },
      orderBy: { requestedAt: 'desc' },
    })

    return NextResponse.json({ approvals })
  } catch (error) {
    console.error('CEO fetch approvals error:', error)
    return NextResponse.json({ error: 'Failed to fetch approvals' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const { error, session } = await requireCEOApi()
    if (error) return error

    const body = await req.json()
    const { type, entityType, entityId, title, description, metadata } = body

    if (!type || !entityType || !title) {
      return NextResponse.json({ error: 'Missing required fields: type, entityType, title' }, { status: 400 })
    }

    const approval = await db.approvalRequest.create({
      data: {
        type,
        entityType,
        entityId: entityId || null,
        title,
        description: description || null,
        requestedBy: (session!.user as any).id,
        metadata: metadata ? JSON.stringify(metadata) : null,
      },
      include: {
        requestor: {
          select: { id: true, name: true, email: true, avatar: true, role: true },
        },
      },
    })

    await logAudit({
      userId: (session!.user as any).id,
      action: 'CREATE',
      entity: 'ApprovalRequest',
      entityId: approval.id,
      changes: { type, entityType, entityId, title },
    })

    return NextResponse.json({ approval }, { status: 201 })
  } catch (error) {
    console.error('CEO create approval error:', error)
    return NextResponse.json({ error: 'Failed to create approval' }, { status: 500 })
  }
}

export async function PATCH(req: Request) {
  try {
    const { error, session } = await requireCEOApi()
    if (error) return error

    const body = await req.json()
    const { id, status, reviewNote } = body

    if (!id) return NextResponse.json({ error: 'Approval ID required' }, { status: 400 })
    if (!status || !['APPROVED', 'REJECTED', 'CHANGES_REQUESTED'].includes(status)) {
      return NextResponse.json({ error: 'Invalid status. Must be APPROVED, REJECTED, or CHANGES_REQUESTED' }, { status: 400 })
    }

    const existing = await db.approvalRequest.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: 'Approval not found' }, { status: 404 })

    const approval = await db.approvalRequest.update({
      where: { id },
      data: {
        status,
        reviewedBy: (session!.user as any).id,
        reviewNote: reviewNote || null,
        reviewedAt: new Date(),
      },
      include: {
        requestor: {
          select: { id: true, name: true, email: true, avatar: true, role: true },
        },
        reviewer: {
          select: { id: true, name: true, email: true, avatar: true },
        },
      },
    })

    await logAudit({
      userId: (session!.user as any).id,
      action: status,
      entity: 'ApprovalRequest',
      entityId: id,
      changes: { previousStatus: existing.status, newStatus: status, reviewNote },
    })

    return NextResponse.json({ approval })
  } catch (error) {
    console.error('CEO update approval error:', error)
    return NextResponse.json({ error: 'Failed to update approval' }, { status: 500 })
  }
}
