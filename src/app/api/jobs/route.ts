import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { auth } from '@/lib/auth'
import { requireActor } from '@/lib/lead-access'

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
    const department = req.nextUrl.searchParams.get('department')?.slice(0, 80) || null
    const type = req.nextUrl.searchParams.get('type')?.slice(0, 40) || null
    const skip = (page - 1) * limit

    const where: Record<string, unknown> = (await wantsUnpublished(req)) ? {} : { isPublished: true }
    if (department) where.department = department
    if (type) where.type = type

    const [items, total] = await Promise.all([
      db.job.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      db.job.count({ where }),
    ])

    return NextResponse.json({
      items,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    })
  } catch (error) {
    console.error('Fetch jobs error:', error)
    return NextResponse.json({ error: 'Failed to fetch jobs' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    // Only CEO/ADMIN publish jobs — the public site never writes here.
    const gate = await requireActor(['CEO'])
    if (!gate.ok) return gate.response

    const body = await req.json()
    const { title, titleArabic, slug, department, location, type, description, descriptionArabic, requirements, salaryMin, salaryMax, isPublished } = body

    if (!title || !slug || !department || !location || !description) {
      return NextResponse.json({ error: 'Title, slug, department, location, and description are required' }, { status: 400 })
    }

    const existing = await db.job.findUnique({ where: { slug } })
    if (existing) {
      return NextResponse.json({ error: 'A job with this slug already exists' }, { status: 409 })
    }

    const job = await db.job.create({
      data: {
        title,
        titleArabic,
        slug,
        department,
        location,
        type: type || 'FULL_TIME',
        description,
        descriptionArabic,
        requirements: requirements ? JSON.stringify(requirements) : '[]',
        salaryMin,
        salaryMax,
        isPublished: isPublished || false,
      },
    })

    return NextResponse.json({ job }, { status: 201 })
  } catch (error) {
    console.error('Create job error:', error)
    return NextResponse.json({ error: 'Failed to create job' }, { status: 500 })
  }
}

/** CEO/ADMIN only — publish toggle + edits from /ceo/jobs. */
export async function PATCH(req: NextRequest) {
  try {
    const gate = await requireActor(['CEO'])
    if (!gate.ok) return gate.response

    const body = await req.json()
    const { id, ...rest } = body as Record<string, unknown>
    if (!id || typeof id !== 'string') {
      return NextResponse.json({ error: 'id is required' }, { status: 400 })
    }

    const existing = await db.job.findUnique({ where: { id }, select: { id: true, slug: true } })
    if (!existing) return NextResponse.json({ error: 'Job not found' }, { status: 404 })

    const data: {
      title?: string; titleArabic?: string | null; slug?: string; department?: string
      location?: string; type?: string; description?: string; descriptionArabic?: string | null
      requirements?: string; salaryMin?: number | null; salaryMax?: number | null; isPublished?: boolean
    } = {}

    if (typeof rest.title === 'string') data.title = rest.title
    if ('titleArabic' in rest) data.titleArabic = (rest.titleArabic as string) || null
    if (typeof rest.slug === 'string') data.slug = rest.slug
    if (typeof rest.department === 'string') data.department = rest.department
    if (typeof rest.location === 'string') data.location = rest.location
    if (typeof rest.type === 'string') data.type = rest.type
    if (typeof rest.description === 'string') data.description = rest.description
    if ('descriptionArabic' in rest) data.descriptionArabic = (rest.descriptionArabic as string) || null
    if ('requirements' in rest) data.requirements = rest.requirements ? String(rest.requirements) : '[]'
    if ('salaryMin' in rest) data.salaryMin = rest.salaryMin === null || rest.salaryMin === '' ? null : Number(rest.salaryMin)
    if ('salaryMax' in rest) data.salaryMax = rest.salaryMax === null || rest.salaryMax === '' ? null : Number(rest.salaryMax)
    if ('isPublished' in rest) data.isPublished = rest.isPublished === true

    if (data.slug && data.slug !== existing.slug) {
      const clash = await db.job.findUnique({ where: { slug: data.slug }, select: { id: true } })
      if (clash) return NextResponse.json({ error: 'A job with this slug already exists' }, { status: 409 })
    }

    const job = await db.job.update({ where: { id }, data })
    return NextResponse.json({ job })
  } catch (error) {
    console.error('Update job error:', error)
    return NextResponse.json({ error: 'Failed to update job' }, { status: 500 })
  }
}

/** CEO/ADMIN only. 409 when applications already reference the job. */
export async function DELETE(req: NextRequest) {
  try {
    const gate = await requireActor(['CEO'])
    if (!gate.ok) return gate.response

    const id = req.nextUrl.searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

    const existing = await db.job.findUnique({ where: { id }, select: { id: true, _count: { select: { applications: true } } } })
    if (!existing) return NextResponse.json({ error: 'Job not found' }, { status: 404 })

    if (existing._count.applications > 0) {
      return NextResponse.json(
        { error: `Cannot delete — ${existing._count.applications} application(s) are linked to this job.` },
        { status: 409 }
      )
    }

    await db.job.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Delete job error:', error)
    return NextResponse.json({ error: 'Failed to delete job' }, { status: 500 })
  }
}
