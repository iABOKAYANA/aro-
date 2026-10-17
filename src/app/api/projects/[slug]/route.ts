import { NextRequest, NextResponse } from 'next/server'

import { getProjectBySlug } from '@/lib/search'
import { getUnitsByType, maxDiscountOf } from '@/lib/units-by-type'
import { auth } from '@/lib/auth'
import { isPublicProject } from '@/lib/project-visibility'

export const dynamic = 'force-dynamic'

/**
 * GET /api/projects/[slug] — one project in full.
 *
 * The website never needed this: `src/app/(public)/projects/[slug]` is a server
 * component that calls `getProjectBySlug()` straight against the DB. The mobile
 * app is not a server component, so it needs an HTTP door to the same data —
 * this returns exactly what that page receives, no more and no less.
 *
 * Mobile contract keys (top-level siblings of `project`, additive only —
 * the `project` object itself is byte-identical to `getProjectBySlug()`):
 * - `unitsByType: [{ type, count, startingPrice, minArea, maxArea }]` —
 *   buyable (non-sample, AVAILABLE/Vacant) units grouped by raw
 *   `Unit.unitType`; `[]` when the project has no buyable units.
 * - `overview` (EN) / `overviewAr` (AR, may be null) — aliases of the
 *   existing `description` / `descriptionArabic` columns.
 * - `maxDiscount: number|null` — highest `cashDiscount` percent across the
 *   project's payment plans, null when no plan carries a discount.
 *
 * Drafts AND priceless projects stay hidden from the public: a project
 * must be `isActive` with `approvalStatus` PUBLISHED/APPROVED and a price
 * (startPrice>0 or a priced unit — see isPublicProject) unless the caller
 * is CEO/ADMIN — or the developer who owns it — previewing it.
 */
export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  try {
    const project = await getProjectBySlug(decodeURIComponent(params.slug))
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const isPublic = isPublicProject(project)

    if (!isPublic) {
      const session = await auth()
      const role = (session?.user as { role?: string } | undefined)?.role
      const userId = (session?.user as { id?: string } | undefined)?.id
      const privileged = role === 'CEO' || role === 'ADMIN'
      // `developerId` points at the DeveloperProfile, not the User — compare
      // through the included `developer.userId` or ownership checks silently fail.
      const isOwner = Boolean(userId && project.developer?.userId === userId)
      if (!privileged && !isOwner) {
        // Same 404 as a slug that does not exist — never confirm drafts exist.
        return NextResponse.json({ error: 'Project not found' }, { status: 404 })
      }
    }

    // Mobile contract aggregates (additive top-level keys — `project` itself
    // is untouched). One groupBy query, no N+1.
    const unitsByType = await getUnitsByType(project.id)
    const overview = project.overview ?? project.description ?? null
    const overviewAr = project.overviewAr ?? project.descriptionArabic ?? null
    const maxDiscount = maxDiscountOf(
      Array.isArray(project.paymentPlans) ? project.paymentPlans : []
    )
    const payload = { project, unitsByType, overview, overviewAr, maxDiscount }

    // Public projects are anonymous-identical → CDN-cacheable. Draft
    // previews vary per caller (CEO/ADMIN/owner see what anon gets 404
    // for), so they must NOT carry a public Cache-Control — a shared
    // cache entry would leak draft existence/content across users.
    if (isPublic) {
      return NextResponse.json(
        payload,
        { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' } }
      )
    }

    return NextResponse.json(payload)
  } catch (error) {
    console.error('Project detail error:', error)
    return NextResponse.json({ error: 'Failed to fetch project' }, { status: 500 })
  }
}
