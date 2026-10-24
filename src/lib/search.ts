import { db } from '@/lib/db'
import type { PropertyFilterInput } from '@/lib/validations'
import type { SearchResult } from '@/types'
import { PUBLIC_CHILD_PROJECT_WHERE, PUBLIC_PROJECT_WHERE, PUBLIC_UNIT_PROJECT_WHERE } from '@/lib/project-visibility'
import { developerAliasesFor } from '@/lib/ai-search-parser'

export async function searchProjects(filters: PropertyFilterInput & { developer?: string; amenities?: string | string[]; ids?: string[] }) {
  const {
    q,
    ids,
    governorate,
    city,
    district,
    propertyType,
    listingType,
    minPrice,
    maxPrice,
    minArea,
    maxArea,
    bedrooms,
    bathrooms,
    status,
    developer,
    amenities,
    sortBy = 'newest',
    page = 1,
    limit = 12,
  } = filters

  const where: Record<string, unknown> = {
    // Public only: PENDING/DRAFT/REJECTED/HIDDEN/ARCHIVED (or inactive)
    // projects never appear in search — see src/lib/project-visibility.ts.
    ...PUBLIC_PROJECT_WHERE,
  }

  // Every filter group below is ANDed (via where.AND). Joining q / price /
  // area with a single top-level OR returned the UNION of matches instead of
  // the intersection, so combined filters showed MORE results, not fewer.
  const and: Record<string, unknown>[] = []

  // Exact project ids — عين understood the query as one/more named projects
  // (site search, not just chat). Publicness is still enforced above.
  if (ids && ids.length > 0) {
    and.push({ id: { in: ids } })
  }

  if (q) {
    and.push({
      OR: [
        { name: { contains: q } },
        { nameArabic: { contains: q } },
        { description: { contains: q } },
        { tagline: { contains: q } },
        { developer: { companyName: { contains: q } } },
        {
          childProjects: {
            some: {
              ...PUBLIC_CHILD_PROJECT_WHERE,
              OR: [
                { name: { contains: q } },
                { nameArabic: { contains: q } },
                { description: { contains: q } },
                { tagline: { contains: q } },
              ],
            },
          },
        },
      ],
    })
  }

  if (governorate) {
    where.governorate = { nameSlug: governorate }
  }
  if (city) {
    where.city = { nameSlug: city }
  }
  if (district) {
    where.district = { nameSlug: district }
  }
  if (propertyType) {
    and.push({
      OR: [
        { propertyTypes: { contains: propertyType } },
        { childProjects: { some: { ...PUBLIC_CHILD_PROJECT_WHERE, propertyTypes: { contains: propertyType } } } },
      ],
    })
  }
  if (listingType) {
    and.push({
      OR: [
        { listingTypes: { contains: listingType } },
        { childProjects: { some: { ...PUBLIC_CHILD_PROJECT_WHERE, listingTypes: { contains: listingType } } } },
      ],
    })
  }
  if (status) {
    where.status = status
  }
  if (developer) {
    // Accept a developer id or (a substring of) the company name. The
    // parser's alias table broadens a canonical name ("Emaar") to the
    // Arabic aliases Cairo clients actually type ("إعمار مصر").
    const developerCandidates = [...new Set([developer, ...developerAliasesFor(developer)])]
    and.push({
      developer: {
        OR: developerCandidates.flatMap((candidate) => [
          { id: candidate },
          { companyName: { contains: candidate } },
          { companyNameArabic: { contains: candidate } },
        ]),
      },
    })
  }
  if (amenities) {
    const names = (Array.isArray(amenities) ? amenities : String(amenities).split(','))
      .map((s) => s.trim())
      .filter(Boolean)
    if (names.length > 0) {
      and.push({ amenities: { some: { amenity: { name: { in: names } } } } })
    }
  }

  const priceFilter: Record<string, number> = {}
  if (minPrice) priceFilter.gte = minPrice
  if (maxPrice) priceFilter.lte = maxPrice
  if (Object.keys(priceFilter).length > 0) {
    and.push({
      OR: [
        { startPrice: priceFilter },
        { units: { some: { price: priceFilter, isSample: false } } },
        {
          childProjects: {
            some: {
              ...PUBLIC_CHILD_PROJECT_WHERE,
              OR: [
                { startPrice: priceFilter },
                { units: { some: { price: priceFilter, isSample: false } } },
              ],
            },
          },
        },
      ],
    })
  }

  // Bedroom / bathroom / area filters are unit-level (projects carry no
  // bedrooms column). The UI sends "N+" semantics, so match units with at
  // least N. Merged into ONE units.some so a single unit must satisfy them.
  // Showcase samples (isSample) never count as buyable inventory.
  const unitMatch: Record<string, unknown> = {}
  if (bedrooms) unitMatch.bedrooms = { gte: bedrooms }
  if (bathrooms) unitMatch.bathrooms = { gte: bathrooms }
  const areaFilter: Record<string, number> = {}
  if (minArea) areaFilter.gte = minArea
  if (maxArea) areaFilter.lte = maxArea
  if (Object.keys(areaFilter).length > 0) unitMatch.area = areaFilter
  if (Object.keys(unitMatch).length > 0) {
    and.push({
      OR: [
        { units: { some: { ...unitMatch, isSample: false } } },
        { childProjects: { some: { ...PUBLIC_CHILD_PROJECT_WHERE, units: { some: { ...unitMatch, isSample: false } } } } },
      ],
    })
  }

  if (and.length > 0) {
    where.AND = and
  }

  const orderBy = (() => {
    switch (sortBy) {
      case 'price_asc': return { startPrice: 'asc' as const }
      case 'price_desc': return { startPrice: 'desc' as const }
      case 'area_asc': return { totalArea: 'asc' as const }
      case 'area_desc': return { totalArea: 'desc' as const }
      case 'popular': return { viewCount: 'desc' as const }
      default: return { createdAt: 'desc' as const }
    }
  })()

  const [items, total] = await Promise.all([
    db.project.findMany({
      where,
      include: {
        developer: { select: { companyName: true, logo: true, isVerified: true } },
        governorate: { select: { name: true, nameArabic: true } },
        city: { select: { name: true, nameArabic: true } },
        district: { select: { name: true, nameArabic: true } },
        units: {
          where: { status: 'AVAILABLE', isSample: false },
          take: 3,
          orderBy: { price: 'asc' },
          select: { price: true, area: true, bedrooms: true },
        },
        amenities: {
          include: { amenity: { select: { name: true, icon: true } } },
          take: 6,
        },
        masterPlanImages: { orderBy: { sortOrder: 'asc' } },
        childProjects: {
          where: PUBLIC_CHILD_PROJECT_WHERE,
          select: {
            id: true,
            startPrice: true,
            units: {
              where: { status: 'AVAILABLE', isSample: false },
              orderBy: { price: 'asc' },
              take: 1,
              select: { price: true },
            },
          },
        },
      },
      orderBy,
      skip: (page - 1) * limit,
      take: limit,
    }),
    db.project.count({ where }),
  ])

  return {
    items,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  } satisfies SearchResult<typeof items[number]>
}

/**
 * Public project pages do not need to serialize thousands of live units.
 * Keep the full inventory for APIs/console/Ayn, but optionally return one
 * area-balanced representative per offered unitType for the public showcase.
 */
async function getRepresentativeProjectUnits(projectId: string) {
  const where = { projectId, isSample: false, status: { in: ['AVAILABLE', 'Vacant'] } }
  const groups = await db.unit.groupBy({ where, by: ['unitType'], _count: { id: true } })
  const representatives = await Promise.all(groups.map(async (group) => {
    const skip = Math.floor(Math.max(0, group._count.id - 1) / 2)
    const [unit] = await db.unit.findMany({
      where: { ...where, unitType: group.unitType },
      orderBy: [{ area: 'asc' }, { price: 'asc' }],
      skip,
      take: 1,
      include: { phase: { select: { name: true } } },
    })
    return unit
  }))
  const samples = await db.unit.findMany({
    where: { projectId, isSample: true },
    orderBy: { price: 'asc' },
    include: { phase: { select: { name: true } } },
  })
  return [...samples, ...representatives.filter(Boolean)]
}

export async function getProjectBySlug(slug: string, options: { representativeUnits?: boolean } = {}) {
  const project = await db.project.findUnique({
    where: { slug },
    include: {
      developer: true,
      governorate: true,
      city: true,
      district: true,
      // Replaced below with one representative per type when requested.
      ...(options.representativeUnits ? {} : {
        units: {
          orderBy: { price: 'asc' as const },
          include: { phase: { select: { name: true } } },
        },
      }),
      phases: {
        orderBy: { sortOrder: 'asc' },
      },
      childProjects: {
        where: PUBLIC_CHILD_PROJECT_WHERE,
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          nameArabic: true,
          isActive: true,
          approvalStatus: true,
          tagline: true,
          taglineArabic: true,
          description: true,
          descriptionArabic: true,
          coverImage: true,
          address: true,
          propertyTypes: true,
          startPrice: true,
          endPrice: true,
          status: true,
          totalArea: true,
          city: { select: { name: true, nameArabic: true } },
          units: {
            where: { status: 'AVAILABLE', isSample: false },
            orderBy: { price: 'asc' },
            take: 3,
            select: { id: true, slug: true, name: true, unitType: true, price: true, area: true },
          },
        },
      },
      paymentPlans: {
        include: { milestones: { orderBy: { sortOrder: 'asc' } } },
      },
      amenities: {
        include: { amenity: true },
      },
      nearbyPlaces: true,
      masterPlanImages: { orderBy: { sortOrder: 'asc' } },
      brochures: true,
    },
  })
  if (!project) return null
  if (options.representativeUnits) {
    return {
      ...project,
      units: await getRepresentativeProjectUnits(project.id),
      overview: project.description ?? null,
      overviewAr: project.descriptionArabic ?? null,
    }
  }
  // Mobile contract aliases: `overview` (EN) is the existing `description`
  // column; `overviewAr` (AR, may be null) is the existing
  // `descriptionArabic` column — no new column, values stay null until the
  // owner supplies Arabic copy (callers fall back to English).
  return {
    ...project,
    overview: project.description ?? null,
    overviewAr: project.descriptionArabic ?? null,
  }
}

export async function searchUnits(filters: PropertyFilterInput) {
  const {
    governorate,
    city,
    propertyType,
    listingType,
    minPrice,
    maxPrice,
    minArea,
    maxArea,
    bedrooms,
    bathrooms,
    finishingType,
    status,
    sortBy = 'newest',
    page = 1,
    limit = 12,
  } = filters

  const where: Record<string, unknown> = {
    status: status || { not: 'SOLD' },
    isSample: false,
  }

  if (propertyType) where.unitType = propertyType
  if (listingType) where.listingType = listingType
  if (bedrooms !== undefined) where.bedrooms = bedrooms
  if (bathrooms !== undefined) where.bathrooms = bathrooms
  if (finishingType) where.finishingType = finishingType

  const priceFilter: Record<string, number> = {}
  if (minPrice) priceFilter.gte = minPrice
  if (maxPrice) priceFilter.lte = maxPrice
  if (Object.keys(priceFilter).length > 0) where.price = priceFilter

  const areaFilter: Record<string, number> = {}
  if (minArea) areaFilter.gte = minArea
  if (maxArea) areaFilter.lte = maxArea
  if (Object.keys(areaFilter).length > 0) where.area = areaFilter

  if (governorate || city) {
    where.project = {
      ...PUBLIC_UNIT_PROJECT_WHERE,
      ...(governorate && { governorate: { nameSlug: governorate } }),
      ...(city && { city: { nameSlug: city } }),
    }
  } else {
    // Units of non-approved projects never surface in public search —
    // visibility follows the project (see src/lib/project-visibility.ts).
    where.project = { ...PUBLIC_UNIT_PROJECT_WHERE }
  }

  const orderBy = (() => {
    switch (sortBy) {
      case 'price_asc': return { price: 'asc' as const }
      case 'price_desc': return { price: 'desc' as const }
      case 'area_asc': return { area: 'asc' as const }
      case 'area_desc': return { area: 'desc' as const }
      case 'popular': return { viewCount: 'desc' as const }
      default: return { createdAt: 'desc' as const }
    }
  })()

  const [items, total] = await Promise.all([
    db.unit.findMany({
      where,
      include: {
        project: {
          select: { name: true, slug: true, coverImage: true },
        },
        phase: { select: { name: true } },
      },
      orderBy,
      skip: (page - 1) * limit,
      take: limit,
    }),
    db.unit.count({ where }),
  ])

  return {
    items,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  } satisfies SearchResult<typeof items[number]>
}
