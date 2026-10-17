import { Metadata } from 'next'
import { db } from '@/lib/db'
import CareersView from './careers-view'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Careers | GHAYA REAL ESTATE',
  description: 'Join the GHAYA team and help shape the future of real estate in Egypt.',
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
