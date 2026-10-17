import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { getClientIp, rateLimit } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

const contactSchema = z.object({
  name: z.string().trim().min(2, 'Name is required').max(100),
  email: z.string().trim().max(254).refine((v) => EMAIL_RE.test(v), 'Invalid email address'),
  phone: z.string().trim().max(30).optional().nullable(),
  subject: z.string().trim().max(200).optional().nullable(),
  message: z.string().trim().min(1, 'Message is required').max(2000),
})

function ipOf(req: NextRequest): string {
  // Shared extractor (src/lib/rate-limit.ts) — signature kept, callers untouched.
  return getClientIp(req.headers)
}

export async function POST(req: NextRequest) {
  try {
    const rl = rateLimit(`contact:${ipOf(req)}`, { limit: 10, windowMs: 60 * 60_000 })
    if (!rl.ok) {
      const retryAfter = Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000))
      return NextResponse.json(
        { error: 'Too many messages. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(retryAfter) } }
      )
    }
    const body = await req.json().catch(() => null)
    const parsed = contactSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Invalid input' },
        { status: 400 }
      )
    }
    const { name, email, phone, subject, message } = parsed.data

    const submission = await db.contactSubmission.create({
      data: {
        name,
        email,
        phone: phone || null,
        subject: subject || null,
        message,
        status: 'NEW',
      },
    })

    return NextResponse.json({ submission }, { status: 201 })
  } catch (error) {
    console.error('Contact form error:', error)
    return NextResponse.json({ error: 'Failed to submit contact form' }, { status: 500 })
  }
}
