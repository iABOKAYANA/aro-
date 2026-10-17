import type { MetadataRoute } from 'next'
import { db } from '@/lib/db'
import { SITE_URL } from '@/lib/site'
import { PUBLIC_PROJECT_WHERE, PUBLIC_UNIT_PROJECT_WHERE } from '@/lib/project-visibility'

type Row = { slug: string | null; updatedAt?: Date | null }

/** Build a chunk of entries, never throwing — a broken table must not 500 the sitemap. */
async function rows<T extends Row>(
  run: () => Promise<T[]>,
  pathFor: (row: T) => string | null,
  priority: number,
  changeFrequency: 'daily' | 'weekly' | 'monthly'
): Promise<MetadataRoute.Sitemap> {
  try {
    const items = await run()
    const out: MetadataRoute.Sitemap = []
    const seen = new Set<string>()
    for (const item of items) {
      const path = pathFor(item)
      if (!path) continue
      const url = `${SITE_URL}${path}`
      if (seen.has(url)) continue
      seen.add(url)
      out.push({
        url,
        lastModified: item.updatedAt ?? new Date(),
        changeFrequency,
        priority,
      })
    }
    return out
  } catch {
    return []
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date()

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: 'daily', priority: 1 },
    { url: `${SITE_URL}/projects`, lastModified: now, changeFrequency: 'daily', priority: 0.9 },
    { url: `${SITE_URL}/ai-tools`, lastModified: now, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${SITE_URL}/ai-tools/search`, lastModified: now, changeFrequency: 'weekly', priority: 0.6 },
    { url: `${SITE_URL}/ai-tools/chat`, lastModified: now, changeFrequency: 'weekly', priority: 0.6 },
    { url: `${SITE_URL}/ai-tools/price-estimator`, lastModified: now, changeFrequency: 'weekly', priority: 0.6 },
    { url: `${SITE_URL}/ai-tools/investment`, lastModified: now, changeFrequency: 'weekly', priority: 0.6 },
    { url: `${SITE_URL}/ai-tools/mortgage`, lastModified: now, changeFrequency: 'weekly', priority: 0.6 },
    { url: `${SITE_URL}/compare`, lastModified: now, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${SITE_URL}/offers`, lastModified: now, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${SITE_URL}/areas`, lastModified: now, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${SITE_URL}/ai-tools/affordability`, lastModified: now, changeFrequency: 'weekly', priority: 0.6 },
    { url: `${SITE_URL}/ai-tools/rentbuy`, lastModified: now, changeFrequency: 'weekly', priority: 0.6 },
    { url: `${SITE_URL}/about`, lastModified: now, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${SITE_URL}/faq`, lastModified: now, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${SITE_URL}/contact`, lastModified: now, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${SITE_URL}/careers`, lastModified: now, changeFrequency: 'weekly', priority: 0.5 },
    { url: `${SITE_URL}/blog`, lastModified: now, changeFrequency: 'daily', priority: 0.8 },
    { url: `${SITE_URL}/press`, lastModified: now, changeFrequency: 'monthly', priority: 0.4 },
    { url: `${SITE_URL}/privacy`, lastModified: now, changeFrequency: 'yearly', priority: 0.2 },
    { url: `${SITE_URL}/terms`, lastModified: now, changeFrequency: 'yearly', priority: 0.2 },
    { url: `${SITE_URL}/cookies`, lastModified: now, changeFrequency: 'yearly', priority: 0.2 },
    { url: `${SITE_URL}/saved`, lastModified: now, changeFrequency: 'daily', priority: 0.4 },
  ]

  const [projects, blogs, press, jobs, units] = await Promise.all([
    rows(
      () =>
        db.project.findMany({
          where: { ...PUBLIC_PROJECT_WHERE },
          select: { slug: true, updatedAt: true },
          orderBy: { updatedAt: 'desc' },
          take: 5000,
        }),
      (p) => (p.slug ? `/projects/${p.slug}` : null),
      0.9,
      'weekly'
    ),
    rows(
      () => db.blog.findMany({ where: { isPublished: true }, select: { slug: true, updatedAt: true }, orderBy: { updatedAt: 'desc' }, take: 2000 }),
      (b) => `/blog/${b.slug}`,
      0.6,
      'monthly'
    ),
    rows(
      () => db.pressRelease.findMany({ where: { isPublished: true }, select: { slug: true, updatedAt: true }, orderBy: { updatedAt: 'desc' }, take: 500 }),
      (p) => `/press/${p.slug}`,
      0.4,
      'monthly'
    ),
    rows(
      () => db.job.findMany({ where: { isPublished: true }, select: { slug: true, updatedAt: true }, orderBy: { updatedAt: 'desc' }, take: 500 }),
      (j) => `/careers/${j.slug}`,
      0.4,
      'weekly'
    ),
    rows(
      () =>
        db.unit.findMany({
          // Sitemap lists buyable inventory only — showcase samples excluded —
          // and only units of publicly visible projects.
          where: {
            slug: { not: null },
            isSample: false,
            project: { ...PUBLIC_UNIT_PROJECT_WHERE },
          },
          select: { slug: true, updatedAt: true },
          orderBy: { updatedAt: 'desc' },
          take: 5000,
        }),
      (u) => (u.slug ? `/units/${u.slug}` : null),
      0.8,
      'weekly'
    ),
  ])

  return [...staticRoutes, ...projects, ...blogs, ...press, ...jobs, ...units]
}
