import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { PUBLIC_PROJECT_WHERE } from '@/lib/project-visibility'

export const dynamic = 'force-dynamic'

const MAX_IDS = 4

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback
  try {
    const parsed = JSON.parse(raw)
    return (Array.isArray(parsed) ? parsed : fallback) as T
  } catch {
    return fallback
  }
}

/**
 * GET /api/compare?ids=slugA,slugB,slugC
 *
 * Compact, comparison-shaped payload for up to 4 projects. Accepts either the
 * project id or its slug, so the client can keep either in localStorage.
 */
export async function GET(request: NextRequest) {
  try {
    const raw = new URL(request.url).searchParams.get('ids') || ''
    const ids = [...new Set(raw.split(',').map((s) => s.trim()).filter(Boolean))].slice(0, MAX_IDS)

    if (ids.length === 0) {
      return NextResponse.json({ items: [] })
    }

    const projects = await db.project.findMany({
      where: {
        AND: [
          { ...PUBLIC_PROJECT_WHERE },
          { OR: [{ id: { in: ids } }, { slug: { in: ids } }] },
        ],
      },
      select: {
        id: true,
        slug: true,
        name: true,
        nameArabic: true,
        tagline: true,
        coverImage: true,
        status: true,
        startPrice: true,
        endPrice: true,
        pricePerSqm: true,
        downPaymentMin: true,
        installmentYears: true,
        totalUnits: true,
        totalArea: true,
        compoundArea: true,
        completionPercent: true,
        deliveryDate: true,
        propertyTypes: true,
        listingTypes: true,
        isFeatured: true,
        isVerified: true,
        viewCount: true,
        favoriteCount: true,
        createdAt: true,
        developer: { select: { id: true, companyName: true, logo: true, isVerified: true, rating: true, reviewCount: true } },
        governorate: { select: { name: true, nameArabic: true } },
        city: { select: { name: true, nameArabic: true } },
        district: { select: { name: true, nameArabic: true } },
        amenities: {
          select: {
            isPremium: true,
            amenity: { select: { name: true, nameArabic: true, icon: true, category: true } },
          },
        },
        paymentPlans: {
          where: { isActive: true },
          orderBy: [{ isDefault: 'desc' }, { sortOrder: 'asc' }],
          select: {
            id: true,
            name: true,
            downPaymentPct: true,
            installmentYears: true,
            cashDiscount: true,
            isDefault: true,
          },
        },
      },
    })

    // Preserve the caller's ordering — ids may be slugs, so map back by match.
    const byKey = new Map<string, (typeof projects)[number]>()
    for (const p of projects) {
      byKey.set(p.id, p)
      byKey.set(p.slug, p)
    }

    const items = ids
      .map((id) => byKey.get(id))
      .filter((p): p is (typeof projects)[number] => Boolean(p))
      .map((p) => ({
        id: p.id,
        slug: p.slug,
        name: p.name,
        nameArabic: p.nameArabic,
        tagline: p.tagline,
        coverImage: p.coverImage,
        status: p.status,
        startPrice: p.startPrice,
        endPrice: p.endPrice,
        pricePerSqm: p.pricePerSqm,
        downPaymentMin: p.downPaymentMin,
        installmentYears: p.installmentYears,
        totalUnits: p.totalUnits,
        totalArea: p.totalArea,
        compoundArea: p.compoundArea,
        completionPercent: p.completionPercent,
        deliveryDate: p.deliveryDate,
        propertyTypes: parseJson<string[]>(p.propertyTypes, []),
        listingTypes: parseJson<string[]>(p.listingTypes, []),
        isFeatured: p.isFeatured,
        isVerified: p.isVerified,
        viewCount: p.viewCount,
        favoriteCount: p.favoriteCount,
        developer: p.developer,
        location: [p.governorate?.name, p.city?.name, p.district?.name]
          .filter(Boolean)
          .join(', ') || null,
        amenities: p.amenities.map((a) => ({
          name: a.amenity.name,
          icon: a.amenity.icon,
          category: a.amenity.category,
          isPremium: a.isPremium,
        })),
        paymentPlans: p.paymentPlans,
      }))

    return NextResponse.json(
      { items, total: items.length },
      { headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=300' } }
    )
  } catch (error) {
    console.error('Compare error:', error)
    return NextResponse.json({ error: 'Failed to load comparison' }, { status: 500 })
  }
}
