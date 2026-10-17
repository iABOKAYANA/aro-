import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireCEOApi } from '@/lib/permissions'
import { getClientIp, rateLimit } from '@/lib/rate-limit'
import crypto from 'crypto'

export async function POST(req: Request) {
  try {
    // Unthrottled invite endpoint → sender-enumeration + mail-bombing.
    const rl = rateLimit(`invite:${getClientIp(req.headers)}`, { limit: 20, windowMs: 60 * 60_000 })
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

    const { error, session } = await requireCEOApi()
    if (error) return error
    const userId = (session!.user as any)?.id as string | undefined
    if (!userId) {
      return NextResponse.json(
        { error: 'You must be logged in to send invitations.' },
        { status: 401 }
      )
    }

    // Get user and check role (requireCEOApi already gated CEO/ADMIN,
    // re-fetch to keep the original status/isActive hardening).
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, status: true, isActive: true },
    })

    if (!user || (user.role !== 'CEO' && user.role !== 'ADMIN')) {
      return NextResponse.json(
        { error: 'Only administrators can send invitations.' },
        { status: 403 }
      )
    }

    const body = await req.json()
    const { email, role, message } = body

    if (!email || typeof email !== 'string') {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      )
    }
    const cleanEmail = email.trim().toLowerCase().slice(0, 254)
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(cleanEmail)) {
      return NextResponse.json(
        { error: 'Invalid email address' },
        { status: 400 }
      )
    }
    if (message !== undefined && message !== null && typeof message !== 'string') {
      return NextResponse.json(
        { error: 'Invalid message' },
        { status: 400 }
      )
    }
    const cleanMessage = typeof message === 'string' && message.trim() ? message.trim().slice(0, 2000) : null

    // Conflict check 1: account present
    const existingUser = await db.user.findUnique({ where: { email: cleanEmail } })
    if (existingUser) {
      // Generic conflict: identical message + status for both conflict cases
      // so the response does not reveal which one matched.
      return NextResponse.json(
        { error: 'This email cannot be invited at this time' },
        { status: 409 }
      )
    }

    // Conflict check 2: outstanding invite
    const existingInvitation = await db.invitation.findFirst({
      where: { email: cleanEmail, status: 'PENDING' },
    })
    if (existingInvitation) {
      return NextResponse.json(
        { error: 'This email cannot be invited at this time' },
        { status: 409 }
      )
    }

    const validRoles = ['BUYER', 'BROKER', 'DEVELOPER', 'SELLER']
    const invitationRole = validRoles.includes(role) ? role : 'BUYER'

    // Generate unique token
    const token = crypto.randomBytes(32).toString('hex')

    // Create invitation (expires in 7 days)
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 7)

    const invitation = await db.invitation.create({
      data: {
        email: cleanEmail,
        role: invitationRole,
        token,
        senderId: user.id,
        message: cleanMessage,
        expiresAt,
      },
    })

    // Generate registration link
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'
    const registrationLink = `${baseUrl}/auth/register?token=${token}`

    // Log without the token: the link itself is returned to the CEO caller.
    console.log(`Invitation created for ${cleanEmail} (id ${invitation.id})`)

    // Fail-soft invitation email: with no RESEND_API_KEY / SMTP_* configured
    // the mailer persists the message to data/outbox (see
    // lib/mailer) and the CEO outbox page (/ceo/outbox) surfaces it for
    // manual follow-up. The invitation ALWAYS succeeds — the caller shares
    // registrationLink either way, so mail must never break this flow.
    let emailDriver = 'none'
    try {
      const { sendMail, mailHtml, escapeHtml } = await import('@/lib/mailer')
      const sent = await sendMail({
        to: cleanEmail,
        subject: 'You’re invited to GHAYA REAL ESTATE',
        text: [
          `You've been invited to join GHAYA REAL ESTATE as ${invitationRole}.`,
          cleanMessage ? `Message from the team: ${cleanMessage}` : null,
          `Register here (expires in 7 days): ${registrationLink}`,
          'If email delivery is not configured, your inviter can share this link with you directly.',
        ]
          .filter(Boolean)
          .join('\n\n'),
        html: mailHtml({
          heading: 'You’re invited to GHAYA REAL ESTATE',
          body: `<p>You've been invited to join as <strong>${escapeHtml(invitationRole)}</strong>.</p>${cleanMessage ? `<p style="color:#64748b;font-style:italic">“${escapeHtml(cleanMessage)}”</p>` : ''}<p>This link expires in 7 days. If the button doesn't work, copy this address into your browser:<br><span style="font-size:13px;color:#64748b">${escapeHtml(registrationLink)}</span></p>`,
          cta: { label: 'Accept invitation', href: registrationLink },
        }),
        meta: { invitationId: invitation.id, role: invitationRole },
      })
      emailDriver = sent.driver
      if (!sent.ok) console.error('[invite] invitation email failed:', sent.error)
    } catch (e) {
      console.error('[invite] invitation email attempt failed:', e instanceof Error ? e.message : String(e))
    }

    return NextResponse.json({
      success: true,
      message: 'Invitation sent successfully',
      invitation: {
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        expiresAt: invitation.expiresAt,
      },
      registrationLink,
      emailDriver,
    }, { status: 201 })
  } catch (error) {
    console.error('Invite error:', error)
    return NextResponse.json(
      { error: 'Failed to send invitation' },
      { status: 500 }
    )
  }
}

// Get all invitations — CEO/ADMIN only. Never selects the `token` column
// (plaintext invitation secrets must not leave the server).
export async function GET() {
  try {
    const { error } = await requireCEOApi()
    if (error) return error
    const invitations = await db.invitation.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        role: true,
        status: true,
        message: true,
        expiresAt: true,
        acceptedAt: true,
        createdAt: true,
        senderId: true,
        invitedUserId: true,
        sender: { select: { name: true, email: true } },
        invitedUser: { select: { name: true, email: true } },
      },
    })

    return NextResponse.json({ invitations })
  } catch (error) {
    console.error('Fetch invitations error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch invitations' },
      { status: 500 }
    )
  }
}
