import { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { JourneyViewTracker } from '@/components/projects/project-transparency'
import { db } from '@/lib/db'
import { SITE_URL, languageAlternates } from '@/lib/site'
import { absoluteImage } from '@/lib/seo'
import UnitView from './unit-view'

export const dynamic = 'force-dynamic'

interface UnitPageProps {
  params: { slug: string }
}

/* Resolve the [slug] segment as EITHER the unit's slug or its raw id.
 * Links across the app are built as `/units/${unit.slug || unit.id}`, and
 * imported inventory rows mostly have slug: null — so unit-id URLs are the
 * norm, not an edge case (owner hit "Unit Not Found" on every such link).
 * cuid pattern: 'c' + 24 base-alphanumeric chars. */
const CUID_RE = /^c[a-z0-9]{24}$/

function unitWhere(key: string) {
  return CUID_RE.test(key) ? { id: key } : { slug: key }
}

export async function generateMetadata({ params }: UnitPageProps): Promise<Metadata> {
  const unit = await db.unit.findUnique({
    where: unitWhere(params.slug),
    include: { project: { select: { name: true, slug: true, coverImage: true } } },
  })
  if (!unit) return { title: 'Unit Not Found', robots: { index: false, follow: false } }
  const title = unit.metaTitle || `${unit.project.name} - ${unit.name} | GHAYA REAL ESTATE`
  const description =
    unit.metaDescription ||
    `${unit.unitType} unit in ${unit.project.name}${unit.area > 0 ? `, ${unit.area}sqm` : ''} at ${unit.price.toLocaleString('en-US')} EGP.`
  const cover = absoluteImage(unit.project.coverImage) ?? `${SITE_URL}/images/ghaya-logo.png`
  const canonical = unit.slug || unit.id
  const url = `${SITE_URL}/units/${canonical}`
  return {
    title,
    description,
    alternates: languageAlternates(`/units/${canonical}`),
    openGraph: {
      title,
      description,
      url,
      images: [{ url: cover, alt: `${unit.project.name} - ${unit.name}` }],
    },
    twitter: { card: 'summary_large_image', title, description, images: [cover] },
  }
}

export default async function UnitPage({ params }: UnitPageProps) {
  const unit = await db.unit.findUnique({
    where: unitWhere(params.slug),
    include: {
      project: {
        select: { id: true, name: true, slug: true, coverImage: true, city: { select: { name: true } } },
      },
      phase: { select: { name: true } },
    },
  })
  if (!unit) notFound()

  // Canonicalize: an id URL for a slug-bearing unit 301s to the slug URL so
  // links, sitemaps and og:url stay canonical (no duplicate-indexable pages).
  if (unit.slug && unit.slug !== params.slug) redirect(`/units/${unit.slug}`)

  let gallery: string[] = []
  try {
    const parsed = typeof unit.gallery === 'string' ? JSON.parse(unit.gallery) : unit.gallery
    if (Array.isArray(parsed)) gallery = parsed.filter((u: unknown) => typeof u === 'string')
  } catch {
    gallery = []
  }

  return (
    <>
      {/* F6: journey view tracking (fire-and-forget) */}
      <JourneyViewTracker type="UNIT_VIEW" entityId={unit.id} />
      <UnitView unit={unit} gallery={gallery} />
    </>
  )
}
