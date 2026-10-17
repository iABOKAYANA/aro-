import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireCEOApi } from '@/lib/permissions'
import { getNewLaunchesConfig, computeIsNewLaunch } from '@/lib/new-launches'

export const dynamic = 'force-dynamic'

// ─── GET /api/ceo/projects-all/[id] — one project, every field ──
export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { error } = await requireCEOApi()
    if (error) return error

    const project = await db.project.findUnique({
      where: { id: params.id },
      include: {
        developer: {
          select: {
            id: true,
            companyName: true,
            logo: true,
            isVerified: true,
            userId: true,
          },
        },
        governorate: { select: { name: true, nameArabic: true } },
        city: { select: { name: true, nameArabic: true, nameSlug: true } },
        district: { select: { name: true, nameArabic: true } },
        units: {
          orderBy: { price: 'asc' },
          take: 100,
          select: {
            id: true, name: true, unitNumber: true, unitType: true, listingType: true,
            status: true, bedrooms: true, bathrooms: true, area: true, price: true,
            floor: true, view: true, downPayment: true, monthlyInstallment: true,
          },
        },
        phases: {
          orderBy: { sortOrder: 'asc' },
          select: {
            id: true, name: true, nameArabic: true, status: true,
            deliveryDate: true, totalUnits: true, startPrice: true, endPrice: true,
          },
        },
        paymentPlans: {
          orderBy: { sortOrder: 'asc' },
          select: {
            id: true, name: true, downPaymentPct: true, installmentYears: true,
            maintenanceFeePct: true, cashDiscount: true, isDefault: true, isActive: true,
          },
        },
        amenities: { select: { amenity: { select: { id: true, name: true, icon: true } } } },
        masterPlanImages: {
          orderBy: { sortOrder: 'asc' },
          select: { id: true, url: true, caption: true },
        },
        brochures: { select: { id: true, name: true, url: true, fileSize: true, pageCount: true, createdAt: true } },
        nearbyPlaces: {
          take: 20,
          select: { id: true, name: true, type: true, distance: true },
        },
        _count: {
          select: {
            leads: true,
            deals: true,
            viewings: true,
            brokerAccess: true,
            commissionRules: true,
            blogs: true,
          },
        },
      },
    })

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    // DeveloperProfile.userId can dangle (profile row outlives its User row).
    // `user` is a required relation in schema, so a nested `user` select
    // throws and 500s the whole page — side-load the User instead, null when gone.
    let devUser: { id: string; name: string | null; email: string } | null = null
    if (project.developer) {
      devUser = await db.user.findUnique({
        where: { id: project.developer.userId },
        select: { id: true, name: true, email: true },
      })
    }
    const projectWithDev = {
      ...project,
      developer: project.developer
        ? {
            id: project.developer.id,
            companyName: project.developer.companyName,
            logo: project.developer.logo,
            isVerified: project.developer.isVerified,
            user: devUser
              ? { id: devUser.id, name: devUser.name, email: devUser.email }
              : null,
          }
        : null,
    }

    // aggregates for the units sample — buyable inventory only (no showcase samples)
    const allUnits = await db.unit.aggregate({
      where: { projectId: project.id, isSample: false },
      _count: { _all: true },
      _min: { price: true },
      _max: { price: true },
      _sum: { area: true },
    })

    const launchConfig = await getNewLaunchesConfig()

    return NextResponse.json({
      project: { ...projectWithDev, isNewLaunch: computeIsNewLaunch(launchConfig, project) },
      unitStats: {
        count: allUnits._count._all,
        minPrice: allUnits._min.price,
        maxPrice: allUnits._max.price,
        totalArea: allUnits._sum.area,
      },
    })
  } catch (err) {
    console.error('Project detail GET error:', err)
    return NextResponse.json({ error: 'Failed to load project' }, { status: 500 })
  }
}
