import { db } from '@/lib/db'
import type { PropertyFilterInput } from '@/lib/validations'
import type { SearchResult } from '@/types'
import { PUBLIC_PROJECT_WHERE, PUBLIC_UNIT_PROJECT_WHERE } from '@/lib/project-visibility'

export async function searchProjects(filters: PropertyFilterInput & { developer?: string; amenities?: string | string[] }) {
  const {
    q,
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

  if (q) {
    and.push({
      OR: [
        { name: { contains: q } },
        { nameArabic: { contains: q } },
        { description: { contains: q } },
        { tagline: { contains: q } },
        { developer: { companyName: { contains: q } } },
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
    where.propertyTypes = { contains: propertyType }
  }
  if (listingType) {
    where.listingTypes = { contains: listingType }
  }
  if (status) {
    where.status = status
  }
  if (developer) {
    // Accept a developer id or (a substring of) the company name.
    and.push({
      developer: {
        OR: [
          { id: developer },
          { companyName: { contains: developer } },
        ],
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
    and.push({ units: { some: { ...unitMatch, isSample: false } } })
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

export async function getProjectBySlug(slug: string) {
  const project = await db.project.findUnique({
    where: { slug },
    include: {
      developer: true,
      governorate: true,
      city: true,
      district: true,
      // Project detail keeps ALL rows (isSample included) — the client
      // splits showcase samples into the models section vs listed inventory.
      units: {
        orderBy: { price: 'asc' },
        include: {
          phase: { select: { name: true } },
        },
      },
      phases: {
        orderBy: { sortOrder: 'asc' },
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
