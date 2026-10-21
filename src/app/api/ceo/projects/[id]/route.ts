import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireCEOApi, logAudit } from '@/lib/permissions'

export const dynamic = 'force-dynamic'

const VALID_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ['PENDING', 'ARCHIVED'],
  PENDING: ['APPROVED', 'REJECTED', 'DRAFT'],
  APPROVED: ['PUBLISHED', 'REJECTED', 'ARCHIVED'],
  REJECTED: ['DRAFT', 'PENDING'],
  PUBLISHED: ['HIDDEN', 'ARCHIVED'],
  HIDDEN: ['PUBLISHED', 'ARCHIVED'],
  ARCHIVED: ['DRAFT'],
}

export async function GET(
  req: Request,
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
            companyNameArabic: true,
            userId: true,
          },
        },
        governorate: { select: { id: true, name: true, nameArabic: true } },
        city: { select: { id: true, name: true, nameArabic: true } },
        district: { select: { id: true, name: true, nameArabic: true } },
        units: {
          select: {
            id: true, name: true, unitType: true, listingType: true, status: true,
            bedrooms: true, bathrooms: true, area: true, price: true,
            pricePerSqm: true, floorPlan: true, slug: true, phaseId: true,
          },
          orderBy: { createdAt: 'desc' },
        },
        amenities: {
          include: { amenity: { select: { id: true, name: true, nameArabic: true, icon: true, category: true } } },
        },
        paymentPlans: {
          include: { milestones: { orderBy: { sortOrder: 'asc' } } },
          orderBy: { sortOrder: 'asc' },
        },
        masterPlanImages: { orderBy: { sortOrder: 'asc' } },
        brochures: { orderBy: { createdAt: 'desc' } },
        phases: { orderBy: { sortOrder: 'asc' } },
        nearbyPlaces: { orderBy: { name: 'asc' } },
        _count: {
          select: {
            units: true,
            amenities: true,
            paymentPlans: true,
            masterPlanImages: true,
            brochures: true,
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
    let devUser: { name: string | null; email: string; phone: string | null } | null = null
    if (project.developer) {
      devUser = await db.user.findUnique({
        where: { id: project.developer.userId },
        select: { name: true, email: true, phone: true },
      })
    }
    const projectOut = {
      ...project,
      developer: project.developer
        ? {
            id: project.developer.id,
            companyName: project.developer.companyName,
            companyNameArabic: project.developer.companyNameArabic,
            user: devUser
              ? { name: devUser.name, email: devUser.email, phone: devUser.phone }
              : null,
          }
        : null,
    }

    const availableUnits = await db.unit.count({
      where: { projectId: params.id, status: 'AVAILABLE', isSample: false },
    })

    return NextResponse.json({ project: projectOut, availableUnits })
  } catch (error) {
    console.error('CEO fetch project error:', error)
    return NextResponse.json({ error: 'Failed to fetch project' }, { status: 500 })
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { error, session } = await requireCEOApi()
    if (error) return error

    const body = await req.json()
    const { reason, ...updateFields } = body

    const existing = await db.project.findUnique({ where: { id: params.id } })
    if (!existing) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const updateData: Record<string, unknown> = {}
    const allowedFields = [
      'name', 'nameArabic', 'tagline', 'taglineArabic',
      'description', 'descriptionArabic',
      'coverImage', 'videoUrl', 'virtualTourUrl',
      'governorateId', 'cityId', 'districtId', 'address',
      'latitude', 'longitude', 'googleMapsUrl',
      'status', 'totalUnits', 'totalArea',
      'completionPercent', 'deliveryDate', 'deliveryTerms',
      'startPrice', 'endPrice', 'pricePerSqm',
      'downPaymentMin', 'installmentYears', 'compoundArea',
      'metaTitle', 'metaDescription',
      'isFeatured', 'isVerified', 'isActive',
      'featuredRank', 'developerId',
    ]

    for (const field of allowedFields) {
      if (updateFields[field] !== undefined) {
        updateData[field] = updateFields[field]
      }
    }

    if (updateFields.propertyTypes !== undefined) {
      updateData.propertyTypes = JSON.stringify(updateFields.propertyTypes)
    }
    if (updateFields.listingTypes !== undefined) {
      updateData.listingTypes = JSON.stringify(updateFields.listingTypes)
    }
    if (updateFields.gallery !== undefined) {
      let gallery = updateFields.gallery
      if (typeof gallery === 'string') {
        try { gallery = JSON.parse(gallery) } catch { gallery = gallery.split('\n').filter(Boolean) }
      }
      updateData.gallery = JSON.stringify(Array.isArray(gallery) ? gallery : [])
    }
    if (updateFields.keywords !== undefined) {
      updateData.keywords = JSON.stringify(updateFields.keywords)
    }
    // 360° panorama images — plain URL array (or single objects with `url`),
    // stored as JSON like `gallery`. Handled here rather than in
    // `allowedFields` because that list is scalar passthrough only.
    if (updateFields.panoramaImages !== undefined) {
      let panos = updateFields.panoramaImages
      if (typeof panos === 'string') {
        try { panos = JSON.parse(panos) } catch { panos = panos.split('\n').map((s: string) => s.trim()).filter(Boolean) }
      }
      if (!Array.isArray(panos)) {
        return NextResponse.json({ error: 'panoramaImages must be an array' }, { status: 400 })
      }
      updateData.panoramaImages = JSON.stringify(
        (panos as Array<string | { url?: string }>)
          .map((item) => (typeof item === 'string' ? item.trim() : item?.url?.trim() ?? ''))
          .filter((url) => url.length > 0),
      )
    }

    // Master plan images — replace the whole set (array of { url, caption } or plain URL strings)
    let masterPlanImages: { url: string; caption: string | null }[] | null = null
    if (updateFields.masterPlanImages !== undefined) {
      let mp = updateFields.masterPlanImages
      if (typeof mp === 'string') {
        try { mp = JSON.parse(mp) } catch { mp = [] }
      }
      if (!Array.isArray(mp)) {
        return NextResponse.json({ error: 'masterPlanImages must be an array' }, { status: 400 })
      }
      masterPlanImages = (mp as Array<string | { url?: string; caption?: string | null }>)
        .map((item) => (typeof item === 'string' ? { url: item, caption: null } : item))
        .filter((item): item is { url: string; caption?: string | null } =>
          !!item && typeof item.url === 'string' && item.url.length > 0)
        .map((item) => ({ url: item.url, caption: item.caption || null }))
    }

    if (updateFields.name && updateFields.name !== existing.name) {
      const slug = updateFields.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
      const slugExists = await db.project.findFirst({ where: { slug, id: { not: params.id } } })
      if (slugExists) {
        return NextResponse.json({ error: 'A project with this name already exists' }, { status: 409 })
      }
      updateData.slug = slug
    }

    const changes: Record<string, unknown> = {}
    for (const key of Object.keys(updateData)) {
      const oldVal = (existing as Record<string, unknown>)[key]
      const newVal = updateData[key]
      if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
        changes[key] = { from: oldVal, to: newVal }
      }
    }

    if (masterPlanImages !== null) {
      changes.masterPlanImages = { count: masterPlanImages.length }
    }

    if (Object.keys(changes).length === 0) {
      return NextResponse.json({ project: existing })
    }

    const project = Object.keys(updateData).length > 0
      ? await db.project.update({
          where: { id: params.id },
          data: updateData,
        })
      : existing

    if (masterPlanImages !== null) {
      await db.masterPlanImage.deleteMany({ where: { projectId: params.id } })
      if (masterPlanImages.length > 0) {
        await db.masterPlanImage.createMany({
          data: masterPlanImages.map((m, i) => ({
            projectId: params.id,
            url: m.url,
            caption: m.caption ?? null,
            sortOrder: i,
          })),
        })
      }
    }

    await logAudit({
      action: 'PROJECT_UPDATED',
      entity: 'Project',
      entityId: params.id,
      userId: (session!.user as any).id,
      changes: { fields: changes, reason: reason || null },
    })

    // F7: notify project watchers about significant verified changes (fail-soft).
    // A startPrice DECREASE fans out the dedicated price-drop alert instead of
    // the generic project-update hook (which also wouldn't refresh snapshot.price).
    let infoFields = Object.keys(changes)
    try {
      const prevStart = (existing as { startPrice?: unknown }).startPrice
      const nextStart = (updateData as { startPrice?: unknown }).startPrice
      if (typeof prevStart === 'number' && typeof nextStart === 'number' && nextStart < prevStart) {
        const { notifyPriceDrop } = await import('@/lib/price-alerts')
        await notifyPriceDrop({ targetType: 'PROJECT', targetId: params.id, oldPrice: prevStart, newPrice: nextStart })
        infoFields = infoFields.filter((f) => f !== 'startPrice')
      }
      if (infoFields.length > 0) {
        const { onProjectInfoChanged } = await import('@/lib/watch')
        await onProjectInfoChanged(params.id, infoFields)
      }
    } catch (e) {
      console.error('[watch] project update hook failed:', e)
    }

    return NextResponse.json({ project })
  } catch (error) {
    console.error('CEO update project error:', error)
    return NextResponse.json({ error: 'Failed to update project' }, { status: 500 })
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { error, session } = await requireCEOApi()
    if (error) return error

    const existing = await db.project.findUnique({ where: { id: params.id } })
    if (!existing) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const { searchParams } = new URL(req.url)
    const hard = searchParams.get('hard') === 'true'

    if (hard) {
      await db.project.delete({ where: { id: params.id } })
    } else {
      await db.project.update({
        where: { id: params.id },
        data: { isActive: false, approvalStatus: 'ARCHIVED' },
      })
    }

    await logAudit({
      action: hard ? 'PROJECT_HARD_DELETED' : 'PROJECT_DELETED',
      entity: 'Project',
      entityId: params.id,
      userId: (session!.user as any).id,
      changes: { previous: { name: existing.name, approvalStatus: existing.approvalStatus }, hard },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('CEO delete project error:', error)
    return NextResponse.json({ error: 'Failed to delete project' }, { status: 500 })
  }
}
