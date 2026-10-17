import { Metadata } from 'next'
import { db } from '@/lib/db'
import PressView from './press-view'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Press | GHAYA REAL ESTATE',
  description: 'Read the latest press releases and media coverage about GHAYA REAL ESTATE.',
}

export default async function PressPage() {
  const releases = await db.pressRelease.findMany({
    where: { isPublished: true },
    orderBy: { publishedAt: 'desc' },
    select: {
      id: true,
      title: true,
      titleArabic: true,
      slug: true,
      excerpt: true,
      content: true,
      coverImage: true,
      source: true,
      sourceUrl: true,
      publishedAt: true,
    },
  })

  return <PressView releases={releases} />
}
