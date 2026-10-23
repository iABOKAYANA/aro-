import type { MetadataRoute } from 'next'
import { db } from '@/lib/db'
import { SITE_URL } from '@/lib/site'
import { PUBLIC_PROJECT_WHERE, PUBLIC_UNIT_PROJECT_WHERE } from '@/lib/project-visibility'
import { getFeatureFlags } from '@/lib/feature-flags'

// The catalogue changes without a deployment and the build environment may
// not have the production database. Resolve sitemap rows at request time so
// it always reflects the live public catalogue, not a stale build snapshot.
export const dynamic = 'force-dynamic'

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
        ...(item.updatedAt ? { lastModified: item.updatedAt } : {}),
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
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, changeFrequency: 'daily', priority: 1 },
    { url: `${SITE_URL}/projects`, changeFrequency: 'daily', priority: 0.9 },
    { url: `${SITE_URL}/projects/map`, changeFrequency: 'daily', priority: 0.7 },
    { url: `${SITE_URL}/ai-tools`, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${SITE_URL}/ai-tools/search`, changeFrequency: 'weekly', priority: 0.6 },
    { url: `${SITE_URL}/ai-tools/investment`, changeFrequency: 'weekly', priority: 0.6 },
    { url: `${SITE_URL}/ai-tools/mortgage`, changeFrequency: 'weekly', priority: 0.6 },
    { url: `${SITE_URL}/compare`, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${SITE_URL}/offers`, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${SITE_URL}/areas`, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${SITE_URL}/ai-tools/affordability`, changeFrequency: 'weekly', priority: 0.6 },
    { url: `${SITE_URL}/ai-tools/rentbuy`, changeFrequency: 'weekly', priority: 0.6 },
    { url: `${SITE_URL}/about`, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${SITE_URL}/faq`, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${SITE_URL}/contact`, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${SITE_URL}/privacy`, changeFrequency: 'yearly', priority: 0.2 },
    { url: `${SITE_URL}/terms`, changeFrequency: 'yearly', priority: 0.2 },
    { url: `${SITE_URL}/cookies`, changeFrequency: 'yearly', priority: 0.2 },
    { url: `${SITE_URL}/developers`, changeFrequency: 'weekly', priority: 0.7 },
  ]

  // Feature pages only belong in the sitemap while the owner has them enabled.
  const flags = await getFeatureFlags()
  if (flags.price_explorer) staticRoutes.push({ url: `${SITE_URL}/prices`, changeFrequency: 'weekly', priority: 0.7 })
  if (flags.buying_guide) staticRoutes.push({ url: `${SITE_URL}/guides/buying-offplan`, changeFrequency: 'monthly', priority: 0.6 })

  const [projects, blogs, press, jobs, units, developers] = await Promise.all([
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
            status: { in: ['AVAILABLE', 'Vacant'] },
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
    rows(
      () =>
        db.developerProfile.findMany({
          where: { slug: { not: null }, projects: { some: { ...PUBLIC_PROJECT_WHERE } } },
          select: { slug: true },
          take: 500,
        }),
      (d) => (d.slug ? `/developers/${d.slug}` : null),
      0.6,
      'weekly'
    ),
  ])

  // Empty archive pages are thin; add them only once they have indexable
  // content. Detail pages still enter the sitemap individually above.
  if (blogs.length > 0) staticRoutes.push({ url: `${SITE_URL}/blog`, changeFrequency: 'daily', priority: 0.8 })
  if (press.length > 0) staticRoutes.push({ url: `${SITE_URL}/press`, changeFrequency: 'monthly', priority: 0.4 })
  if (jobs.length > 0) staticRoutes.push({ url: `${SITE_URL}/careers`, changeFrequency: 'weekly', priority: 0.5 })

  return [...staticRoutes, ...projects, ...blogs, ...press, ...jobs, ...units, ...developers]
}
