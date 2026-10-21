import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { ingestUrl, ingestAllDeveloperSites } from '@/lib/ai-ingest'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

async function requireCEO() {
  const session = await auth()
  const role = (session?.user as any)?.role
  return role === 'CEO' || role === 'ADMIN'
}

/** GET — list learned chunks + per-domain stats. */
export async function GET(req: NextRequest) {
  if (!(await requireCEO())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const search = req.nextUrl.searchParams.get('search')?.trim() || ''

  const chunks = await db.aIKnowledge.findMany({
    where: search
      ? { isActive: true, OR: [{ title: { contains: search } }, { url: { contains: search } }, { content: { contains: search } }] }
      : { isActive: true },
    select: { id: true, title: true, url: true, source: true, wordCount: true, updatedAt: true },
    orderBy: { updatedAt: 'desc' },
    take: 100,
  })

  const all = await db.aIKnowledge.groupBy({ by: ['source'], _count: { _all: true } })
  const domains = await db.aIKnowledge.findMany({
    where: { isActive: true },
    select: { url: true },
    distinct: ['url'],
  })
  const hostCounts: Record<string, number> = {}
  for (const d of domains) {
    try {
      const host = new URL(d.url.replace(/#c\d+$/, '')).hostname
      hostCounts[host] = (hostCounts[host] || 0) + 1
    } catch { /* skip malformed */ }
  }

  return NextResponse.json({
    chunks,
    stats: {
      bySource: all.map((a) => ({ source: a.source, count: a._count._all })),
      hostCounts,
      total: await db.aIKnowledge.count({ where: { isActive: true } }),
    },
  })
}

/** POST — { url } trains a single page, { retrainAll } re-ingests everything. */
export async function POST(req: NextRequest) {
  if (!(await requireCEO())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => null)

  if (body?.retrainAll === true) {
    const res = await ingestAllDeveloperSites()
    return NextResponse.json({ ok: true, ...res })
  }

  if (typeof body?.url !== 'string') {
    return NextResponse.json({ error: 'url required' }, { status: 400 })
  }
  const res = await ingestUrl(body.url, body?.source === 'own-site' ? 'own-site' : 'developer-site')
  if (res.error) return NextResponse.json(res, { status: 400 })
  return NextResponse.json({ ok: true, ...res })
}

/** DELETE — deactivate a chunk { id }. */
export async function DELETE(req: NextRequest) {
  if (!(await requireCEO())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => null)
  if (typeof body?.id !== 'string') return NextResponse.json({ error: 'id required' }, { status: 400 })
  await db.aIKnowledge.update({ where: { id: body.id }, data: { isActive: false } })
  return NextResponse.json({ ok: true })
}
