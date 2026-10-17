import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { auth } from '@/lib/auth'
import { inquirySchema } from '@/lib/validations'
import { getClientIp, rateLimit } from '@/lib/rate-limit'

function ipOf(req: Request): string {
  // Shared extractor (src/lib/rate-limit.ts) — signature kept, callers untouched.
  return getClientIp(req.headers)
}

export async function POST(req: Request) {
  try {
    const rl = rateLimit(`inquiries:${ipOf(req)}`, { limit: 10, windowMs: 60 * 60_000 })
    if (!rl.ok) {
      const retryAfter = Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000))
      return NextResponse.json(
        { error: 'Too many inquiries. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(retryAfter) } }
      )
    }
    const session = await auth()
    const body = await req.json().catch(() => null)

    // zod validation: invalid `type`/email → 400, never a Prisma 500.
    // Length caps keep bodies out of the DB.
    const parsed = inquirySchema.safeParse({
      name: typeof body?.name === 'string' ? body.name.trim().slice(0, 100) : body?.name,
      email: typeof body?.email === 'string' ? body.email.trim().slice(0, 254) : body?.email,
      phone: typeof body?.phone === 'string' ? body.phone.trim().slice(0, 30) : body?.phone,
      message: typeof body?.message === 'string' ? body.message.trim().slice(0, 2000) : body?.message,
      type: body?.type,
      unitId: body?.unitId,
    })
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Invalid input' },
        { status: 400 }
      )
    }
    const { name, email, phone, message, type, unitId } = parsed.data

    if (unitId) {
      const unit = await db.unit.findUnique({ where: { id: unitId }, select: { id: true } })
      if (!unit) return NextResponse.json({ error: 'Unit not found' }, { status: 404 })
    }

    const inquiry = await db.inquiry.create({
      data: {
        name,
        email: email || undefined,
        phone,
        message: message || undefined,
        type: type || 'GENERAL',
        unitId: unitId || undefined,
        userId: (session?.user as any)?.id || undefined,
      },
    })

    return NextResponse.json({
      message: 'Inquiry submitted successfully',
      id: inquiry.id,
    })
  } catch (error) {
    console.error('Inquiry error:', error)
    return NextResponse.json(
      { error: 'Failed to submit inquiry' },
      { status: 500 }
    )
  }
}

export async function GET(req: Request) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const status = searchParams.get('status')
    const rawPage = parseInt(searchParams.get('page') || '1', 10)
    const rawLimit = parseInt(searchParams.get('limit') || '20', 10)
    const page = Number.isFinite(rawPage) ? Math.max(1, rawPage) : 1
    const limit = Number.isFinite(rawLimit) ? Math.min(100, Math.max(1, rawLimit)) : 20

    const where: Record<string, unknown> = {}
    if (status) where.status = status

    // Scope by role, mirroring how the dashboard uses this endpoint.
    //
    // A broker sees only what was routed to them. CEO/ADMIN read the whole
    // inbox (the website's /dashboard/inquiries consumes it exactly this way).
    // A DEVELOPER sees only inquiries on their own projects: an Inquiry links
    // to a project exclusively through its unit (unit → project →
    // developerId), so general inquiries with no unit never match and stay
    // invisible to developers. The developer profile id is resolved
    // server-side from the session — never from client input.
    //
    // Everyone else — BUYER, USER, any unknown role — previously received the
    // **entire table**: every other customer's name, phone, email and message
    // body, from an endpoint with no role gate at all. An inquiry is
    // double-entry: it belongs to the person who sent it and to whoever it was
    // assigned to, so a plain user is now limited to rows they created. If
    // nothing matches `userId` there is simply nothing to show, which is the
    // correct answer for an account that has never submitted an inquiry.
    const role = (session.user as any).role as string | undefined
    if (role === 'BROKER') {
      where.assignedTo = (session.user as any).id
    } else if (role === 'DEVELOPER') {
      const profile = await db.developerProfile.findFirst({
        where: { userId: (session.user as any).id },
        select: { id: true },
      })
      if (!profile) {
        return NextResponse.json({ inquiries: [], total: 0, page, totalPages: 0 })
      }
      where.unit = { project: { developerId: profile.id } }
    } else if (role !== 'CEO' && role !== 'ADMIN') {
      where.userId = (session.user as any).id
    }

    const [inquiries, total] = await Promise.all([
      db.inquiry.findMany({
        where,
        include: {
          unit: {
            select: { name: true, slug: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.inquiry.count({ where }),
    ])

    return NextResponse.json({
      inquiries,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    })
  } catch (error) {
    console.error('Fetch inquiries error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch inquiries' },
      { status: 500 }
    )
  }
}
