import { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { db } from '@/lib/db'
import { SITE_NAME, SITE_URL, languageAlternates } from '@/lib/site'
import { absoluteImage } from '@/lib/seo'
import PressReleaseView from './press-release-view'

export const dynamic = 'force-dynamic'

interface PressPageProps {
  params: { slug: string }
}

export async function generateMetadata({ params }: PressPageProps): Promise<Metadata> {
  const release = await db.pressRelease.findFirst({
    where: { slug: params.slug, isPublished: true },
    select: { title: true, excerpt: true, coverImage: true, publishedAt: true },
  })

  if (!release) return { title: 'Press Release Not Found', robots: { index: false, follow: false } }

  const path = `/press/${params.slug}`
  const description = (release.excerpt || `Press release from ${SITE_NAME}.`).slice(0, 180)

  return {
    title: release.title,
    description,
    alternates: languageAlternates(path),
    openGraph: {
      type: 'article',
      title: release.title,
      description,
      url: `${SITE_URL}${path}`,
      siteName: SITE_NAME,
      images: [
        release.coverImage && absoluteImage(release.coverImage)
          ? { url: absoluteImage(release.coverImage)!, width: 1200, height: 630, alt: release.title }
          : { url: `${SITE_URL}/og?t=${encodeURIComponent(release.title)}`, width: 1200, height: 630 },
      ],
      ...(release.publishedAt ? { publishedTime: release.publishedAt.toISOString() } : {}),
    },
    twitter: { card: 'summary_large_image', title: release.title, description },
  }
}

export default async function PressReleasePage({ params }: PressPageProps) {
  const release = await db.pressRelease.findFirst({
    where: { slug: params.slug, isPublished: true },
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
