import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireCEOApi, logAudit } from '@/lib/permissions'

export const dynamic = 'force-dynamic'

const VALID_STATUS = ['PENDING', 'ANSWERED', 'PUBLISHED', 'REJECTED']

/** GET /api/ceo/questions?status&slug — moderated Q&A queue. */
export async function GET(req: Request) {
  try {
    const { error } = await requireCEOApi()
    if (error) return error

    const { searchParams } = new URL(req.url)
    const status = searchParams.get('status')
    const slug = searchParams.get('slug')

    const where: Record<string, unknown> = {}
    if (status && VALID_STATUS.includes(status)) where.status = status
    if (slug) where.slug = slug

    const [items, counts] = await Promise.all([
      db.projectQuestion.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }],
        take: 200,
        select: {
          id: true, slug: true, name: true, phone: true, question: true,
          answer: true, status: true, createdAt: true,
          project: { select: { name: true, nameArabic: true } },
        },
      }),
      db.projectQuestion.groupBy({ by: ['status'], _count: { _all: true } }),
    ])

    const countMap: Record<string, number> = {}
    for (const c of counts) countMap[c.status] = c._count._all
    return NextResponse.json({ items, counts: countMap })
  } catch (err) {
    console.error('ceo questions GET error:', err)
    return NextResponse.json({ error: 'Failed to load questions' }, { status: 500 })
  }
}

/**
 * PATCH { id, answer?, status? } — answer and/or moderate one question.
 * PUBLISHED only with a non-empty answer. → updated row.
 */
export async function PATCH(req: Request) {
  try {
    const { error, session } = await requireCEOApi()
    if (error) return error

    const body = (await req.json().catch(() => ({}))) as { id?: unknown; answer?: unknown; status?: unknown }
    if (typeof body.id !== 'string') {
      return NextResponse.json({ error: 'id is required' }, { status: 400 })
    }
    if (body.status !== undefined && !VALID_STATUS.includes(body.status as string)) {
      return NextResponse.json({ error: `status must be one of ${VALID_STATUS.join(', ')}` }, { status: 400 })
    }

    const existing = await db.projectQuestion.findUnique({ where: { id: body.id } })
    if (!existing) return NextResponse.json({ error: 'Question not found' }, { status: 404 })

    const data: { answer?: string; status?: string } = {}
    if (typeof body.answer === 'string') {
      data.answer = body.answer.trim().slice(0, 2000) || undefined
    }
    if (typeof body.status === 'string') data.status = body.status
    // Publishing without an answer is not a thing — guard it.
    if (data.status === 'PUBLISHED' && !(data.answer || existing.answer)) {
      return NextResponse.json({ error: 'اكتب الإجابة الأول قبل النشر' }, { status: 400 })
    }
    if (data.status === 'PUBLISHED' && data.answer) data.status = 'PUBLISHED'
    else if (data.answer && !data.status && existing.status !== 'PUBLISHED') data.status = 'ANSWERED'

    const row = await db.projectQuestion.update({ where: { id: body.id }, data })

    await logAudit({
      userId: (session!.user as { id?: string })?.id,
      action: 'PROJECT_QUESTION_MODERATE',
      entity: 'PROJECT_QUESTION',
      entityId: row.id,
      changes: { status: row.status },
    })
    return NextResponse.json({ item: row })
  } catch (err) {
    console.error('ceo questions PATCH error:', err)
    return NextResponse.json({ error: 'Failed to update question' }, { status: 500 })
  }
}
