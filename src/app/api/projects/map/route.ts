import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { PUBLIC_PROJECT_WHERE } from '@/lib/project-visibility'

export const dynamic = 'force-dynamic'

/**
 * GET /api/projects/map — lightweight pins for the List/Map toggles.
 *
 * Public. Same corpus as the projects list (`isActive: true`, same filter set
 * and AND-semantics as `searchProjects` in src/lib/search.ts), but only the
 * fields a map needs.
 *
 * DATA REALITY: the `lat`/`lng` columns are new, so most rows have no
 * coordinates. Resolution order per project:
 *   1. `lat` / `lng` (new columns) → precision `exact`
 *   2. legacy `latitude` / `longitude` → precision `exact`
 *   3. curated CITY_CENTROIDS by `city.nameSlug` → precision `city`
 *   4. otherwise the project is skipped (counted in `skipped`) — we never
 *      invent coordinates for a project.
 */
const CITY_CENTROIDS: Record<string, { lat: number; lng: number }> = {
  'new-cairo': { lat: 30.02, lng: 31.47 },
  'fifth-settlement': { lat: 30.0, lng: 31.47 },
  'sheikh-zayed': { lat: 30.01, lng: 31.01 },
  'new-capital': { lat: 30.01, lng: 31.75 },
  'north-coast': { lat: 30.9, lng: 29.5 },
  'ain-sokhna': { lat: 29.6, lng: 32.3 },
  '6th-october': { lat: 29.93, lng: 30.92 },
  // Alternate slug for the same city (rows use both) — same curated centroid.
  '6th-of-october-city': { lat: 29.93, lng: 30.92 },
  'new-alamein': { lat: 30.83, lng: 28.95 },
  cairo: { lat: 30.0444, lng: 31.2357 },
  giza: { lat: 30.0131, lng: 31.2089 },
  alexandria: { lat: 31.2001, lng: 29.9187 },
}

function isCoord(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)

    const q = searchParams.get('q')?.trim() || undefined
    const governorate = searchParams.get('governorate')?.trim() || undefined
    const city = searchParams.get('city')?.trim() || undefined
    const district = searchParams.get('district')?.trim() || undefined
    const propertyType = searchParams.get('propertyType')?.trim() || undefined
    const listingType = searchParams.get('listingType')?.trim() || undefined
    const status = searchParams.get('status')?.trim() || undefined
    const developer = searchParams.get('developer')?.trim() || undefined
    const amenities = searchParams.get('amenities')?.trim() || undefined
    const num = (key: string): number | undefined => {
      const raw = searchParams.get(key)
      if (!raw) return undefined
      const n = Number(raw)
      return Number.isFinite(n) ? n : undefined
    }
    const minPrice = num('minPrice')
    const maxPrice = num('maxPrice')
    const minArea = num('minArea')
    const maxArea = num('maxArea')
    const bedrooms = num('bedrooms')
    const bathrooms = num('bathrooms')
    const rawLimit = searchParams.get('limit') ? Number(searchParams.get('limit')) : 100
    const limit = Number.isFinite(rawLimit) ? Math.min(200, Math.max(1, Math.floor(rawLimit))) : 100

    // Same corpus as `searchProjects` in src/lib/search.ts: public projects
    // only (non-approved never produce pins) — every filter group is ANDed
    // (via where.AND). Joining q / price with a single
    // top-level OR returned the UNION of matches instead of the intersection,
    // so combined filters showed MORE pins than the list.
    const where: Record<string, unknown> = { ...PUBLIC_PROJECT_WHERE }
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
    if (governorate) where.governorate = { nameSlug: governorate }
    if (city) where.city = { nameSlug: city }
    if (district) where.district = { nameSlug: district }
    if (propertyType) where.propertyTypes = { contains: propertyType }
    if (listingType) where.listingTypes = { contains: listingType }
    if (status) where.status = status
    if (developer) {
      // Accept a developer id or (a substring of) the company name.
      and.push({
        developer: {
          OR: [{ id: developer }, { companyName: { contains: developer } }],
        },
      })
    }
    if (amenities) {
      const names = String(amenities)
        .split(',')
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
        // Showcase samples never shape map pins — buyable inventory only.
        OR: [{ startPrice: priceFilter }, { units: { some: { price: priceFilter, isSample: false } } }],
      })
    }

    // Bedroom / bathroom / area filters are unit-level (projects carry no
    // bedrooms column). The UI sends "N+" semantics, so match units with at
    // least N. Merged into ONE units.some so a single unit must satisfy them.
    // Applied ONLY when one of those filters is present: an unconditional
    // units.some({ isSample: false }) restricted pins to the handful of
    // projects owning unit rows, collapsing the map to a single pin while
    // the list showed 1000+. Mirrors searchProjects in src/lib/search.ts.
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

    if (and.length > 0) where.AND = and

    const projects = await db.project.findMany({
      where,
      select: {
        id: true,
        slug: true,
        name: true,
        nameArabic: true,
        startPrice: true,
        lat: true,
        lng: true,
        latitude: true,
        longitude: true,
        city: { select: { name: true, nameArabic: true, nameSlug: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    })

    const pins: {
      id: string
      slug: string
      name: string
      nameArabic: string | null
      startPrice: number | null
      lat: number
      lng: number
      precision: 'exact' | 'city'
      city: { name: string; nameArabic: string | null; nameSlug: string | null } | null
    }[] = []
    let skipped = 0

    for (const p of projects) {
      let lat: number | null = null
      let lng: number | null = null
      let precision: 'exact' | 'city' = 'exact'

      if (isCoord(p.lat) && isCoord(p.lng)) {
        lat = p.lat
        lng = p.lng
      } else if (isCoord(p.latitude) && isCoord(p.longitude)) {
        lat = p.latitude
        lng = p.longitude
      } else {
        const slug = p.city?.nameSlug?.toLowerCase().trim()
        const centroid = slug ? CITY_CENTROIDS[slug] : undefined
        if (centroid) {
          lat = centroid.lat
          lng = centroid.lng
          precision = 'city'
        }
      }

      if (lat === null || lng === null) {
        skipped += 1
        continue
      }

      pins.push({
        id: p.id,
        slug: p.slug,
        name: p.name,
        nameArabic: p.nameArabic,
        startPrice: p.startPrice,
        lat,
        lng,
        precision,
        city: p.city
          ? { name: p.city.name, nameArabic: p.city.nameArabic, nameSlug: p.city.nameSlug }
          : null,
      })
    }

    return NextResponse.json(
      {
        pins,
        total: pins.length,
        matched: projects.length,
        exactCount: pins.filter((pin) => pin.precision === 'exact').length,
        cityCount: pins.filter((pin) => pin.precision === 'city').length,
        skipped,
      },
      { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' } }
    )
  } catch (error) {
    console.error('Fetch projects map error:', error)
    return NextResponse.json({ error: 'Failed to fetch projects map' }, { status: 500 })
  }
}
