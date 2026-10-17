/**
 * Saved searches (F5): persist a buyer's filter set and alert them when a new
 * project appears that satisfies it.
 *
 * Matching is deliberately conservative — a filter only constrains the fields
 * it actually sets, so "New Cairo + under 10M" and "anywhere, 3 bedrooms"
 * both behave the way the user wrote them.
 */

import { db } from '@/lib/db'
import { notifyUser } from '@/lib/notify'
import { PUBLIC_PROJECT_WHERE } from '@/lib/project-visibility'

export type SavedFilters = {
  q?: string
  governorate?: string
  city?: string
  district?: string
  propertyType?: string
  listingType?: string
  minPrice?: number
  maxPrice?: number
  bedrooms?: number
  bathrooms?: number
  minArea?: number
  maxArea?: number
}

export type SearchCandidate = {
  name: string
  nameArabic?: string | null
  developerName?: string | null
  tagline?: string | null
  description?: string | null
  governorate?: string | null
  city?: string | null
  district?: string | null
  propertyTypes: string[]
  listingTypes: string[]
  startPrice?: number | null
  /** Lowest bedroom count among the project's units, when known. */
  minBedrooms?: number | null
  minBathrooms?: number | null
  minArea?: number | null
}

function eq(a: string | null | undefined, b: string | undefined): boolean {
  if (!b) return true
  if (!a) return false
  return a.trim().toLowerCase() === b.trim().toLowerCase()
}

function contains(haystack: string | null | undefined, needle: string | undefined): boolean {
  if (!needle) return true
  if (!haystack) return false
  return haystack.toLowerCase().includes(needle.trim().toLowerCase())
}

export function matchesFilters(filters: SavedFilters, candidate: SearchCandidate): boolean {
  const q = filters.q?.trim()
  if (q) {
    // Mirror the five fields searchProjects() searches so an alert fires for
    // exactly the rows the results page would show for the same query.
    const haystack = [
      candidate.name,
      candidate.nameArabic,
      candidate.tagline,
      candidate.description,
      candidate.developerName,
    ]
      .filter(Boolean)
      .join(' ')
    if (!contains(haystack, q)) return false
  }

  if (!eq(candidate.governorate, filters.governorate)) return false
  if (!eq(candidate.city, filters.city)) return false
  if (!eq(candidate.district, filters.district)) return false

  if (filters.propertyType) {
    const wanted = filters.propertyType.toUpperCase()
    const has = candidate.propertyTypes.some((t) => String(t).toUpperCase() === wanted)
    if (!has) return false
  }

  if (filters.listingType) {
    const wanted = filters.listingType.toUpperCase()
    const has = candidate.listingTypes.some((t) => String(t).toUpperCase() === wanted)
    if (!has) return false
  }

  const price = candidate.startPrice
  if (price != null) {
    if (filters.minPrice != null && price < filters.minPrice) return false
    if (filters.maxPrice != null && price > filters.maxPrice) return false
  }

  // Bedroom/bathroom/area constraints need unit data — skip rather than lie.
  if (candidate.minBedrooms != null && filters.bedrooms != null) {
    if (candidate.minBedrooms < filters.bedrooms) return false
  }
  if (candidate.minBathrooms != null && filters.bathrooms != null) {
    if (candidate.minBathrooms < filters.bathrooms) return false
  }
  if (candidate.minArea != null) {
    if (filters.minArea != null && candidate.minArea < filters.minArea) return false
  }

  return true
}

/** Enrich a project id with the unit-derived numbers used above. */
async function candidateForProject(projectId: string): Promise<SearchCandidate | null> {
  const project = await db.project.findUnique({
    where: { id: projectId },
    select: {
      name: true,
      nameArabic: true,
      tagline: true,
      description: true,
      propertyTypes: true,
      listingTypes: true,
      startPrice: true,
      developer: { select: { companyName: true } },
      governorate: { select: { name: true } },
      city: { select: { name: true } },
      district: { select: { name: true } },
      units: {
        select: { bedrooms: true, bathrooms: true, area: true },
        take: 200,
      },
    },
  })
  if (!project) return null

  const parse = (raw: string): string[] => {
    try {
      const v = JSON.parse(raw)
      return Array.isArray(v) ? v.map(String) : []
    } catch {
      return []
    }
  }

  const bedrooms = project.units.map((u) => u.bedrooms).filter((n): n is number => n != null)
  const bathrooms = project.units.map((u) => u.bathrooms).filter((n): n is number => n != null)
  const areas = project.units.map((u) => u.area).filter((n): n is number => n != null)

  return {
    name: project.name,
    nameArabic: project.nameArabic,
    developerName: project.developer?.companyName,
    tagline: project.tagline,
    description: project.description,
    governorate: project.governorate?.name,
    city: project.city?.name,
    district: project.district?.name,
    propertyTypes: parse(project.propertyTypes),
    listingTypes: parse(project.listingTypes),
    startPrice: project.startPrice,
    minBedrooms: bedrooms.length ? Math.min(...bedrooms) : null,
    minBathrooms: bathrooms.length ? Math.min(...bathrooms) : null,
    minArea: areas.length ? Math.min(...areas) : null,
  }
}

function safeParse(raw: string): SavedFilters | null {
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? (parsed as SavedFilters) : null
  } catch {
    return null
  }
}

/**
 * Fire an in-app alert at every user whose saved search matches this new
 * project. Fail-soft: never throws into the caller's transaction.
 */
export async function alertSavedSearchesForProject(projectId: string): Promise<number> {
  try {
    const candidate = await candidateForProject(projectId)
    if (!candidate) return 0

    const searches = await db.savedSearch.findMany({
      where: { notifyNew: true },
      select: { id: true, userId: true, name: true, filters: true },
      take: 2000,
    })

    const slugRow = await db.project.findUnique({
      where: { id: projectId },
      select: { slug: true },
    })

    let sent = 0
    const jobs: Promise<void>[] = []

    for (const search of searches) {
      const filters = safeParse(search.filters)
      if (!filters || !matchesFilters(filters, candidate)) continue

      jobs.push(
        notifyUser(search.userId, {
          type: 'SAVED_SEARCH_MATCH',
          title: 'New project matches your saved search',
          message: `${candidate.name} matches "${search.name}"`,
          link: slugRow?.slug ? `/projects/${slugRow.slug}` : '/projects',
          metadata: { projectId, savedSearchId: search.id },
        }).then(() => {
          sent += 1
        })
      )
    }

    await Promise.all(jobs)
    if (sent > 0) {
      console.info(`[saved-searches] ${sent} alert(s) for project ${projectId}`)
    }
    return sent
  } catch (e) {
    console.error('[saved-searches] alert failed:', e)
    return 0
  }
}

/** How many currently-live projects match — shown next to each saved search. */
export async function countMatches(filters: SavedFilters): Promise<number> {
  try {
    const where: Record<string, unknown> = {
      ...PUBLIC_PROJECT_WHERE,
    }

    const and: Record<string, unknown>[] = []
    if (filters.q) {
      const q = filters.q.trim()
      // Same five fields searchProjects() matches on. SQLite's LIKE is already
      // case-insensitive, and Prisma throws on `mode: 'insensitive'` there —
      // that exception used to be swallowed by the catch below, which is why
      // every saved search showed "0 matches".
      and.push({
        OR: [
          { name: { contains: q } },
          { nameArabic: { contains: q } },
          { tagline: { contains: q } },
          { description: { contains: q } },
          { developer: { companyName: { contains: q } } },
        ],
      })
    }
    if (filters.governorate) and.push({ governorate: { name: filters.governorate } })
    if (filters.city) and.push({ city: { name: filters.city } })
    if (filters.district) and.push({ district: { name: filters.district } })
    if (filters.propertyType) and.push({ propertyTypes: { contains: `"${filters.propertyType}"` } })
    if (filters.listingType) and.push({ listingTypes: { contains: `"${filters.listingType}"` } })

    const price: Record<string, number> = {}
    if (filters.minPrice != null) price.gte = filters.minPrice
    if (filters.maxPrice != null) price.lte = filters.maxPrice
    if (Object.keys(price).length) and.push({ startPrice: price })

    if (and.length) where.AND = and

    return await db.project.count({ where })
  } catch {
    return 0
  }
}
