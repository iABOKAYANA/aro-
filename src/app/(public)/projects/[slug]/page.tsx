import { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getProjectBySlug } from '@/lib/search'
import { getUnitsByType } from '@/lib/units-by-type'
import { isPublicProject } from '@/lib/project-visibility'
import { projectJsonLd, projectMetadata, type AreaRange } from '@/lib/seo'
import { ProjectDetail } from '@/components/projects/project-detail'
import { ProjectQA } from '@/components/projects/project-qa'

export const dynamic = 'force-dynamic'

interface ProjectPageProps {
  params: { slug: string }
}

/** Min/max buyable-inventory area for SEO copy — null when no priced units. */
async function listingArea(projectId: string): Promise<AreaRange | null> {
  try {
    const rows = await getUnitsByType(projectId)
    let min: number | null = null
    let max: number | null = null
    for (const r of rows) {
      if (typeof r.minArea === 'number' && r.minArea > 0) min = min === null ? r.minArea : Math.min(min, r.minArea)
      if (typeof r.maxArea === 'number' && r.maxArea > 0) max = max === null ? r.maxArea : Math.max(max, r.maxArea)
    }
    if (min === null && max === null) return null
    return { minArea: min, maxArea: max }
  } catch {
    return null
  }
}

export async function generateMetadata({ params }: ProjectPageProps): Promise<Metadata> {
  const project = await getProjectBySlug(params.slug, { representativeUnits: true })
  // Hidden/unapproved projects stay invisible (same 404 as missing) and
  // never leak metadata to crawlers.
  if (!project || !isPublicProject(project)) return { title: 'Project Not Found', robots: { index: false, follow: false } }
  const area = await listingArea(project.id)
  return projectMetadata(project, area)
}

export default async function ProjectPage({ params }: ProjectPageProps) {
  const project = await getProjectBySlug(params.slug, { representativeUnits: true })
  // Non-approved projects are invisible to the public (same 404 as missing).
  if (!project || !isPublicProject(project)) notFound()
  // Per-type buyable-inventory summary for the available-units section —
  // same helper (same semantics) as GET /api/projects/[slug].
  const unitsByType = await getUnitsByType(project.id)
  let min: number | null = null
  let max: number | null = null
  for (const r of unitsByType) {
    if (typeof r.minArea === 'number' && r.minArea > 0) min = min === null ? r.minArea : Math.min(min, r.minArea)
    if (typeof r.maxArea === 'number' && r.maxArea > 0) max = max === null ? r.maxArea : Math.max(max, r.maxArea)
  }
  const area: AreaRange | null = min === null && max === null ? null : { minArea: min, maxArea: max }
  // Real values only — the builder omits every null field, never fakes one.
  const jsonLd = projectJsonLd(project, area)
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <ProjectDetail project={project} unitsByType={unitsByType} />
      <ProjectQA slug={params.slug} />
    </>
  )
}
