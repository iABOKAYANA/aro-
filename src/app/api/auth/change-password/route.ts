import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { rateLimit } from '@/lib/rate-limit'

export async function POST(req: Request) {
  try {
    const session = await auth()
    const user = session?.user as any

    if (!session || !user?.id) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    // Brute-force throttle on the current-password check.
    const rl = rateLimit(`change-password:${user.id}`, { limit: 10, windowMs: 10 * 60_000 })
    if (!rl.ok) {
      return NextResponse.json(
        { error: 'Too many attempts. Please wait a moment and try again.' },
        {
          status: 429,
          headers: {
            'Retry-After': String(Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000))),
          },
        }
      )
    }

    const body = await req.json()
    const { currentPassword, newPassword } = body

    if (typeof currentPassword !== 'string' || typeof newPassword !== 'string') {
      return NextResponse.json({ error: 'Both passwords are required' }, { status: 400 })
    }
    if (!currentPassword || !newPassword) {
      return NextResponse.json({ error: 'Both passwords are required' }, { status: 400 })
    }

    if (newPassword.length < 10 || newPassword.length > 128) {
      return NextResponse.json({ error: 'Password must be 10–128 characters' }, { status: 400 })
    }

    const dbUser = await db.user.findUnique({ where: { id: user.id } })
    if (!dbUser || !dbUser.passwordHash) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const isCorrect = await bcrypt.compare(currentPassword, dbUser.passwordHash)
    if (!isCorrect) {
      return NextResponse.json({ error: 'Current password is incorrect' }, { status: 400 })
    }

    const newHash = await bcrypt.hash(newPassword, 12)
    await db.user.update({
      where: { id: user.id },
      data: { passwordHash: newHash },
    })

    return NextResponse.json({ success: true, message: 'Password changed successfully' })
  } catch (error) {
    console.error('Change password error:', error)
    return NextResponse.json({ error: 'Failed to change password' }, { status: 500 })
  }
}
