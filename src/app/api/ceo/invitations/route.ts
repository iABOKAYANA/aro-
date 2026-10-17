import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireCEOApi, logAudit } from '@/lib/permissions'
import { getClientIp, rateLimit } from '@/lib/rate-limit'
import crypto from 'crypto'
import bcrypt from 'bcryptjs'

export const dynamic = 'force-dynamic'

function throttle(req: Request, bucket: string) {
  const rl = rateLimit(`${bucket}:${getClientIp(req.headers)}`, { limit: 30, windowMs: 60 * 60_000 })
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
  return null
}

export async function GET(req: Request) {
  try {
    const limited = throttle(req, 'ceo-invitations-read')
    if (limited) return limited
    const { error } = await requireCEOApi()
    if (error) return error

    const { searchParams } = new URL(req.url)
    const status = searchParams.get('status')

    const where: Record<string, unknown> = {}
    if (status) where.status = status

    const invitations = await db.invitation.findMany({
      where,
      include: {
        sender: { select: { id: true, name: true, email: true } },
        invitedUser: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({ invitations })
  } catch (error) {
    console.error('Fetch invitations error:', error)
    return NextResponse.json({ error: 'Failed to fetch invitations' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const limited = throttle(req, 'ceo-invitations-send')
    if (limited) return limited
    const { error, session } = await requireCEOApi()
    if (error) return error

    const body = await req.json()
    const { email, role, message, password } = body
    if (typeof email !== 'string' || typeof role !== 'string' || !email || !role) {
      return NextResponse.json({ error: 'Email and role are required' }, { status: 400 })
    }
    const cleanEmail = email.trim().toLowerCase().slice(0, 254)
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(cleanEmail)) {
      return NextResponse.json({ error: 'Invalid email address' }, { status: 400 })
    }
    if (message !== undefined && message !== null && typeof message !== 'string') {
      return NextResponse.json({ error: 'Invalid message' }, { status: 400 })
    }
    const cleanMessage = typeof message === 'string' && message.trim() ? message.trim().slice(0, 2000) : null
    // New-password floor is 10 (mirrors registerSchema): this password
    // directly creates a user below, so the direct-create path gets the
    // same check — previously only min-6 was enforced here.
    if (password !== undefined && password !== null && (typeof password !== 'string' || password.length < 10 || password.length > 128)) {
      return NextResponse.json({ error: 'Password must be 10–128 characters' }, { status: 400 })
    }

    const validRoles = ['BROKER', 'DEVELOPER', 'SELLER', 'ADMIN', 'BUYER']
    if (!validRoles.includes(role)) {
      return NextResponse.json({ error: `Invalid role. Must be one of: ${validRoles.join(', ')}` }, { status: 400 })
    }

    const existingUser = await db.user.findUnique({ where: { email: cleanEmail } })
    if (existingUser) {
      // Generic conflict: identical message + status for both conflict cases
      // so the response does not reveal which one matched.
      return NextResponse.json({ error: 'This email cannot be invited at this time' }, { status: 409 })
    }

    const existingPending = await db.invitation.findFirst({
      where: { email: cleanEmail, status: 'PENDING' },
    })
    if (existingPending) {
      return NextResponse.json({ error: 'This email cannot be invited at this time' }, { status: 409 })
    }

    const token = crypto.randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

    const invitation = await db.invitation.create({
      data: {
        email: cleanEmail,
        role,
        token,
        senderId: (session!.user as any).id,
        message: cleanMessage,
        status: 'PENDING',
        expiresAt,
      },
    })

    if (password) {
      const tempPassword = password
      const passwordHash = await bcrypt.hash(tempPassword, 12)

      const user = await db.user.create({
        data: {
          email: cleanEmail,
          name: cleanEmail.split('@')[0],
          passwordHash,
          role,
          status: 'ACTIVE',
          isActive: true,
          isVerified: true,
        },
      })

      if (role === 'DEVELOPER') {
        await db.developerProfile.create({
          data: { userId: user.id, companyName: cleanEmail.split('@')[0] + ' Development' },
        })
      } else if (role === 'BROKER') {
        await db.brokerProfile.create({ data: { userId: user.id } })
      } else if (role === 'SELLER') {
        await db.sellerProfile.create({ data: { userId: user.id } })
      }

      await db.invitation.update({
        where: { id: invitation.id },
        data: { status: 'ACCEPTED', acceptedAt: new Date(), invitedUserId: user.id },
      })

      await logAudit({
        action: 'USER_INVITED_AND_CREATED',
        entity: 'Invitation',
        entityId: invitation.id,
        userId: (session!.user as any).id,
        changes: { email: cleanEmail, role, createdUserId: user.id },
      })

      return NextResponse.json({
        success: true,
        message: `User created for ${cleanEmail}. Share the password through a secure channel.`,
        invitation,
      })
    }

    await logAudit({
      action: 'USER_INVITED',
      entity: 'Invitation',
      entityId: invitation.id,
      userId: (session!.user as any).id,
      changes: { email: cleanEmail, role },
    })

    return NextResponse.json({ success: true, invitation }, { status: 201 })
  } catch (error) {
    console.error('Create invitation error:', error)
    return NextResponse.json({ error: 'Failed to create invitation' }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  try {
    const limited = throttle(req, 'ceo-invitations-revoke')
    if (limited) return limited
    const { error, session } = await requireCEOApi()
    if (error) return error

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'Invitation ID required' }, { status: 400 })

    const invitation = await db.invitation.findUnique({ where: { id } })
    if (!invitation) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    await db.invitation.update({
      where: { id },
      data: { status: 'REVOKED' },
    })

    await logAudit({
      action: 'INVITATION_REVOKED',
      entity: 'Invitation',
      entityId: id,
      userId: (session!.user as any).id,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Revoke invitation error:', error)
    return NextResponse.json({ error: 'Failed to revoke invitation' }, { status: 500 })
  }
}
