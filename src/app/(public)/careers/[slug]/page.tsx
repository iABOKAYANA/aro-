import { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { db } from '@/lib/db'
import { SITE_NAME, SITE_URL, languageAlternates } from '@/lib/site'
import JobView from './job-view'

export const dynamic = 'force-dynamic'

function parseList(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : []
  } catch {
    return raw
      .split(/\r?\n|\u2022|,/)
      .map((s) => s.trim())
      .filter(Boolean)
  }
}

interface JobPageProps {
  params: { slug: string }
}

export async function generateMetadata({ params }: JobPageProps): Promise<Metadata> {
  const job = await db.job.findUnique({
    where: { slug: params.slug },
    select: { title: true, description: true, department: true, location: true, isPublished: true },
  })

  if (!job?.isPublished) return { title: 'Job Not Found', robots: { index: false, follow: false } }

  const path = `/careers/${params.slug}`
  const description = job.description.slice(0, 155).trim()

  return {
    title: `${job.title} — ${job.department}`,
    description,
    alternates: languageAlternates(path),
    openGraph: {
      type: 'website',
      title: job.title,
      description,
      url: `${SITE_URL}${path}`,
      siteName: SITE_NAME,
      images: [{ url: `${SITE_URL}/og?t=${encodeURIComponent(job.title)}&s=${encodeURIComponent(`${job.department} · ${job.location}`)}` }],
    },
    twitter: { card: 'summary_large_image', title: job.title, description },
  }
}

export default async function JobPage({ params }: JobPageProps) {
  const job = await db.job.findUnique({
    where: { slug: params.slug },
    select: {
      id: true,
      title: true,
      titleArabic: true,
      department: true,
      location: true,
      type: true,
      description: true,
      descriptionArabic: true,
      requirements: true,
      salaryMin: true,
      salaryMax: true,
      isPublished: true,
    },
  })

  if (!job || !job.isPublished) notFound()

  const requirements = parseList(job.requirements)
  const salary =
    job.salaryMin && job.salaryMax
      ? `${job.salaryMin.toLocaleString('en-US')} – ${job.salaryMax.toLocaleString('en-US')}`
      : null

  return <JobView job={job} requirements={requirements} salary={salary} />
}
