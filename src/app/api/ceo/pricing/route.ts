import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireCEOApi, logAudit } from '@/lib/permissions'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    const { error } = await requireCEOApi()
    if (error) return error

    const { searchParams } = new URL(req.url)
    const projectId = searchParams.get('projectId')
    const search = searchParams.get('search')

    const where: Record<string, unknown> = {}
    if (projectId) where.projectId = projectId
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { unitNumber: { contains: search } },
      ]
    }

    const units = await db.unit.findMany({
      // Pricing console keeps ALL rows (samples included) — CEO prices samples too.
      where,
      select: {
        id: true,
        name: true,
        unitNumber: true,
        unitType: true,
        listingType: true,
        area: true,
        price: true,
        pricePerSqm: true,
        currency: true,
        status: true,
        isSample: true,
        createdAt: true,
        project: {
          select: { id: true, name: true },
        },
        priceHistory: {
          orderBy: { recordedAt: 'desc' },
          take: 10,
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({ units })
  } catch (error) {
    console.error('CEO fetch pricing error:', error)
    return NextResponse.json({ error: 'Failed to fetch pricing' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const { error, session } = await requireCEOApi()
    if (error) return error

    const body = await req.json()
    const { unitIds, type, value, reason } = body

    if (!unitIds || !Array.isArray(unitIds) || unitIds.length === 0) {
      return NextResponse.json({ error: 'unitIds array is required' }, { status: 400 })
    }
    if (!type || !['percentage', 'fixed'].includes(type)) {
      return NextResponse.json({ error: 'type must be "percentage" or "fixed"' }, { status: 400 })
    }
    if (value === undefined || value === null) {
      return NextResponse.json({ error: 'value is required' }, { status: 400 })
    }

    const units = await db.unit.findMany({ where: { id: { in: unitIds } } })
    // Bulk price update by explicit ids — keeps ALL rows (operator chose them).
    if (units.length === 0) return NextResponse.json({ error: 'No units found' }, { status: 404 })

    const results = []
    for (const unit of units) {
      let newPrice: number
      if (type === 'percentage') {
        newPrice = unit.price * (1 + value / 100)
      } else {
        newPrice = unit.price + value
      }
      newPrice = Math.round(newPrice * 100) / 100

      const updated = await db.unit.update({
        where: { id: unit.id },
        data: {
          price: newPrice,
          pricePerSqm: unit.area > 0 ? newPrice / unit.area : null,
        },
      })

      await db.priceHistory.create({
        data: {
          unitId: unit.id,
          price: newPrice,
          change: newPrice - unit.price,
          reason: reason || `Bulk ${type === 'percentage' ? `${value}%` : `+${value}`} price update`,
        },
      })

      await logAudit({
        userId: (session!.user as any).id,
        action: 'BULK_PRICE_UPDATE',
        entity: 'Unit',
        entityId: unit.id,
        changes: { oldPrice: unit.price, newPrice, type, value, reason },
      })

      // Watch alerts (fail-soft): a price DROP fans out the dedicated
      // price-drop alert; any other change keeps the generic F7 hook.
      try {
        if (newPrice < unit.price) {
          const { notifyPriceDrop } = await import('@/lib/price-alerts')
          await notifyPriceDrop({ targetType: 'UNIT', targetId: unit.id, oldPrice: unit.price, newPrice })
        } else {
          const { onUnitPriceChanged } = await import('@/lib/watch')
          await onUnitPriceChanged(unit.id, unit.price, newPrice)
        }
      } catch (e) {
        console.error('[watch] price hook failed:', e)
      }

      results.push(updated)
    }

    // F3: re-scan affected projects for price anomalies (fail-soft)
    try {
      const { detectProjectAnomalies, flagAnomalies, anomalyDetectionEnabled } = await import('@/lib/price-anomaly')
      if (await anomalyDetectionEnabled()) {
        const projectIds = [...new Set(units.map((u) => u.projectId))]
        for (const pid of projectIds) {
          const anomalies = await detectProjectAnomalies(pid)
          await flagAnomalies(anomalies, (session!.user as any).id)
        }
      }
    } catch (e) {
      console.error('[anomaly] bulk scan failed:', e)
    }

    return NextResponse.json({ updated: results.length, units: results })
  } catch (error) {
    console.error('CEO bulk price update error:', error)
    return NextResponse.json({ error: 'Failed to update prices' }, { status: 500 })
  }
}

export async function PATCH(req: Request) {
  try {
    const { error, session } = await requireCEOApi()
    if (error) return error

    const body = await req.json()
    const { id, price, reason } = body

    if (!id) return NextResponse.json({ error: 'Unit ID required' }, { status: 400 })
    if (price === undefined || price === null) return NextResponse.json({ error: 'price is required' }, { status: 400 })

    const existing = await db.unit.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: 'Unit not found' }, { status: 404 })

    const unit = await db.unit.update({
      where: { id },
      data: {
        price,
        pricePerSqm: existing.area > 0 ? price / existing.area : null,
      },
    })

    await db.priceHistory.create({
      data: {
        unitId: id,
        price,
        change: price - existing.price,
        reason: reason || 'Price updated by CEO',
      },
    })

    await logAudit({
      userId: (session!.user as any).id,
      action: 'PRICE_UPDATE',
      entity: 'Unit',
      entityId: id,
      changes: { oldPrice: existing.price, newPrice: price, reason },
    })

    // Watch alerts (fail-soft): a price DROP fans out the dedicated
    // price-drop alert; any other change keeps the generic F7 hook + F3 re-check.
    try {
      if (typeof price === 'number' && price < existing.price) {
        const { notifyPriceDrop } = await import('@/lib/price-alerts')
        await notifyPriceDrop({ targetType: 'UNIT', targetId: id, oldPrice: existing.price, newPrice: price })
      } else {
        const { onUnitPriceChanged } = await import('@/lib/watch')
        await onUnitPriceChanged(id, existing.price, price)
      }
      const { detectProjectAnomalies, flagAnomalies, anomalyDetectionEnabled } = await import('@/lib/price-anomaly')
      if (await anomalyDetectionEnabled()) {
        const anomalies = await detectProjectAnomalies(existing.projectId)
        await flagAnomalies(anomalies, (session!.user as any).id)
      }
    } catch (e) {
      console.error('[watch/anomaly] price hook failed:', e)
    }

    return NextResponse.json({ unit })
  } catch (error) {
    console.error('CEO price update error:', error)
    return NextResponse.json({ error: 'Failed to update price' }, { status: 500 })
  }
}
