import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireCEOApi } from '@/lib/permissions'

export const dynamic = 'force-dynamic'

// Max projects per export — sane cap so one click can't OOM the server.
const MAX_PROJECTS = 5000

// ─── GET /api/ceo/areas-survey ─────────────────────────────────
// CEO/ADMIN only. Denormalized areas → projects → units + payment plans
// snapshot for the Excel export. Optional filters:
//
//   ?governorate=<id | nameSlug>   ?city=<id | nameSlug>
//
// Both params accept either the row id or the URL slug (slug matched
// case-insensitively); the resolved form is echoed back in `meta.resolved`
// so the UI can show what was actually applied. No pagination — the cap
// above applies and `meta.capped` reports whether it was hit.
//
// No secrets anywhere: every column is an explicitly listed safe scalar
// (there are no password/token fields on these models to begin with).
export async function GET(req: Request) {
  try {
    const { error } = await requireCEOApi()
    if (error) return error

    const { searchParams } = new URL(req.url)
    const governorateParam = searchParams.get('governorate')?.trim() || null
    const cityParam = searchParams.get('city')?.trim() || null

    // ─── Resolve governorate (id or slug) ───
    let governorateId: string | null = null
    let governorateResolvedAs: 'id' | 'slug' | 'name' | null = null
    if (governorateParam) {
      const byId = await db.governorate.findUnique({
        where: { id: governorateParam },
        select: { id: true },
      })
      if (byId) {
        governorateId = byId.id
        governorateResolvedAs = 'id'
      } else {
        const bySlug = await db.governorate.findUnique({
          where: { nameSlug: governorateParam.toLowerCase() },
          select: { id: true },
        })
        if (bySlug) {
          governorateId = bySlug.id
          governorateResolvedAs = 'slug'
        } else {
          // SQLite has no `mode: 'insensitive'` — match case-insensitively in JS
          // (governorates table is tiny so fetching names is cheap).
          const allGov = await db.governorate.findMany({ select: { id: true, name: true } })
          const byName = allGov.find(
            (g) => g.name.toLowerCase() === governorateParam.toLowerCase()
          )
          if (byName) {
            governorateId = byName.id
            governorateResolvedAs = 'name'
          }
        }
      }
      if (!governorateId) {
        return NextResponse.json(
          { error: `Unknown governorate: "${governorateParam}" (expected id or slug)` },
          { status: 400 }
        )
      }
    }

    // ─── Resolve city (id or slug) ───
    let cityId: string | null = null
    let cityResolvedAs: 'id' | 'slug' | 'name' | null = null
    if (cityParam) {
      const byId = await db.city.findUnique({
        where: { id: cityParam },
        select: { id: true, governorateId: true },
      })
      if (byId) {
        cityId = byId.id
        cityResolvedAs = 'id'
      } else {
        const bySlug = await db.city.findFirst({
          where: {
            nameSlug: cityParam.toLowerCase(),
            ...(governorateId ? { governorateId } : {}),
          },
          select: { id: true, governorateId: true },
        })
        if (bySlug) {
          cityId = bySlug.id
          cityResolvedAs = 'slug'
        } else {
          // Same SQLite-safe case-insensitive match as governorates above.
          const allCities = await db.city.findMany({
            where: governorateId ? { governorateId } : {},
            select: { id: true, name: true, governorateId: true },
          })
          const byName = allCities.find(
            (c) => c.name.toLowerCase() === cityParam.toLowerCase()
          )
          if (byName) {
            cityId = byName.id
            cityResolvedAs = 'name'
          }
        }
      }
      if (!cityId) {
        return NextResponse.json(
          { error: `Unknown city: "${cityParam}" (expected id or slug)` },
          { status: 400 }
        )
      }
    }

    // ─── Project scope ───
    // A project is in scope when it links to the filtered geography either
    // directly (governorateId/cityId) or transitively (city.governorateId).
    const where: any = {}
    if (cityId) {
      where.cityId = cityId
    } else if (governorateId) {
      where.OR = [
        { governorateId },
        { city: { governorateId } },
        // Belt-and-braces: district → city → governorate
        { district: { city: { governorateId } } },
      ]
    }

    const totalMatching = await db.project.count({ where })

    const rows = await db.project.findMany({
      where,
      orderBy: [{ city: { name: 'asc' } }, { name: 'asc' }],
      take: MAX_PROJECTS + 1,
      select: {
        // ── ALL Project scalars (explicit — no secrets on this model) ──
        id: true,
        developerId: true,
        name: true,
        nameArabic: true,
        slug: true,
        tagline: true,
        taglineArabic: true,
        description: true,
        descriptionArabic: true,
        coverImage: true,
        gallery: true,
        videoUrl: true,
        virtualTourUrl: true,
        panoramaImages: true,
        governorateId: true,
        cityId: true,
        districtId: true,
        address: true,
        latitude: true,
        longitude: true,
        lat: true,
        lng: true,
        googleMapsUrl: true,
        propertyTypes: true,
        listingTypes: true,
        status: true,
        approvalStatus: true,
        rejectionReason: true,
        totalUnits: true,
        totalArea: true,
        completionPercent: true,
        deliveryDate: true,
        deliveryTerms: true,
        startPrice: true,
        endPrice: true,
        pricePerSqm: true,
        downPaymentMin: true,
        installmentYears: true,
        MaintenanceFeePercent: true,
        compoundArea: true,
        metaTitle: true,
        metaDescription: true,
        keywords: true,
        dataTrust: true,
        isFeatured: true,
        isVerified: true,
        isActive: true,
        viewCount: true,
        favoriteCount: true,
        inquiryCount: true,
        featuredRank: true,
        publishedAt: true,
        createdAt: true,
        updatedAt: true,
        // ── relations needed for denormalization ──
        developer: { select: { companyName: true, companyNameArabic: true } },
        governorate: { select: { id: true, name: true, nameArabic: true, nameSlug: true } },
        city: {
          select: {
            id: true,
            name: true,
            nameArabic: true,
            nameSlug: true,
            governorate: { select: { id: true, name: true, nameArabic: true, nameSlug: true } },
          },
        },
        district: { select: { id: true, name: true, nameArabic: true, nameSlug: true } },
        units: {
          orderBy: { price: 'asc' },
          select: {
            // ── ALL Unit scalars (explicit — no secrets on this model) ──
            id: true,
            projectId: true,
            phaseId: true,
            name: true,
            nameArabic: true,
            unitNumber: true,
            floor: true,
            unitType: true,
            listingType: true,
            status: true,
            bedrooms: true,
            bathrooms: true,
            area: true,
            netArea: true,
            roofArea: true,
            gardenArea: true,
            price: true,
            pricePerSqm: true,
            currency: true,
            downPayment: true,
            monthlyInstallment: true,
            installmentYears: true,
            deliveryTerms: true,
            finishingType: true,
            view: true,
            isCorner: true,
            hasBalcony: true,
            hasParking: true,
            parkingNumber: true,
            gallery: true,
            floorPlan: true,
            brochureUrl: true,
            isFeatured: true,
            isSample: true,
            viewCount: true,
            favoriteCount: true,
            metaTitle: true,
            metaDescription: true,
            slug: true,
            dataTrust: true,
            createdAt: true,
            updatedAt: true,
          },
        },
        paymentPlans: {
          orderBy: { sortOrder: 'asc' },
          select: {
            // ── ALL PaymentPlan scalars (explicit) ──
            id: true,
            projectId: true,
            phaseId: true,
            name: true,
            nameArabic: true,
            description: true,
            downPaymentPct: true,
            installmentYears: true,
            maintenanceFeePct: true,
            semiAnnualPct: true,
            deliveryPaymentPct: true,
            cashDiscount: true,
            isDefault: true,
            isActive: true,
            sortOrder: true,
            createdAt: true,
            updatedAt: true,
            milestones: {
              orderBy: { sortOrder: 'asc' },
              select: {
                // ── ALL PaymentMilestone scalars (explicit) ──
                id: true,
                paymentPlanId: true,
                name: true,
                nameArabic: true,
                percentage: true,
                monthNumber: true,
                description: true,
                sortOrder: true,
              },
            },
          },
        },
      },
    })

    const capped = rows.length > MAX_PROJECTS
    const projects = capped ? rows.slice(0, MAX_PROJECTS) : rows

    // ─── Group into areas (one bucket per city; projects with no city fall
    // into an "unassigned" bucket under their own governorate) ───
    type Area = {
      key: string
      city: { id: string; name: string; nameArabic: string; nameSlug: string } | null
      governorate: { id: string; name: string; nameArabic: string; nameSlug: string } | null
      projects: typeof projects
    }
    const areaMap = new Map<string, Area>()
    for (const p of projects) {
      const pAny = p as unknown as {
        city: {
          id: string
          name: string
          nameArabic: string
          nameSlug: string
          governorate: { id: string; name: string; nameArabic: string; nameSlug: string }
        } | null
        governorate: { id: string; name: string; nameArabic: string; nameSlug: string } | null
      }
      let key: string
      let city: Area['city'] = null
      let governorate: Area['governorate'] = null
      if (pAny.city) {
        key = `city:${pAny.city.id}`
        city = {
          id: pAny.city.id,
          name: pAny.city.name,
          nameArabic: pAny.city.nameArabic,
          nameSlug: pAny.city.nameSlug,
        }
        governorate = pAny.city.governorate ?? null
      } else if (pAny.governorate) {
        key = `gov-unassigned:${pAny.governorate.id}`
        governorate = pAny.governorate
      } else {
        key = 'unassigned'
      }
      let bucket = areaMap.get(key)
      if (!bucket) {
        bucket = { key, city, governorate, projects: [] }
        areaMap.set(key, bucket)
      }
      bucket.projects.push(p)
    }

    const areas = [...areaMap.values()].sort((a, b) => {
      const an = a.city?.name ?? a.governorate?.name ?? ''
      const bn = b.city?.name ?? b.governorate?.name ?? ''
      return an.localeCompare(bn)
    })

    const unitCount = projects.reduce((n, p) => n + p.units.length, 0)
    const planCount = projects.reduce((n, p) => n + p.paymentPlans.length, 0)

    return NextResponse.json({
      areas,
      meta: {
        totalMatching,
        returned: projects.length,
        capped,
        cap: MAX_PROJECTS,
        unitCount,
        planCount,
        filters: { governorate: governorateParam, city: cityParam },
        resolved: {
          governorateId,
          governorateResolvedAs,
          cityId,
          cityResolvedAs,
        },
      },
    })
  } catch (err) {
    console.error('Areas-survey GET error:', err)
    return NextResponse.json({ error: 'Failed to load areas survey' }, { status: 500 })
  }
}
