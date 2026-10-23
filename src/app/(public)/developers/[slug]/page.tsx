import { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Image from 'next/image'
import { db } from '@/lib/db'
import { PUBLIC_PROJECT_WHERE } from '@/lib/project-visibility'
import { SITE_URL } from '@/lib/site'
import { absoluteImage } from '@/lib/seo'
import { ProjectCard } from '@/components/projects/project-card'
import { Badge } from '@/components/ui/badge'

export const dynamic = 'force-dynamic'

interface DevPageProps {
  params: { slug: string }
}

async function getDeveloper(slug: string) {
  return db.developerProfile.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      companyName: true,
      companyNameArabic: true,
      logo: true,
      coverImage: true,
      description: true,
      descriptionArabic: true,
      foundedYear: true,
      headquarters: true,
      website: true,
      isVerified: true,
      projects: {
        where: PUBLIC_PROJECT_WHERE,
        select: {
          id: true,
          name: true,
          nameArabic: true,
          slug: true,
          coverImage: true,
          tagline: true,
          taglineArabic: true,
          status: true,
          startPrice: true,
          endPrice: true,
          propertyTypes: true,
          completionPercent: true,
          viewCount: true,
          favoriteCount: true,
          governorate: { select: { name: true, nameArabic: true } },
          city: { select: { name: true, nameArabic: true, nameSlug: true } },
          district: { select: { name: true, nameArabic: true } },
          developer: { select: { companyName: true, logo: true, isVerified: true, slug: true } },
          units: { select: { price: true, area: true, bedrooms: true } },
        },
        orderBy: { startPrice: 'asc' },
      },
    },
  })
}

export async function generateMetadata({ params }: DevPageProps): Promise<Metadata> {
  const dev = await getDeveloper(params.slug)
  if (!dev || dev.projects.length === 0) return { title: 'Developer Not Found', robots: { index: false, follow: false } }
  const title = `${dev.companyNameArabic || dev.companyName} | مشاريع ${dev.companyName} وأسعارها`
  const description = (dev.descriptionArabic || dev.description || `مشاريع ${dev.companyName} المعروضة في غاية مع الأسعار والأنواع ومعلومات التسليم.`).slice(0, 180)
  return {
    title: { absolute: `${title} | GHAYA REAL ESTATE` },
    description,
    alternates: { canonical: `${SITE_URL}/developers/${dev.slug}` },
    openGraph: {
      title,
      description: `مشاريع ${dev.companyName} على غاية`,
      url: `${SITE_URL}/developers/${dev.slug}`,
      siteName: 'GHAYA REAL ESTATE',
      images: dev.coverImage ? [{ url: absoluteImage(dev.coverImage)! }] : undefined,
    },
  }
}

export default async function DeveloperPage({ params }: DevPageProps) {
  const dev = await getDeveloper(params.slug)
  if (!dev || !dev.projects.length) notFound()

  const ld = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: dev.companyName,
    ...(dev.website ? { url: dev.website } : {}),
    ...(dev.logo ? { logo: absoluteImage(dev.logo) } : {}),
    ...(dev.foundedYear ? { foundingDate: String(dev.foundedYear) } : {}),
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />

      <div className="mb-8 flex items-center gap-4">
        {dev.logo && (
          <Image
            src={dev.logo}
            alt={dev.companyName}
            width={72}
            height={72}
            className="h-18 w-18 shrink-0 rounded-2xl border border-border object-contain p-1.5"
          />
        )}
        <div className="min-w-0">
          <h1 className="font-display flex flex-wrap items-center gap-2 text-3xl font-bold">
            {dev.companyNameArabic || dev.companyName}
            {dev.isVerified && <Badge variant="gold" className="px-2 py-0.5 text-xs">موثّق</Badge>}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {dev.projects.length} {dev.projects.length === 1 ? 'مشروع' : 'مشاريع'} معروضين
            {dev.foundedYear && <> · تأسست {dev.foundedYear}</>}
            {dev.headquarters && <> · {dev.headquarters}</>}
          </p>
        </div>
      </div>

      {(dev.descriptionArabic || dev.description) && (
        <p className="mb-8 max-w-3xl leading-relaxed text-muted-foreground">
          {dev.descriptionArabic || dev.description}
        </p>
      )}

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {dev.projects.map((p) => (
          <ProjectCard
            key={p.id}
            project={{
              id: p.id,
              name: p.name,
              nameArabic: p.nameArabic,
              slug: p.slug,
              coverImage: p.coverImage,
              tagline: p.tagline,
              status: p.status,
              startPrice: p.startPrice,
              endPrice: p.endPrice,
              propertyTypes: p.propertyTypes,
              completionPercent: p.completionPercent,
              viewCount: p.viewCount,
              favoriteCount: p.favoriteCount,
              governorate: p.governorate,
              city: p.city,
              district: p.district,
              developer: p.developer
                ? {
                    companyName: p.developer.companyName,
                    logo: p.developer.logo,
                    isVerified: p.developer.isVerified,
                  }
                : null,
              units: p.units,
            }}
          />
        ))}
      </div>
    </div>
  )
}
