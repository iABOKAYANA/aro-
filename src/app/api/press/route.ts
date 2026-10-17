import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { auth } from '@/lib/auth'
import { requireActor } from '@/lib/lead-access'
import { sanitizeHtml } from '@/lib/html-sanitize'

export const dynamic = 'force-dynamic'

/**
 * `?all=true` is the CEO/ADMIN management view: it drops the isPublished
 * filter so drafts can be listed. Public callers keep published-only data.
 */
async function wantsUnpublished(req: NextRequest): Promise<boolean> {
  if (req.nextUrl.searchParams.get('all') !== 'true') return false
  const session = await auth()
  const role = (session?.user as { role?: string } | undefined)?.role
  return role === 'CEO' || role === 'ADMIN'
}

export async function GET(req: NextRequest) {
  try {
    const rawPage = parseInt(req.nextUrl.searchParams.get('page') || '1', 10)
    const rawLimit = parseInt(req.nextUrl.searchParams.get('limit') || '12', 10)
    const page = Number.isFinite(rawPage) ? Math.max(1, rawPage) : 1
    const limit = Number.isFinite(rawLimit) ? Math.min(50, Math.max(1, rawLimit)) : 12
    const skip = (page - 1) * limit

    const where: Record<string, unknown> = (await wantsUnpublished(req)) ? {} : { isPublished: true }

    const [items, total] = await Promise.all([
      db.pressRelease.findMany({
        where,
        orderBy: { publishedAt: 'desc' },
        skip,
        take: limit,
      }),
      db.pressRelease.count({ where }),
    ])

    return NextResponse.json({
      items,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    })
  } catch (error) {
    console.error('Fetch press releases error:', error)
    return NextResponse.json({ error: 'Failed to fetch press releases' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    // Only CEO/ADMIN publish content — the public site never writes here.
    const gate = await requireActor(['CEO'])
    if (!gate.ok) return gate.response

    const body = await req.json()
    const { title, titleArabic, slug, excerpt, content, coverImage, source, sourceUrl, isPublished, publishedAt } = body

    if (!title || !slug || !content) {
      return NextResponse.json({ error: 'Title, slug, and content are required' }, { status: 400 })
    }

    const existing = await db.pressRelease.findUnique({ where: { slug } })
    if (existing) {
      return NextResponse.json({ error: 'A press release with this slug already exists' }, { status: 409 })
    }

    const pressRelease = await db.pressRelease.create({
      data: {
        title,
        titleArabic,
        slug,
        excerpt,
        // Sanitize on write: content is rendered as raw HTML on the public site.
        content: sanitizeHtml(content),
        coverImage,
        source,
        sourceUrl,
        isPublished: isPublished || false,
        publishedAt: isPublished ? (publishedAt ? new Date(publishedAt) : new Date()) : null,
      },
    })

    return NextResponse.json({ pressRelease }, { status: 201 })
  } catch (error) {
    console.error('Create press release error:', error)
    return NextResponse.json({ error: 'Failed to create press release' }, { status: 500 })
  }
}

/** CEO/ADMIN only — publish toggle + edits from /ceo/press. */
export async function PATCH(req: NextRequest) {
  try {
    const gate = await requireActor(['CEO'])
    if (!gate.ok) return gate.response

    const body = await req.json()
    const { id, ...rest } = body as Record<string, unknown>
    if (!id || typeof id !== 'string') {
      return NextResponse.json({ error: 'id is required' }, { status: 400 })
    }

    const existing = await db.pressRelease.findUnique({ where: { id }, select: { id: true, slug: true, publishedAt: true } })
    if (!existing) return NextResponse.json({ error: 'Release not found' }, { status: 404 })

    const data: {
      title?: string; titleArabic?: string | null; slug?: string; excerpt?: string | null
      content?: string; coverImage?: string | null; source?: string | null; sourceUrl?: string | null
      isPublished?: boolean; publishedAt?: Date | null
    } = {}

    if (typeof rest.title === 'string') data.title = rest.title
    if ('titleArabic' in rest) data.titleArabic = (rest.titleArabic as string) || null
    if (typeof rest.slug === 'string') data.slug = rest.slug
    if ('excerpt' in rest) data.excerpt = (rest.excerpt as string) || null
    if (typeof rest.content === 'string') data.content = sanitizeHtml(rest.content)
    if ('coverImage' in rest) data.coverImage = (rest.coverImage as string) || null
    if ('source' in rest) data.source = (rest.source as string) || null
    if ('sourceUrl' in rest) data.sourceUrl = (rest.sourceUrl as string) || null

    if ('isPublished' in rest) {
      const published = rest.isPublished === true
      data.isPublished = published
      if (published && !existing.publishedAt) {
        data.publishedAt = rest.publishedAt ? new Date(String(rest.publishedAt)) : new Date()
      }
      if (!published) data.publishedAt = null
    }

    if (data.slug && data.slug !== existing.slug) {
      const clash = await db.pressRelease.findUnique({ where: { slug: data.slug }, select: { id: true } })
      if (clash) return NextResponse.json({ error: 'A press release with this slug already exists' }, { status: 409 })
    }

    const pressRelease = await db.pressRelease.update({ where: { id }, data })
    return NextResponse.json({ pressRelease })
  } catch (error) {
    console.error('Update press release error:', error)
    return NextResponse.json({ error: 'Failed to update press release' }, { status: 500 })
  }
}

/** CEO/ADMIN only — removes a release permanently. */
export async function DELETE(req: NextRequest) {
  try {
    const gate = await requireActor(['CEO'])
    if (!gate.ok) return gate.response

    const id = req.nextUrl.searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

    const existing = await db.pressRelease.findUnique({ where: { id }, select: { id: true } })
    if (!existing) return NextResponse.json({ error: 'Release not found' }, { status: 404 })

    await db.pressRelease.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Delete press release error:', error)
    return NextResponse.json({ error: 'Failed to delete press release' }, { status: 500 })
  }
}
