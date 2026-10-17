import { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { db } from '@/lib/db'
import { SITE_URL, languageAlternates } from '@/lib/site'
import PressReleaseView from './press-release-view'

export const dynamic = 'force-dynamic'

interface PressPageProps {
  params: { slug: string }
}

export async function generateMetadata({ params }: PressPageProps): Promise<Metadata> {
  const release = await db.pressRelease.findUnique({
    where: { slug: params.slug },
    select: { title: true, excerpt: true, coverImage: true },
  })

  if (!release) return { title: 'Press Release Not Found' }

  const path = `/press/${params.slug}`
  const description = release.excerpt || `Press release from GHAYA REAL ESTATE.`

  return {
    title: release.title,
    description,
    alternates: languageAlternates(path),
    openGraph: {
      type: 'article',
      title: release.title,
      description,
      url: `${SITE_URL}${path}`,
      images: [
        release.coverImage
          ? { url: release.coverImage, width: 1200, height: 630, alt: release.title }
          : { url: `${SITE_URL}/og?t=${encodeURIComponent(release.title)}`, width: 1200, height: 630 },
      ],
    },
    twitter: { card: 'summary_large_image', title: release.title, description },
  }
}

export default async function PressReleasePage({ params }: PressPageProps) {
  const release = await db.pressRelease.findUnique({
    where: { slug: params.slug },
    select: {
      title: true,
      titleArabic: true,
      excerpt: true,
      content: true,
      coverImage: true,
      source: true,
      sourceUrl: true,
      isPublished: true,
      publishedAt: true,
    },
  })

  if (!release || !release.isPublished) notFound()

  return <PressReleaseView release={release} />
}
