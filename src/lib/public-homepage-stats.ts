import { db } from '@/lib/db'
import { PUBLIC_PROJECT_WHERE, PUBLIC_UNIT_PROJECT_WHERE } from '@/lib/project-visibility'

export interface PublicHomepageStats {
  projectCount: number
  developerCount: number
  cityCount: number
  /** Non-sample, priced units in public projects with an AVAILABLE status. */
  availableUnitCount: number
  featuredDevelopers: Array<{
    id: string
    name: string
    nameArabic: string | null
    slug: string | null
    projectCount: number
  }>
}

type PublicProjectRow = { developerId: string; cityId: string | null }
type PublicDeveloperRow = { id: string; companyName: string; companyNameArabic: string | null; slug: string | null }

/** Pure aggregation kept separate so homepage counts stay easy to regression-test. */
export function summarizePublicHomepageStats(
  publicProjects: PublicProjectRow[],
  developers: PublicDeveloperRow[],
  availableUnitCount: number,
): PublicHomepageStats {
  const developerCounts = new Map<string, number>()
  const cityIds = new Set<string>()
  for (const project of publicProjects) {
    developerCounts.set(project.developerId, (developerCounts.get(project.developerId) || 0) + 1)
    if (project.cityId) cityIds.add(project.cityId)
  }

  return {
    projectCount: publicProjects.length,
    developerCount: developerCounts.size,
    cityCount: cityIds.size,
    availableUnitCount,
    featuredDevelopers: developers
      .filter((developer) => developerCounts.has(developer.id))
      .map((developer) => ({
        id: developer.id,
        name: developer.companyName,
        nameArabic: developer.companyNameArabic,
        slug: developer.slug,
        projectCount: developerCounts.get(developer.id) || 0,
      }))
      .sort((a, b) => b.projectCount - a.projectCount || a.name.localeCompare(b.name))
      .slice(0, 8),
  }
}

const STATS_TTL_MS = 60_000
let cached: { expiresAt: number; value: PublicHomepageStats } | null = null

/**
 * Public, catalog-derived homepage facts only. The hero must never advertise
 * hand-entered or sample totals; every count uses the same visibility gate as
 * the public project/unit pages. A short process cache avoids three small queries on
 * every page view while keeping publication/import changes fresh within a minute.
 */
export async function getPublicHomepageStats(): Promise<PublicHomepageStats | null> {
  if (cached && cached.expiresAt > Date.now()) return cached.value

  try {
    const [publicProjects, availableUnitCount] = await Promise.all([
      db.project.findMany({
        where: PUBLIC_PROJECT_WHERE,
        select: { developerId: true, cityId: true },
      }),
      db.unit.count({
        where: {
          isSample: false,
          status: { in: ['AVAILABLE', 'Vacant'] },
          price: { gt: 0 },
          project: { ...PUBLIC_UNIT_PROJECT_WHERE },
        },
      }),
    ])

    const developerIds = [...new Set(publicProjects.map((project) => project.developerId))]
    const developers = developerIds.length
      ? await db.developerProfile.findMany({
          where: { id: { in: developerIds } },
          select: { id: true, slug: true, companyName: true, companyNameArabic: true },
        })
      : []

    const value = summarizePublicHomepageStats(publicProjects, developers, availableUnitCount)

    cached = { expiresAt: Date.now() + STATS_TTL_MS, value }
    return value
  } catch (error) {
    console.error('[homepage-stats] failed to read public catalog counts:', error)
    return null
  }
}
