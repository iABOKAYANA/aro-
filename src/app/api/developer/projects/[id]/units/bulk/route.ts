import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/permissions'
import { requireOwnProject } from '@/lib/developer-projects'

export const dynamic = 'force-dynamic'

const MAX_BATCH = 200

/**
 * POST /api/developer/projects/[id]/units/bulk
 * Body: { units: [{ name*, unitType*, listingType*, area*, price*,
 *   nameArabic?, unitNumber?, floor?, bedrooms?, bathrooms?, netArea?,
 *   currency?, finishingType?, phaseId?, floorPlan?, isSample? }] }
 * (required + optionals mirror the single-unit POST in `units/route.ts`).
 *
 * Cap 200 rows per call. Each row is validated independently; bad rows are
 * skipped and reported — valid rows still persist.
 * → 201 { created: n, failed: [{ index, error }] }
 */
export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const gate = await requireOwnProject(params.id)
    if (!gate.ok) return gate.response

    const body = await req.json()
    const rows = body?.units
    if (!Array.isArray(rows)) {
      return NextResponse.json({ error: 'units must be an array' }, { status: 400 })
    }
    if (rows.length > MAX_BATCH) {
      return NextResponse.json(
        { error: `Too many units: maximum ${MAX_BATCH} per request` },
        { status: 400 }
      )
    }

    // Phase ids referenced by this batch, validated once against this project.
    const phaseIds = new Set<string>()
    for (const r of rows) {
      if (r && typeof r.phaseId === 'string' && r.phaseId) phaseIds.add(r.phaseId)
    }
    const validPhaseIds = new Set<string>()
    if (phaseIds.size > 0) {
      const phases = await db.projectPhase.findMany({
        where: { id: { in: [...phaseIds] } },
        select: { id: true, projectId: true },
      })
      for (const p of phases) {
        if (p.projectId === params.id) validPhaseIds.add(p.id)
      }
    }

    const { randomBytes } = await import('node:crypto')
    const rand = () => randomBytes(4).toString('hex')
    const stamp = Date.now().toString(36)

    let created = 0
    const failed: Array<{ index: number; error: string }> = []
    const priceRows: Array<{ unitId: string; price: number; reason: string }> = []

    for (const [index, r] of rows.entries()) {
      if (!r || typeof r !== 'object') {
        failed.push({ index, error: 'Row must be an object' })
        continue
      }
      const {
        name, unitType, listingType, area, price,
        nameArabic, unitNumber, floor, bedrooms, bathrooms, netArea,
        currency, finishingType, phaseId, floorPlan, isSample,
        projectId: _ignoredProjectId, developerId: _ignoredDeveloperId,
      } = r as Record<string, unknown>
      void _ignoredProjectId
      void _ignoredDeveloperId

      if (!name || !unitType || !listingType || area === undefined || price === undefined) {
        failed.push({
          index,
          error: 'Missing required fields: name, unitType, listingType, area, price',
        })
        continue
      }
      if (typeof area !== 'number' || !Number.isFinite(area) || area <= 0) {
        failed.push({ index, error: 'area must be a positive number' })
        continue
      }
      if (typeof price !== 'number' || !Number.isFinite(price) || price < 0) {
        failed.push({ index, error: 'price must be a non-negative number' })
        continue
      }
      if (isSample !== undefined && typeof isSample !== 'boolean') {
        failed.push({ index, error: 'isSample must be a boolean' })
        continue
      }
      if (phaseId && !validPhaseIds.has(phaseId as string)) {
        failed.push({ index, error: 'phaseId does not belong to this project' })
        continue
      }

      try {
        const slug = `${String(name).toLowerCase().replace(/\s+/g, '-')}-${stamp}-${index}-${rand()}`
        const unit = await db.unit.create({
          data: {
            projectId: params.id,
            phaseId: (phaseId as string) || null,
            name: name as string,
            nameArabic: (nameArabic as string) || null,
            unitNumber: (unitNumber as string) || null,
            floor: (floor as number) ?? null,
            unitType: unitType as string,
            listingType: listingType as string,
            bedrooms: (bedrooms as number) ?? null,
            bathrooms: (bathrooms as number) ?? null,
            area: area as number,
            netArea: (netArea as number) ?? null,
            price: price as number,
            pricePerSqm: area > 0 ? (price as number) / (area as number) : null,
            currency: (currency as string) || 'EGP',
            finishingType: (finishingType as string) || null,
            floorPlan: (floorPlan as string) || null,
            slug,
            isSample: isSample === true,
          },
        })
        priceRows.push({ unitId: unit.id, price: price as number, reason: 'Initial price' })
        created++
      } catch (e) {
        console.error('[developer] bulk unit create failed:', e)
        failed.push({ index, error: 'Failed to create unit' })
      }
    }

    if (priceRows.length > 0) {
      await db.priceHistory.createMany({ data: priceRows })
    }

    // Bulk adds inventory, so the low-stock hook (reductions only) stays silent.
    await logAudit({
      userId: gate.ctx.userId,
      action: 'UNITS_BULK_CREATED',
      entity: 'Project',
      entityId: params.id,
      changes: { created, failed: failed.length, projectId: params.id },
    })

    return NextResponse.json({ created, failed }, { status: 201 })
  } catch (error) {
    console.error('Developer bulk create units error:', error)
    return NextResponse.json({ error: 'Failed to create units' }, { status: 500 })
  }
}
