import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { auth } from '@/lib/auth'
import { searchProjects, searchUnits } from '@/lib/search'

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const type = searchParams.get('type') // 'projects' | 'units'

    const filters = {
      // Free-text is supported by `searchProjects()` (name, nameArabic,
      // description, tagline, developer) but the route never forwarded it, so
      // every typed query fell through to an unfiltered listing. `searchUnits()`
      // takes no `q` at all — an extra key it never reads is harmless there.
      q: searchParams.get('q') || undefined,
      governorate: searchParams.get('governorate') || undefined,
      city: searchParams.get('city') || undefined,
      district: searchParams.get('district') || undefined,
      propertyType: searchParams.get('propertyType') as any || undefined,
      listingType: searchParams.get('listingType') as any || undefined,
      minPrice: searchParams.get('minPrice') ? Number(searchParams.get('minPrice')) : undefined,
      maxPrice: searchParams.get('maxPrice') ? Number(searchParams.get('maxPrice')) : undefined,
      minArea: searchParams.get('minArea') ? Number(searchParams.get('minArea')) : undefined,
      maxArea: searchParams.get('maxArea') ? Number(searchParams.get('maxArea')) : undefined,
      bedrooms: searchParams.get('bedrooms') ? Number(searchParams.get('bedrooms')) : undefined,
      bathrooms: searchParams.get('bathrooms') ? Number(searchParams.get('bathrooms')) : undefined,
      status: searchParams.get('status') || undefined,
      developer: searchParams.get('developer') || undefined,
      amenities: searchParams.get('amenities') || undefined,
      sortBy: (searchParams.get('sortBy') as any) || 'newest',
      page: searchParams.get('page') ? Math.min(500, Math.max(1, Number(searchParams.get('page')) || 1)) : 1,
      limit: searchParams.get('limit') ? Math.min(50, Math.max(1, Number(searchParams.get('limit')) || 12)) : 12,
    }

    let results
    if (type === 'units') {
      results = await searchUnits(filters)
    } else {
      results = await searchProjects(filters)
    }

    return NextResponse.json(results)
  } catch (error) {
    console.error('Search error:', error)
    return NextResponse.json(
      { error: 'Search failed' },
      { status: 500 }
    )
  }
}
