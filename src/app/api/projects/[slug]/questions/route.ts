import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getClientIp, rateLimit } from '@/lib/rate-limit'
import { getFeatureFlags } from '@/lib/feature-flags'

export const dynamic = 'force-dynamic'

/**
 * GET /api/projects/[slug]/questions — approved Q&A for the public project page.
 * POST — ask a new question (public, rate-limited 3/hr/IP): lands as PENDING
 * in the CEO queue; nothing shows on the site until the owner answers+publishes.
 */

const NAME_MAX = 60
const PHONE_MAX = 20
const QUESTION_MAX = 500

export async function GET(_req: Request, { params }: { params: { slug: string } }) {
  try {
    const flags = await getFeatureFlags()
    if (!flags.project_qa) return NextResponse.json({ questions: [] })

    const rows = await db.projectQuestion.findMany({
      where: { slug: params.slug, status: 'PUBLISHED' },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: { id: true, name: true, question: true, answer: true, createdAt: true },
    })
    return NextResponse.json({ questions: rows })
  } catch (err) {
    console.error('project questions GET error:', err)
    return NextResponse.json({ error: 'Failed to load questions' }, { status: 500 })
  }
}

export async function POST(req: Request, { params }: { params: { slug: string } }) {
  try {
    const flags = await getFeatureFlags()
    if (!flags.project_qa) {
      return NextResponse.json({ error: 'Q&A is currently disabled' }, { status: 403 })
    }

    const ip = getClientIp(req.headers)
    const rl = rateLimit(`qa:${ip}`, { limit: 3, windowMs: 60 * 60_000 })
    if (!rl.ok) {
      return NextResponse.json({ error: 'انت بعت أسئلة كتير — جرّب بكرة.' }, { status: 429 })
    }

    const project = await db.project.findFirst({
      where: { slug: params.slug, isActive: true, approvalStatus: { in: ['APPROVED', 'PUBLISHED'] } },
      select: { id: true, slug: true },
    })
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

    const body = (await req.json().catch(() => ({}))) as {
      name?: unknown
      phone?: unknown
      question?: unknown
    }
    const name = typeof body.name === 'string' ? body.name.trim().slice(0, NAME_MAX) : ''
    const phone = typeof body.phone === 'string' ? body.phone.trim().slice(0, PHONE_MAX) : ''
    const question = typeof body.question === 'string' ? body.question.trim().slice(0, QUESTION_MAX) : ''

    if (name.length < 2) return NextResponse.json({ error: 'اكتب اسمك' }, { status: 400 })
    if (question.length < 5) return NextResponse.json({ error: 'اكتب سؤال واضح (5 حروف على الأقل)' }, { status: 400 })

    const row = await db.projectQuestion.create({
      data: {
        projectId: project.id,
        slug: project.slug,
        name,
        phone: phone || null,
        question,
        status: 'PENDING',
      },
    })
    return NextResponse.json({ ok: true, id: row.id }, { status: 201 })
  } catch (err) {
    console.error('project questions POST error:', err)
    return NextResponse.json({ error: 'Failed to submit question' }, { status: 500 })
  }
}
