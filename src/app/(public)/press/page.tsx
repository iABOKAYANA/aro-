import { Metadata } from 'next'
import { db } from '@/lib/db'
import { SITE_NAME, SITE_URL } from '@/lib/site'
import PressView from './press-view'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const publishedCount = await db.pressRelease.count({ where: { isPublished: true } }).catch(() => 0)
  const title = 'أخبار غاية العقارية | Press & Company News'
  const description = 'الأخبار والبيانات الصحفية والتغطية الإعلامية عن غاية العقارية.'
  return {
    title,
    description,
    alternates: { canonical: `${SITE_URL}/press` },
    ...(publishedCount === 0 ? { robots: { index: false, follow: true } } : {}),
    openGraph: { type: 'website', title, description, url: `${SITE_URL}/press`, siteName: SITE_NAME },
    twitter: { card: 'summary', title, description },
  }
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
