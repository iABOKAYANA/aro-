import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireCEOApi, logAudit } from '@/lib/permissions'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    const { error } = await requireCEOApi()
    if (error) return error

    const { searchParams } = new URL(req.url)
    const search = searchParams.get('search')?.slice(0, 100) || null
    const approvalStatus = searchParams.get('approvalStatus')
    const status = searchParams.get('status')
    const developerId = searchParams.get('developerId')
    const governorateId = searchParams.get('governorateId')
    const cityId = searchParams.get('cityId')
    const propertyType = searchParams.get('propertyType')?.slice(0, 40) || null
    const sort = ['createdAt', 'updatedAt', 'name', 'startPrice', 'viewCount'].includes(searchParams.get('sort') || '')
      ? searchParams.get('sort')!
      : 'createdAt'
    const order = searchParams.get('order') === 'asc' ? 'asc' : 'desc'
    const minPriceRaw = searchParams.get('minPrice')
    const maxPriceRaw = searchParams.get('maxPrice')
    const page = Math.min(500, Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1))
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20', 10) || 20))

    const where: Record<string, unknown> = {}
    const APPROVAL_RE = /^(DRAFT|PENDING|APPROVED|PUBLISHED|REJECTED|HIDDEN|ARCHIVED)$/
    const STATUS_RE = /^(COMING_SOON|UNDER_CONSTRUCTION|READY|DELIVERED|SOLD_OUT)$/
    if (approvalStatus && APPROVAL_RE.test(approvalStatus)) where.approvalStatus = approvalStatus
    if (status && STATUS_RE.test(status)) where.status = status
    if (developerId) where.developerId = developerId
    if (governorateId) where.governorateId = governorateId
    if (cityId) where.cityId = cityId
    if (propertyType) where.propertyTypes = { contains: propertyType }
    const minPrice = minPriceRaw !== null ? Number(minPriceRaw) : NaN
    const maxPrice = maxPriceRaw !== null ? Number(maxPriceRaw) : NaN
    if (Number.isFinite(minPrice) || Number.isFinite(maxPrice)) {
      const priceFilter: Record<string, number> = {}
      if (Number.isFinite(minPrice) && minPrice >= 0) priceFilter.gte = Math.min(minPrice, 1_000_000_000_000)
      if (Number.isFinite(maxPrice) && maxPrice >= 0) priceFilter.lte = Math.min(maxPrice, 1_000_000_000_000)
      if (Object.keys(priceFilter).length > 0) where.startPrice = priceFilter
    }
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { nameArabic: { contains: search } },
        { tagline: { contains: search } },
      ]
    }

    const orderBy: Record<string, string> = {}
    if (sort === 'name') orderBy.name = order
    else if (sort === 'startPrice') orderBy.startPrice = order
    else if (sort === 'viewCount') orderBy.viewCount = order
    else if (sort === 'updatedAt') orderBy.updatedAt = order
    else orderBy.createdAt = order

    const skip = (page - 1) * limit

    const [projectRows, total, statusCounts] = await Promise.all([
      db.project.findMany({
        where,
        include: {
          developer: {
            select: {
              id: true,
              companyName: true,
              userId: true,
            },
          },
          governorate: { select: { id: true, name: true } },
          city: { select: { id: true, name: true } },
          _count: {
            select: {
              units: true,
              amenities: true,
              paymentPlans: true,
            },
          },
        },
        orderBy,
        skip,
        take: limit,
      }),
      db.project.count({ where }),
      db.project.groupBy({
        by: ['approvalStatus'],
        _count: { id: true },
      }),
    ])

    // DeveloperProfile.userId can dangle (profile row outlives its User row).
    // `user` is a required relation in schema, so a nested `user` select
    // throws and 500s the whole page — side-load Users instead, null when gone.
    const projectDevUserIds = [
      ...new Set(
        projectRows
          .map((p) => p.developer?.userId)
          .filter((v): v is string => typeof v === 'string'),
      ),
    ]
    const projectDevUserRows =
      projectDevUserIds.length > 0
        ? await db.user.findMany({
            where: { id: { in: projectDevUserIds } },
            select: { id: true, name: true, email: true },
          })
        : []
    const projectDevUserById = new Map(projectDevUserRows.map((u) => [u.id, u]))

    const projects = projectRows.map((p) => {
      if (!p.developer) return { ...p, developer: null }
      const u = projectDevUserById.get(p.developer.userId)
      return {
        ...p,
        developer: {
          id: p.developer.id,
          companyName: p.developer.companyName,
          userId: p.developer.userId,
          // `name` alias — the CEO projects page reads `project.developer?.name`.
          name: p.developer.companyName,
          user: u ? { name: u.name, email: u.email } : null,
        },
      }
    })

    const counts: Record<string, number> = {}
    statusCounts.forEach((s) => {
      counts[s.approvalStatus] = s._count.id
    })

    return NextResponse.json({
      projects,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      limit,
      statusCounts: counts,
    })
  } catch (error) {
    console.error('CEO fetch projects error:', error)
    return NextResponse.json({ error: 'Failed to fetch projects' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const { error, session } = await requireCEOApi()
    if (error) return error

    const body = await req.json()
    const {
      developerId, name, nameArabic, tagline, taglineArabic,
      description, descriptionArabic,
      governorateId, cityId, districtId, address,
      propertyTypes, listingTypes, status, totalUnits, totalArea,
      startPrice, endPrice, pricePerSqm, downPaymentMin,
      installmentYears, compoundArea,
      deliveryDate, deliveryTerms, completionPercent,
      coverImage, gallery, videoUrl, virtualTourUrl,
      latitude, longitude, googleMapsUrl,
      metaTitle, metaDescription, keywords,
      isFeatured, isActive,
    } = body

    if (!developerId || !name) {
      return NextResponse.json({ error: 'Developer ID and name are required' }, { status: 400 })
    }

    if (typeof name !== 'string' || !name.trim() || name.trim().length > 200) {
      return NextResponse.json({ error: 'Name must be 1–200 characters' }, { status: 400 })
    }

    const devProfile = await db.developerProfile.findUnique({ where: { id: developerId } })
    if (!devProfile) {
      return NextResponse.json({ error: 'Developer not found' }, { status: 404 })
    }

    // Numeric ranges — reject NaN/negative/absurd values before Prisma.
    const num = (v: unknown): number | null => {
      if (v === undefined || v === null || v === '') return null
      const n = Number(v)
      return Number.isFinite(n) ? n : NaN
    }
    const startPriceN = num(startPrice)
    const endPriceN = num(endPrice)
    const pricePerSqmN = num(pricePerSqm)
    const totalUnitsN = num(totalUnits)
    const totalAreaN = num(totalArea)
    const downPaymentMinN = num(downPaymentMin)
    const installmentYearsN = num(installmentYears)
    const compoundAreaN = num(compoundArea)
    const completionPercentN = num(completionPercent) ?? 0
    const nums = { startPriceN, endPriceN, pricePerSqmN, totalUnitsN, totalAreaN, downPaymentMinN, installmentYearsN, compoundAreaN }
    for (const [k, v] of Object.entries(nums)) {
      if (v !== null && (!Number.isFinite(v) || v < 0 || v > 1_000_000_000_000)) {
        return NextResponse.json({ error: `Invalid ${k.replace(/N$/, '')}` }, { status: 400 })
      }
    }
    if (!Number.isFinite(completionPercentN) || completionPercentN < 0 || completionPercentN > 100) {
      return NextResponse.json({ error: 'completionPercent must be 0–100' }, { status: 400 })
    }
    if (installmentYearsN !== null && (installmentYearsN < 0 || installmentYearsN > 30)) {
      return NextResponse.json({ error: 'installmentYears must be 0–30' }, { status: 400 })
    }
    if (downPaymentMinN !== null && (downPaymentMinN < 0 || downPaymentMinN > 100)) {
      return NextResponse.json({ error: 'downPaymentMin must be 0–100' }, { status: 400 })
    }

    const slugBase = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
    // Arabic-only (or symbol-only) names transliterate to an empty slug —
    // fall back to a unique non-empty slug instead of writing `''`.
    const { randomBytes } = await import('node:crypto')
    const slug = slugBase || `project-${Date.now().toString(36)}-${randomBytes(3).toString('hex')}`
    const existingSlug = await db.project.findUnique({ where: { slug } })
    if (existingSlug) {
      return NextResponse.json({ error: 'A project with this name already exists' }, { status: 409 })
    }

    const project = await db.project.create({
      data: {
        developerId,
        name,
        nameArabic: nameArabic || null,
        slug,
        tagline: tagline || null,
        taglineArabic: taglineArabic || null,
        description: description || null,
        descriptionArabic: descriptionArabic || null,
        governorateId: governorateId || null,
        cityId: cityId || null,
        districtId: districtId || null,
        address: address || null,
        propertyTypes: propertyTypes ? JSON.stringify(propertyTypes) : '[]',
        listingTypes: listingTypes ? JSON.stringify(listingTypes) : '[]',
        status: status || 'COMING_SOON',
        approvalStatus: 'DRAFT',
        totalUnits: totalUnitsN ?? null,
        totalArea: totalAreaN ?? null,
        startPrice: startPriceN ?? null,
        endPrice: endPriceN ?? null,
        pricePerSqm: pricePerSqmN ?? null,
        downPaymentMin: downPaymentMinN ?? null,
        installmentYears: installmentYearsN ?? null,
        compoundArea: compoundAreaN ?? null,
        deliveryDate: deliveryDate ? new Date(deliveryDate) : null,
        deliveryTerms: deliveryTerms || null,
        completionPercent: Math.round(completionPercentN) || 0,
        coverImage: coverImage || null,
        gallery: gallery ? JSON.stringify(gallery) : '[]',
        videoUrl: videoUrl || null,
        virtualTourUrl: virtualTourUrl || null,
        latitude: latitude || null,
        longitude: longitude || null,
        googleMapsUrl: googleMapsUrl || null,
        metaTitle: metaTitle || null,
        metaDescription: metaDescription || null,
        keywords: keywords ? JSON.stringify(keywords) : '[]',
        isFeatured: isFeatured || false,
        isActive: isActive !== undefined ? isActive : true,
      },
    })

    await logAudit({
      action: 'PROJECT_CREATED',
      entity: 'Project',
      entityId: project.id,
      userId: (session!.user as any).id,
      changes: { after: { name, developerId, status: project.status, approvalStatus: 'DRAFT' } },
    })

    // F12: city follows — a project only "exists" once it is visible.
    // CEO creates land as DRAFT (gate inside stays silent), but the hook is
    // here so any directly-visible creation fans out. Fail-soft, after write.
    try {
      const { notifyCityWatchersForProject } = await import('@/lib/price-alerts')
      await notifyCityWatchersForProject(project.id)
    } catch (e) {
      console.error('[city-alerts] ceo create hook failed:', e)
    }

    return NextResponse.json({ project }, { status: 201 })
  } catch (error) {
    console.error('CEO create project error:', error)
    return NextResponse.json({ error: 'Failed to create project' }, { status: 500 })
  }
}
