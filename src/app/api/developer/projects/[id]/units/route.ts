import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/permissions'
import { checkProjectLowStock } from '@/lib/developer-low-stock'
import { requireOwnProject } from '@/lib/developer-projects'
import { blockWhenRequestOnly } from '@/lib/edit-requests'

export const dynamic = 'force-dynamic'

/**
 * Developer-scoped unit writes on an OWN project (any approval state —
 * visibility follows the project, so units on PENDING projects stay hidden
 * until the CEO approves). The project id comes from the path; any
 * client-sent `projectId`/`developerId` is ignored. Foreign projects → 403.
 *
 * POST   /api/developer/projects/[id]/units  {name*, unitType*, listingType*,
 *          area*, price*, nameArabic?, unitNumber?, floor?, bedrooms?,
 *          bathrooms?, netArea?, currency?, finishingType?, phaseId?,
 *          floorPlan?, isSample?} → 201 { unit }
 * PATCH  /api/developer/projects/[id]/units  {id*, ...fields} → 200 { unit }
 *          (allowed fields mirror PATCH /api/ceo/units; the unit must belong
 *          to the path project)
 * DELETE /api/developer/projects/[id]/units?id=<unitId> → 200 { success, unit }
 *          (soft-delete: status → HIDDEN, same as the CEO route)
 */
export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const gate = await requireOwnProject(params.id)
    if (!gate.ok) return gate.response

    const body = await req.json()
    // Path project id wins — any client-sent projectId/developerId is ignored.
    const { projectId: _ignoredProjectId, developerId: _ignoredDeveloperId, ...rest } = body
    void _ignoredProjectId
    void _ignoredDeveloperId
    const { name, nameArabic, unitNumber, floor, unitType, listingType, bedrooms, bathrooms, area, netArea, price, currency, finishingType, phaseId, floorPlan, isSample } = rest

    if (!name || !unitType || !listingType || area === undefined || price === undefined) {
      return NextResponse.json({ error: 'Missing required fields: name, unitType, listingType, area, price' }, { status: 400 })
    }
    if (isSample !== undefined && typeof isSample !== 'boolean') {
      return NextResponse.json({ error: 'isSample must be a boolean' }, { status: 400 })
    }

    if (phaseId) {
      const phase = await db.projectPhase.findUnique({ where: { id: phaseId }, select: { projectId: true } })
      if (!phase || phase.projectId !== params.id) {
        return NextResponse.json({ error: 'phaseId does not belong to this project' }, { status: 400 })
      }
    }

    const slug = `${name.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`

    const unit = await db.unit.create({
      data: {
        projectId: params.id,
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

    await logAudit({
      userId: gate.ctx.userId,
      action: 'CREATE',
      entity: 'Unit',
      entityId: unit.id,
      changes: { name, unitType, listingType, area, price, projectId: params.id, isSample: isSample === true },
    })

    return NextResponse.json({ unit }, { status: 201 })
  } catch (error) {
    console.error('Developer create unit error:', error)
    return NextResponse.json({ error: 'Failed to create unit' }, { status: 500 })
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const gate = await requireOwnProject(params.id)
    if (!gate.ok) return gate.response
    // Permission mode: REQUEST-mode developers edit via edit-requests only.
    const blockedPatch = await blockWhenRequestOnly(gate.developerId)
    if (blockedPatch) return blockedPatch

    const body = await req.json()
    const { id, projectId: _ignored, ...fields } = body
    void _ignored
    if (!id) return NextResponse.json({ error: 'Unit ID required' }, { status: 400 })

    const existing = await db.unit.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: 'Unit not found' }, { status: 404 })
    // The unit must live on THIS owned project — not just any own project.
    if (existing.projectId !== params.id) {
      return NextResponse.json({ error: 'Forbidden: this unit belongs to another project' }, { status: 403 })
    }

    const updateData: Record<string, unknown> = {}
    const allowedFields = ['name', 'nameArabic', 'unitNumber', 'floor', 'unitType', 'listingType', 'status', 'bedrooms', 'bathrooms', 'area', 'netArea', 'roofArea', 'gardenArea', 'price', 'currency', 'downPayment', 'monthlyInstallment', 'installmentYears', 'deliveryTerms', 'finishingType', 'view', 'isCorner', 'hasBalcony', 'hasParking', 'parkingNumber', 'isFeatured', 'isSample', 'phaseId', 'metaTitle', 'metaDescription', 'floorPlan', 'brochureUrl']

    if (fields.isSample !== undefined && typeof fields.isSample !== 'boolean') {
      return NextResponse.json({ error: 'isSample must be a boolean' }, { status: 400 })
    }

    if (fields.phaseId) {
      const phase = await db.projectPhase.findUnique({ where: { id: fields.phaseId }, select: { projectId: true } })
      if (!phase || phase.projectId !== params.id) {
        return NextResponse.json({ error: 'phaseId does not belong to this project' }, { status: 400 })
      }
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

    if (fields.price !== undefined && fields.price !== existing.price) {
      await db.priceHistory.create({
        data: {
          unitId: id,
          price: fields.price,
          change: fields.price - existing.price,
          reason: fields.priceReason || 'Price updated by developer',
        },
      })
    }

    await logAudit({
      userId: gate.ctx.userId,
      action: 'UPDATE',
      entity: 'Unit',
      entityId: id,
      changes: updateData,
    })

    // Low-stock hook (fail-soft inside): a status change here can only reduce
    // buyable inventory, so re-check the parent count and notify the developer
    // at ≤ 3 AVAILABLE (deduped per project — see developer-low-stock.ts).
    await checkProjectLowStock(params.id)

    return NextResponse.json({ unit })
  } catch (error) {
    console.error('Developer update unit error:', error)
    return NextResponse.json({ error: 'Failed to update unit' }, { status: 500 })
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const gate = await requireOwnProject(params.id)
    if (!gate.ok) return gate.response
    // Permission mode: REQUEST-mode developers edit via edit-requests only.
    const blockedDelete = await blockWhenRequestOnly(gate.developerId)
    if (blockedDelete) return blockedDelete

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'Unit ID required' }, { status: 400 })

    const existing = await db.unit.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: 'Unit not found' }, { status: 404 })
    if (existing.projectId !== params.id) {
      return NextResponse.json({ error: 'Forbidden: this unit belongs to another project' }, { status: 403 })
    }

    // Soft-delete, same as the CEO route: status → HIDDEN.
    const unit = await db.unit.update({
      where: { id },
      data: { status: 'HIDDEN' },
    })

    await logAudit({
      userId: gate.ctx.userId,
      action: 'DELETE',
      entity: 'Unit',
      entityId: id,
      changes: { previousStatus: existing.status, newStatus: 'HIDDEN' },
    })

    // Low-stock hook (fail-soft inside): the soft-delete removes one buyable
    // unit — same rule + dedupe as the PATCH path above.
    await checkProjectLowStock(params.id)

    return NextResponse.json({ success: true, unit })
  } catch (error) {
    console.error('Developer delete unit error:', error)
    return NextResponse.json({ error: 'Failed to delete unit' }, { status: 500 })
  }
}
