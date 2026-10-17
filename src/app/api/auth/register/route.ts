import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'
import { registerSchema } from '@/lib/validations'
import { getClientIp, rateLimit } from '@/lib/rate-limit'

export async function POST(req: Request) {
  try {
    // Invitation-token guessing + account-enumeration throttle.
    const rl = rateLimit(`register:${getClientIp(req.headers)}`, { limit: 10, windowMs: 60 * 60_000 })
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
    const result = registerSchema.safeParse(body)

    if (!result.success) {
      return NextResponse.json(
        { error: result.error.errors[0].message },
        { status: 400 }
      )
    }

    const { name, email, phone, password, role } = result.data

    // Check for valid invitation token
    const token = typeof body.token === 'string' ? body.token : ''
    if (!token) {
      return NextResponse.json(
        { error: 'Invitation token is required. You must be invited to register.' },
        { status: 403 }
      )
    }

    const invitation = await db.invitation.findUnique({
      where: { token },
    })

    if (!invitation) {
      return NextResponse.json(
        { error: 'Invalid invitation token.' },
        { status: 403 }
      )
    }

    if (invitation.status !== 'PENDING') {
      return NextResponse.json(
        { error: 'This invitation has already been used or revoked.' },
        { status: 403 }
      )
    }

    if (new Date(invitation.expiresAt) < new Date()) {
      return NextResponse.json(
        { error: 'This invitation has expired.' },
        { status: 403 }
      )
    }

    // Email must match invitation
    if (invitation.email.toLowerCase() !== email.toLowerCase()) {
      return NextResponse.json(
        { error: 'Email does not match the invitation.' },
        { status: 403 }
      )
    }

    const existingUser = await db.user.findFirst({
      where: { OR: [{ email }, ...(phone ? [{ phone }] : [])] },
    })

    if (existingUser) {
      return NextResponse.json(
        { error: 'An account with this email already exists' },
        { status: 409 }
      )
    }

    const passwordHash = await bcrypt.hash(password, 12)

    const user = await db.user.create({
      data: {
        name,
        email,
        phone: phone || undefined,
        passwordHash,
        role: invitation.role,
        status: 'ACTIVE',
        isActive: true,
      },
    })

    // Create profile based on role
    if (invitation.role === 'BROKER') {
      await db.brokerProfile.create({
        data: { userId: user.id },
      })
    } else if (invitation.role === 'DEVELOPER') {
      await db.developerProfile.create({
        data: { userId: user.id, companyName: name },
      })
    } else {
      await db.userProfile.create({
        data: { userId: user.id },
      })
    }

    // Mark invitation as accepted
    await db.invitation.update({
      where: { id: invitation.id },
      data: {
        status: 'ACCEPTED',
        acceptedAt: new Date(),
        invitedUserId: user.id,
      },
    })

    return NextResponse.json({
      message: 'Account created successfully',
      user: { id: user.id, name: user.name, email: user.email },
    })
  } catch (error) {
    console.error('Registration error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
