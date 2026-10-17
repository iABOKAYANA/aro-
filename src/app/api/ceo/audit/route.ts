import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireCEOApi } from '@/lib/permissions'

export const dynamic = 'force-dynamic'

// ─── GET /api/ceo/audit — CEO audit-log viewer ─────────────
// Query: ?action= &entity= &userId= &from= &to= &limit= (clamped 1..200, default 50)
// Returns { items } newest-first. Each item is the AuditLog row plus the
// actor's name/email (no new table — reads AuditLog with a user join).
export async function GET(req: Request) {
  try {
    const { error } = await requireCEOApi()
    if (error) return error

    const { searchParams } = new URL(req.url)
    const action = searchParams.get('action')?.trim() || undefined
    const entity = searchParams.get('entity')?.trim() || undefined
    const userId = searchParams.get('userId')?.trim() || undefined
    const fromRaw = searchParams.get('from')?.trim() || ''
    const toRaw = searchParams.get('to')?.trim() || ''

    let limit = parseInt(searchParams.get('limit') || '50', 10)
    if (!Number.isFinite(limit)) limit = 50
    limit = Math.min(200, Math.max(1, limit))

    const where: Record<string, unknown> = {}
    if (action) where.action = action
    if (entity) where.entity = entity
    if (userId) where.userId = userId
    if (fromRaw || toRaw) {
      const createdAt: Record<string, Date> = {}
      if (fromRaw) {
        const d = new Date(fromRaw)
        if (!Number.isFinite(d.getTime())) {
          return NextResponse.json({ error: 'Invalid from' }, { status: 400 })
        }
        createdAt.gte = d
      }
      if (toRaw) {
        const d = new Date(toRaw)
        if (!Number.isFinite(d.getTime())) {
          return NextResponse.json({ error: 'Invalid to' }, { status: 400 })
        }
        createdAt.lte = d
      }
      where.createdAt = createdAt
    }

    const rows = await db.auditLog.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    })

    const items = rows.map((r) => ({
      id: r.id,
      action: r.action,
      entity: r.entity,
      entityId: r.entityId,
      changes: parseChanges(r.changes),
      userId: r.userId,
      userName: r.user?.name ?? null,
      userEmail: r.user?.email ?? null,
      ipAddress: r.ipAddress,
      createdAt: r.createdAt,
    }))

    return NextResponse.json({ items })
  } catch (err) {
    console.error('CEO audit viewer error:', err)
    return NextResponse.json({ error: 'Failed to fetch audit logs' }, { status: 500 })
  }
}

function parseChanges(raw: string | null): unknown {
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return raw
  }
}
