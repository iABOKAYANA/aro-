import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { auth } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// ─── GET /api/notifications — the signed-in user's inbox ──
export async function GET(req: Request) {
  try {
    const session = await auth()
    const userId = (session?.user as any)?.id
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Stale JWT guard (same pattern as /api/viewings)
    const user = await db.user.findUnique({ where: { id: userId }, select: { id: true } })
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20', 10) || 20))
    const unreadOnly = searchParams.get('unread') === '1'

    const where = unreadOnly ? { userId, isRead: false } : { userId }

    const [notifications, unreadCount] = await Promise.all([
      db.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
      db.notification.count({ where: { userId, isRead: false } }),
    ])

    return NextResponse.json({ notifications, unreadCount })
  } catch (error) {
    console.error('Fetch notifications error:', error)
    return NextResponse.json({ error: 'Failed to fetch notifications' }, { status: 500 })
  }
}

// ─── PATCH /api/notifications ─────────────────────────────
// body: { ids?: string[], all?: boolean, unreadOnly?: boolean }
export async function PATCH(req: Request) {
  try {
    const session = await auth()
    const userId = (session?.user as any)?.id
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json().catch(() => ({}))

    if (body.all === true) {
      const result = await db.notification.updateMany({
        where: { userId, isRead: false },
        data: { isRead: true },
      })
      return NextResponse.json({ updated: result.count })
    }

    if (Array.isArray(body.ids) && body.ids.length > 0) {
      if (body.ids.length > 500) {
        return NextResponse.json({ error: 'Too many ids (max 500)' }, { status: 400 })
      }
      // scope by userId so a user can never mark someone else's rows
      const result = await db.notification.updateMany({
        where: { userId, id: { in: body.ids.map(String).slice(0, 500) }, isRead: false },
        data: { isRead: true },
      })
      return NextResponse.json({ updated: result.count })
    }

    return NextResponse.json({ error: 'ids or all required' }, { status: 400 })
  } catch (error) {
    console.error('Update notifications error:', error)
    return NextResponse.json({ error: 'Failed to update notifications' }, { status: 500 })
  }
}
