import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'
import { requireCEOApi, logAudit } from '@/lib/permissions'
import { getClientIp, rateLimit } from '@/lib/rate-limit'
import { isValidImageUrl } from '@/lib/image-url'

export async function POST(req: Request) {
  try {
    // Unthrottled account-creation endpoint → enumeration + mass-creation.
    const rl = rateLimit(`ceo-create-user:${getClientIp(req.headers)}`, { limit: 20, windowMs: 60 * 60_000 })
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

    // Server-side authorization: CEO/ADMIN only (was completely unauthenticated).
    const { error, session } = await requireCEOApi()
    if (error) return error
    const actorId = (session!.user as any)?.id as string

    const body = await req.json()
    const { email, name, password, role, avatar } = body

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 })
    }
    if (typeof email !== 'string') {
      return NextResponse.json({ error: 'Invalid email address' }, { status: 400 })
    }
    const cleanEmail = email.trim().toLowerCase().slice(0, 254)
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(cleanEmail)) {
      return NextResponse.json({ error: 'Invalid email address' }, { status: 400 })
    }
    // Mirror registerSchema: reject weak secrets server-side.
    if (typeof password !== 'string' || password.length < 10 || password.length > 128) {
      return NextResponse.json({ error: 'Password must be 10–128 characters' }, { status: 400 })
    }

    // Check if user already exists
    const existingUser = await db.user.findUnique({ where: { email: cleanEmail } })
    if (existingUser) {
      return NextResponse.json({ error: 'A user with this email already exists' }, { status: 409 })
    }

    const validRoles = ['BUYER', 'BROKER', 'DEVELOPER', 'SELLER', 'ADMIN']
    const userRole = validRoles.includes(role) ? role : 'BUYER'

    // next/image throws on non-URL avatar values (e.g. an email pasted into
    // the field) — reject them here instead of storing garbage.
    const avatarRaw = typeof avatar === 'string' ? avatar.trim() : ''
    if (avatarRaw && !isValidImageUrl(avatarRaw)) {
      return NextResponse.json({ error: 'Avatar must be a valid image URL starting with http(s):// or /' }, { status: 400 })
    }

    const passwordHash = await bcrypt.hash(password, 12)

    const user = await db.user.create({
      data: {
        email: cleanEmail,
        avatar: avatarRaw ? avatarRaw : null,
        name: (typeof name === 'string' && name.trim() ? name.trim().slice(0, 120) : null) || cleanEmail.split('@')[0],
        passwordHash,
        role: userRole,
        status: 'ACTIVE',
        isActive: true,
        isVerified: true,
      },
    })

    // Create profile based on role
    if (userRole === 'BROKER') {
      await db.brokerProfile.create({ data: { userId: user.id } })
    } else if (userRole === 'DEVELOPER') {
      await db.developerProfile.create({ data: { userId: user.id, companyName: (typeof name === 'string' && name.trim() ? name.trim().slice(0, 120) : null) || cleanEmail.split('@')[0] } })
    } else {
      await db.userProfile.create({ data: { userId: user.id } })
    }

    await logAudit({
      action: 'USER_CREATED',
      entity: 'User',
      entityId: user.id,
      userId: actorId,
      changes: { email: user.email, name: user.name, role: userRole },
    })

    return NextResponse.json({
      success: true,
      message: 'Account created successfully',
      user: { id: user.id, email: user.email, name: user.name, role: userRole },
    }, { status: 201 })
  } catch (error) {
    console.error('Create user error:', error)
    return NextResponse.json({ error: 'Failed to create account' }, { status: 500 })
  }
}
