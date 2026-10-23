import { Metadata } from 'next'
import { db } from '@/lib/db'
import { SITE_NAME, SITE_URL } from '@/lib/site'
import CareersView from './careers-view'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const openPositions = await db.job.count({ where: { isPublished: true } }).catch(() => 0)
  const title = 'وظائف وفرص عمل | Careers'
  const description = 'اكتشف فرص العمل المتاحة لدى غاية العقارية.'
  return {
    title,
    description,
    alternates: { canonical: `${SITE_URL}/careers` },
    ...(openPositions === 0 ? { robots: { index: false, follow: true } } : {}),
    openGraph: { type: 'website', title, description, url: `${SITE_URL}/careers`, siteName: SITE_NAME },
    twitter: { card: 'summary', title, description },
  }
}

export default async function CareersPage() {
  const jobs = await db.job.findMany({
    where: { isPublished: true },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      title: true,
      titleArabic: true,
      slug: true,
      department: true,
      location: true,
      type: true,
      description: true,
      descriptionArabic: true,
      salaryMin: true,
      salaryMax: true,
    },
  })

  return <CareersView jobs={jobs} />
}
