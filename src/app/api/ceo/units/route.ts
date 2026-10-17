import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireCEOApi, logAudit } from '@/lib/permissions'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    const { error, session, role } = await requireCEOApi()
    if (error) return error

    const { searchParams } = new URL(req.url)
    const search = searchParams.get('search')
    const status = searchParams.get('status')
    const projectId = searchParams.get('projectId')
    const unitType = searchParams.get('unitType')
    const listingType = searchParams.get('listingType')

    const where: Record<string, unknown> = {}
    if (status) where.status = status
    if (projectId) where.projectId = projectId
    if (unitType) where.unitType = unitType
    if (listingType) where.listingType = listingType
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { unitNumber: { contains: search } },
        { nameArabic: { contains: search } },
      ]
    }

    const units = await db.unit.findMany({
      // CEO management list keeps ALL rows (samples included, badged in UI).
      where,
      include: {
        project: {
          select: {
            id: true,
            name: true,
            slug: true,
            developer: {
              select: {
                id: true,
                companyName: true,
                user: { select: { name: true } },
              },
            },
          },
        },
        phase: { select: { id: true, name: true } },
        priceHistory: {
          orderBy: { recordedAt: 'desc' },
          take: 5,
        },
        _count: {
          select: { favorites: true, inquiries: true, viewings: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({ units })
  } catch (error) {
    console.error('CEO fetch units error:', error)
    return NextResponse.json({ error: 'Failed to fetch units' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const { error, session } = await requireCEOApi()
    if (error) return error

    const body = await req.json()
    const { projectId, name, nameArabic, unitNumber, floor, unitType, listingType, bedrooms, bathrooms, area, netArea, price, currency, finishingType, phaseId, floorPlan, isSample } = body

    if (!projectId || !name || !unitType || !listingType || area === undefined || price === undefined) {
      return NextResponse.json({ error: 'Missing required fields: projectId, name, unitType, listingType, area, price' }, { status: 400 })
    }
    if (isSample !== undefined && typeof isSample !== 'boolean') {
      return NextResponse.json({ error: 'isSample must be a boolean' }, { status: 400 })
    }

    const project = await db.project.findUnique({ where: { id: projectId } })
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

    const slug = `${name.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`

    const unit = await db.unit.create({
      data: {
        projectId,
        phaseId: phaseId || null,
        name,
        nameArabic: nameArabic || null,
        unitNumber: unitNumber || null,
        floor: floor ?? null,
        unitType,
        listingType,
        bedrooms: bedrooms ?? null,
        bathrooms: bathrooms ?? null,
        area,
        netArea: netArea ?? null,
        price,
        pricePerSqm: area > 0 ? price / area : null,
        currency: currency || 'EGP',
        finishingType: finishingType || null,
        floorPlan: floorPlan || null,
        slug,
        isSample: isSample === true,
      },
    })

    await db.priceHistory.create({
      data: { unitId: unit.id, price, reason: 'Initial price' },
    })

    // F7: notify project watchers about the new unit (fail-soft)
    try {
      const { onProjectUnitAdded } = await import('@/lib/watch')
      await onProjectUnitAdded(projectId, unit.id, name, price)
    } catch (e) {
      console.error('[watch] new unit hook failed:', e)
    }

    await logAudit({
      userId: (session!.user as any).id,
      action: 'CREATE',
      entity: 'Unit',
      entityId: unit.id,
      changes: { name, unitType, listingType, area, price, projectId, isSample: isSample === true },
    })

    return NextResponse.json({ unit }, { status: 201 })
  } catch (error) {
    console.error('CEO create unit error:', error)
    return NextResponse.json({ error: 'Failed to create unit' }, { status: 500 })
  }
}

export async function PATCH(req: Request) {
  try {
    const { error, session } = await requireCEOApi()
    if (error) return error

    const body = await req.json()
    const { id, ...fields } = body
    if (!id) return NextResponse.json({ error: 'Unit ID required' }, { status: 400 })

    const existing = await db.unit.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: 'Unit not found' }, { status: 404 })

    const updateData: Record<string, unknown> = {}
    const allowedFields = ['name', 'nameArabic', 'unitNumber', 'floor', 'unitType', 'listingType', 'status', 'bedrooms', 'bathrooms', 'area', 'netArea', 'roofArea', 'gardenArea', 'price', 'currency', 'downPayment', 'monthlyInstallment', 'installmentYears', 'deliveryTerms', 'finishingType', 'view', 'isCorner', 'hasBalcony', 'hasParking', 'parkingNumber', 'isFeatured', 'isSample', 'phaseId', 'metaTitle', 'metaDescription', 'floorPlan', 'brochureUrl']

    if (fields.isSample !== undefined && typeof fields.isSample !== 'boolean') {
      return NextResponse.json({ error: 'isSample must be a boolean' }, { status: 400 })
    }

    for (const key of allowedFields) {
      if (fields[key] !== undefined) {
        updateData[key] = fields[key]
      }
    }

    if (updateData.area && (updateData.area as number) > 0 && (updateData.price || existing.price)) {
      updateData.pricePerSqm = ((updateData.price as number) || existing.price) / (updateData.area as number)
    } else if (updateData.price && existing.area && existing.area > 0) {
      updateData.pricePerSqm = (updateData.price as number) / existing.area
    }

    if (fields.gallery !== undefined) updateData.gallery = JSON.stringify(fields.gallery)

    const unit = await db.unit.update({ where: { id }, data: updateData })

    // F7: watch alerts + F3: anomaly re-check when price/availability changed (fail-soft).
    // A price DROP fans out the dedicated price-drop alert instead of the generic F7 hook.
    try {
      const { onUnitPriceChanged, onUnitAvailabilityChanged } = await import('@/lib/watch')
      if (fields.price !== undefined && fields.price !== existing.price) {
        if (typeof fields.price === 'number' && fields.price < existing.price) {
          const { notifyPriceDrop } = await import('@/lib/price-alerts')
          await notifyPriceDrop({ targetType: 'UNIT', targetId: id, oldPrice: existing.price, newPrice: fields.price })
        } else {
          await onUnitPriceChanged(id, existing.price, fields.price)
        }
      }
      if (fields.status !== undefined && fields.status !== existing.status) {
        await onUnitAvailabilityChanged(id, existing.status, fields.status)
      }
      if (fields.price !== undefined && fields.price !== existing.price) {
        const { detectProjectAnomalies, flagAnomalies, anomalyDetectionEnabled } = await import('@/lib/price-anomaly')
        if (await anomalyDetectionEnabled()) {
          const anomalies = await detectProjectAnomalies(existing.projectId)
          await flagAnomalies(anomalies, (session!.user as any).id)
        }
      }
    } catch (e) {
      console.error('[watch/anomaly] unit hooks failed:', e)
    }

    if (fields.price !== undefined && fields.price !== existing.price) {
      await db.priceHistory.create({
        data: {
          unitId: id,
          price: fields.price,
          change: fields.price - existing.price,
          reason: fields.priceReason || 'Price updated by CEO',
        },
      })

      await logAudit({
        userId: (session!.user as any).id,
        action: 'UPDATE',
        entity: 'Unit',
        entityId: id,
        changes: { field: 'price', old: existing.price, new: fields.price },
      })
    }

    await logAudit({
      userId: (session!.user as any).id,
      action: 'UPDATE',
      entity: 'Unit',
      entityId: id,
      changes: updateData,
    })

    return NextResponse.json({ unit })
  } catch (error) {
    console.error('CEO update unit error:', error)
    return NextResponse.json({ error: 'Failed to update unit' }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  try {
    const { error, session } = await requireCEOApi()
    if (error) return error

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'Unit ID required' }, { status: 400 })

    const existing = await db.unit.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: 'Unit not found' }, { status: 404 })

    const unit = await db.unit.update({
      where: { id },
      data: { status: 'HIDDEN' },
    })

    // F7: availability change → watch alert (fail-soft)
    try {
      const { onUnitAvailabilityChanged } = await import('@/lib/watch')
      await onUnitAvailabilityChanged(id, existing.status, 'HIDDEN')
    } catch (e) {
      console.error('[watch] availability hook failed:', e)
    }

    await logAudit({
      userId: (session!.user as any).id,
      action: 'DELETE',
      entity: 'Unit',
      entityId: id,
      changes: { previousStatus: existing.status, newStatus: 'HIDDEN' },
    })

    return NextResponse.json({ success: true, unit })
  } catch (error) {
    console.error('CEO delete unit error:', error)
    return NextResponse.json({ error: 'Failed to delete unit' }, { status: 500 })
  }
}
