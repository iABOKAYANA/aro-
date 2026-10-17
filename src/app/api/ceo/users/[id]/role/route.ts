import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireCEOApi, logAudit } from '@/lib/permissions'

export const dynamic = 'force-dynamic'

const VALID_ROLES = ['CEO', 'ADMIN', 'BROKER', 'DEVELOPER', 'SELLER', 'BUYER']

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    // Server-side authorization: CEO/ADMIN only (was completely unauthenticated).
    const { error, session, role: actorRole } = await requireCEOApi()
    if (error) return error
    const actorId = (session!.user as any)?.id as string

    const { id } = params
    const body = await req.json()
    const { role } = body

    if (!VALID_ROLES.includes(role)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
    }

    // Only an existing CEO may assign the CEO role — ADMIN callers get 403.
    if (role === 'CEO' && actorRole !== 'CEO') {
      return NextResponse.json({ error: 'Only a CEO can assign the CEO role' }, { status: 403 })
    }

    if (id === actorId) {
      return NextResponse.json(
        { error: 'Cannot change your own role' },
        { status: 400 }
      )
    }

    const user = await db.user.findUnique({ where: { id } })
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    await db.user.update({
      where: { id },
      data: { role },
    })

    // Audit trail for role escalations (previously left no trace).
    await logAudit({
      action: 'USER_ROLE_CHANGED',
      entity: 'User',
      entityId: id,
      userId: actorId,
      changes: { email: user.email, from: user.role, to: role },
    })

    return NextResponse.json({ success: true, message: 'Role updated' })
  } catch (error) {
    console.error('Update role error:', error)
    return NextResponse.json({ error: 'Failed to update role' }, { status: 500 })
  }
}
