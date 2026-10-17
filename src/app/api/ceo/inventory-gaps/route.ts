import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireCEOApi } from '@/lib/permissions'

export const dynamic = 'force-dynamic'

// Max projects scanned per request — sane cap so one click can't OOM the server.
const MAX_PROJECTS = 500

export type GapKey =
  | 'cover'
  | 'gallery'
  | 'descAr'
  | 'price'
  | 'units'
  | 'plans'
  | 'location'
  | 'arabic-name'

const GAP_KEYS: GapKey[] = [
  'cover',
  'gallery',
  'descAr',
  'price',
  'units',
  'plans',
  'location',
  'arabic-name',
]

function parseGallery(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw
  if (typeof raw !== 'string' || !raw.trim()) return []
  try {
    const p = JSON.parse(raw)
    return Array.isArray(p) ? p : []
  } catch {
    return []
  }
}

// ─── GET /api/ceo/inventory-gaps ─────────────────────────────
// CEO/ADMIN only. Read-only: per-project "what's missing" checklist +
// global rollups. No writes, no secrets (explicit safe scalars only).
export async function GET() {
  try {
    const { error } = await requireCEOApi()
    if (error) return error

    const totalMatching = await db.project.count({
      where: { approvalStatus: { not: 'ARCHIVED' } },
    })

    const rows = await db.project.findMany({
      where: { approvalStatus: { not: 'ARCHIVED' } },
      orderBy: { updatedAt: 'desc' },
      take: MAX_PROJECTS + 1,
      select: {
        id: true,
        slug: true,
        name: true,
        nameArabic: true,
        coverImage: true,
        gallery: true,
        descriptionArabic: true,
        startPrice: true,
        endPrice: true,
        cityId: true,
        governorateId: true,
        districtId: true,
        latitude: true,
        longitude: true,
        lat: true,
        lng: true,
        _count: { select: { units: true, paymentPlans: true } },
      },
    })

    const capped = rows.length > MAX_PROJECTS
    const projects = capped ? rows.slice(0, MAX_PROJECTS) : rows

    // Real (non-sample) unit counts per project — one grouped query, no N+1.
    const realUnitGroups = await db.unit.groupBy({
      by: ['projectId'],
      where: {
        isSample: false,
        projectId: { in: projects.map((p) => p.id) },
      },
      _count: { id: true },
    })
    const realUnitsByProject = new Map(
      realUnitGroups.map((g) => [g.projectId, g._count.id])
    )

    const gaps = projects.map((p) => {
      const missing: GapKey[] = []
      if (!p.coverImage?.trim()) missing.push('cover')
      if (parseGallery(p.gallery).length === 0) missing.push('gallery')
      if (!p.descriptionArabic?.trim()) missing.push('descAr')
      if (p.startPrice === null && p.endPrice === null) missing.push('price')
      const realUnits = realUnitsByProject.get(p.id) ?? 0
      if (realUnits === 0) missing.push('units')
      if (p._count.paymentPlans === 0) missing.push('plans')
      const hasLocation =
        !!p.cityId ||
        !!p.governorateId ||
        !!p.districtId ||
        p.latitude !== null ||
        p.longitude !== null ||
        p.lat !== null ||
        p.lng !== null
      if (!hasLocation) missing.push('location')
      if (!p.nameArabic?.trim()) missing.push('arabic-name')
      return {
        projectId: p.id,
        slug: p.slug,
        name: p.name,
        nameArabic: p.nameArabic,
        missing,
        gapCount: missing.length,
        units: realUnits,
        unitsTotal: p._count.units,
        plans: p._count.paymentPlans,
      }
    })

    const gapsByKey = Object.fromEntries(GAP_KEYS.map((k) => [k, 0])) as Record<GapKey, number>
    for (const g of gaps) for (const k of g.missing) gapsByKey[k] += 1

    const [
      unitsTotal,
      blogPublished,
      blogDraft,
      pressPublished,
      pressDraft,
      jobsPublished,
      jobsDraft,
      reviewsTotal,
      arabicNames,
    ] = await Promise.all([
      db.unit.count({ where: { isSample: false } }),
      db.blog.count({ where: { isPublished: true } }),
      db.blog.count({ where: { isPublished: false } }),
      db.pressRelease.count({ where: { isPublished: true } }),
      db.pressRelease.count({ where: { isPublished: false } }),
      db.job.count({ where: { isPublished: true } }),
      db.job.count({ where: { isPublished: false } }),
      db.review.count(),
      db.project.count({
        where: {
          approvalStatus: { not: 'ARCHIVED' },
          NOT: [{ nameArabic: null }, { nameArabic: '' }],
        },
      }),
    ])

    const projectsTotal = totalMatching
    return NextResponse.json({
      projects: gaps,
      rollup: {
        projectsTotal,
        projectsWithoutUnits: gapsByKey.units,
        projectsWithoutCovers: gapsByKey.cover,
        unitsTotal,
        gapsByKey,
        completeCount: gaps.filter((g) => g.gapCount === 0).length,
        contentCounts: {
          blog: { published: blogPublished, draft: blogDraft, total: blogPublished + blogDraft },
          press: { published: pressPublished, draft: pressDraft, total: pressPublished + pressDraft },
          jobs: { published: jobsPublished, draft: jobsDraft, total: jobsPublished + jobsDraft },
        },
        reviewsTotal,
        arabicCoveragePct:
          projectsTotal > 0 ? Math.round((arabicNames / projectsTotal) * 1000) / 10 : 0,
      },
      meta: {
        totalMatching,
        returned: projects.length,
        capped,
        cap: MAX_PROJECTS,
        scannedAt: new Date().toISOString(),
      },
    })
  } catch (e) {
    console.error('Inventory gaps fetch error:', e)
    return NextResponse.json({ error: 'Failed to load inventory gaps' }, { status: 500 })
  }
}
