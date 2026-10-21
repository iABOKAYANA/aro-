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
  // Suffix once, exactly: metaTitle may or may not end with the brand, and the
  // root layout template would otherwise stack "| GHAYA REAL ESTATE" on top of
  // an already-suffixed string (the doubled title seen on /units pages).
  const rawTitle = unit.metaTitle || `${unit.project.name} - ${unit.name}`
  const title = rawTitle.includes('| GHAYA REAL ESTATE') ? rawTitle : `${rawTitle} | GHAYA REAL ESTATE`
  const description =
    unit.metaDescription ||
    `${unit.unitType} unit in ${unit.project.name}${unit.area > 0 ? `, ${unit.area}sqm` : ''} at ${unit.price.toLocaleString('en-US')} EGP.`
  const cover = absoluteImage(unit.project.coverImage) ?? `${SITE_URL}/images/ghaya-logo.png`
  const canonical = unit.slug || unit.id
  const url = `${SITE_URL}/units/${canonical}`
  return {
    // absolute: title already carries exactly one "| GHAYA REAL ESTATE" suffix.
    title: { absolute: title },
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

  // Price history for the trend chart (oldest→newest; may be empty).
  const priceHistory = await db.priceHistory.findMany({
    where: { unitId: unit.id },
    select: { price: true, recordedAt: true },
    orderBy: { recordedAt: 'asc' },
    take: 40,
  })

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

  // RealEstateListing + BreadcrumbList structured data (rich results).
  const canonical = unit.slug || unit.id
  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'RealEstateListing',
        name: `${unit.project.name} - ${unit.name}`,
        url: `${SITE_URL}/units/${canonical}`,
        image: absoluteImage(unit.project.coverImage) ?? undefined,
        offers: {
          '@type': 'Offer',
          price: unit.price,
          priceCurrency: 'EGP',
          availability: 'https://schema.org/InStock',
        },
        ...(unit.area > 0
          ? { floorSize: { '@type': 'QuantitativeValue', value: unit.area, unitCode: 'MTK' } }
          : {}),
        ...(unit.bedrooms ? { numberOfRooms: unit.bedrooms } : {}),
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'المشاريع', item: `${SITE_URL}/projects` },
          { '@type': 'ListItem', position: 2, name: unit.project.name, item: `${SITE_URL}/projects/${unit.project.slug}` },
          { '@type': 'ListItem', position: 3, name: unit.name },
        ],
      },
    ],
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />
      {/* F6: journey view tracking (fire-and-forget) */}
      <JourneyViewTracker type="UNIT_VIEW" entityId={unit.id} />
      <UnitView unit={unit} gallery={gallery} priceHistory={priceHistory} />
    </>
  )
}
