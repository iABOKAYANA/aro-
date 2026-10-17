import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireCEOApi, logAudit } from '@/lib/permissions'
import { trustOverview, setFieldTrust, backfillImportedTrust, type TrustStatus } from '@/lib/trust'
import { normalizeField, NORMALIZER_KINDS, type NormalizerKind } from '@/lib/data-normalizer'

export const dynamic = 'force-dynamic'

// ─── DATA QUALITY & TRUST CENTER (Features 4 + 10) ──────────
// CEO/ADMIN: view normalization test bench, data-quality issues,
// field verification statuses, and the import provenance backfill.

interface QualityIssue {
  entityType: 'PROJECT' | 'UNIT'
  entityId: string
  name: string
  field: string
  problem: string
  suggestion: string | null
  rawValue: string
}

/** Server-side consistency scan (deterministic — no invented values). */
async function findQualityIssues(limit = 300): Promise<QualityIssue[]> {
  const issues: QualityIssue[] = []

  const units = await db.unit.findMany({
    // Data-quality scan keeps ALL rows (samples included) — CEO data hygiene.
    where: { status: { not: 'HIDDEN' } },
    orderBy: { updatedAt: 'desc' },
    take: limit,
    select: { id: true, name: true, price: true, area: true, pricePerSqm: true, status: true, deliveryTerms: true, project: { select: { name: true } } },
  })
  for (const u of units) {
    if (u.price <= 0) {
      issues.push({ entityType: 'UNIT', entityId: u.id, name: u.name, field: 'price', problem: 'Price is zero or negative', suggestion: null, rawValue: String(u.price) })
    }
    if (u.area <= 0) {
      issues.push({ entityType: 'UNIT', entityId: u.id, name: u.name, field: 'area', problem: 'Area is zero or negative', suggestion: null, rawValue: String(u.area) })
    }
    if (u.price > 0 && u.area > 0) {
      const computed = u.price / u.area
      if (u.pricePerSqm !== null && Math.abs(computed - u.pricePerSqm) / computed > 0.01) {
        issues.push({
          entityType: 'UNIT', entityId: u.id, name: `${u.name} (${u.project?.name || ''})`, field: 'pricePerSqm',
          problem: `Stored ${Math.round(u.pricePerSqm)} EGP/m² doesn't match price ÷ area (${Math.round(computed)})`,
          suggestion: String(Math.round(computed * 100) / 100), rawValue: String(u.pricePerSqm),
        })
      }
    }
  }

  const projects = await db.project.findMany({
    where: { approvalStatus: { not: 'ARCHIVED' } },
    orderBy: { updatedAt: 'desc' },
    take: limit,
    select: { id: true, name: true, startPrice: true, endPrice: true, deliveryDate: true, status: true },
  })
  for (const p of projects) {
    if (p.startPrice !== null && p.endPrice !== null && p.startPrice > p.endPrice) {
      issues.push({
        entityType: 'PROJECT', entityId: p.id, name: p.name, field: 'endPrice',
        problem: `Starting price (${Math.round(p.startPrice).toLocaleString('en-US')}) is above end price (${Math.round(p.endPrice).toLocaleString('en-US')})`,
        suggestion: null, rawValue: String(p.endPrice),
      })
    }
    if (p.deliveryDate && new Date(p.deliveryDate) < new Date() && ['UNDER_CONSTRUCTION', 'COMING_SOON'].includes(p.status)) {
      issues.push({
        entityType: 'PROJECT', entityId: p.id, name: p.name, field: 'deliveryDate',
        problem: `Delivery date ${new Date(p.deliveryDate).toISOString().slice(0, 10)} is in the past but status is ${p.status.replace(/_/g, ' ')}`,
        suggestion: null, rawValue: new Date(p.deliveryDate).toISOString().slice(0, 10),
      })
    }
  }
  return issues
}

export async function GET() {
  try {
    const { error } = await requireCEOApi()
    if (error) return error

    const [trust, issues] = await Promise.all([trustOverview(), findQualityIssues()])
    return NextResponse.json({
      trust,
      issues,
      normalizerKinds: NORMALIZER_KINDS,
      issueCount: issues.length,
    })
  } catch (e) {
    console.error('Data quality fetch error:', e)
    return NextResponse.json({ error: 'Failed to load data quality' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { error, session } = await requireCEOApi()
    if (error) return error
    const actorId = (session!.user as any).id
    const actorName = (session!.user as any).name as string | undefined

    const body = await req.json()
    const { action } = body

    // 1. Normalization test bench (deterministic; never invents)
    if (action === 'normalize') {
      const kind = String(body.kind || '') as NormalizerKind
      if (!NORMALIZER_KINDS.includes(kind)) {
        return NextResponse.json({ error: `kind must be one of: ${NORMALIZER_KINDS.join(', ')}` }, { status: 400 })
      }
      if (body.raw === undefined || body.raw === null) return NextResponse.json({ error: 'raw is required' }, { status: 400 })
      return NextResponse.json({ result: normalizeField(kind, body.raw) })
    }

    // 2. Write a corrected value (original preserved in the audit log)
    if (action === 'correct') {
      const { entityType, entityId, field, value } = body
      if (!['PROJECT', 'UNIT'].includes(entityType) || !entityId || !field) {
        return NextResponse.json({ error: 'entityType (PROJECT|UNIT), entityId and field are required' }, { status: 400 })
      }
      if (typeof field !== 'string' || !/^[a-zA-Z][a-zA-Z0-9_]{0,48}$/.test(field)) {
        return NextResponse.json({ error: 'Invalid field name' }, { status: 400 })
      }
      const row = entityType === 'PROJECT'
        ? await db.project.findUnique({ where: { id: entityId } })
        : await db.unit.findUnique({ where: { id: entityId } })
      if (!row) return NextResponse.json({ error: 'Entity not found' }, { status: 404 })
      const previous = (row as Record<string, unknown>)[field]
      if (previous === undefined) return NextResponse.json({ error: `Field ${field} does not exist` }, { status: 400 })

      if (entityType === 'PROJECT') {
        await db.project.update({ where: { id: entityId }, data: { [field]: value } as never })
      } else {
        await db.unit.update({ where: { id: entityId }, data: { [field]: value } as never })
      }
      await logAudit({
        userId: actorId,
        action: 'DATA_CORRECTED',
        entity: entityType,
        entityId,
        changes: { field, from: previous, to: value, originalPreserved: true },
      })
      return NextResponse.json({ success: true, previous, value })
    }

    // 3. Field verification status (F10)
    if (action === 'setTrust') {
      const { entityType, entityId, field, status, source, note } = body
      if (!['PROJECT', 'UNIT'].includes(entityType) || !entityId || !field) {
        return NextResponse.json({ error: 'entityType, entityId and field are required' }, { status: 400 })
      }
      const result = await setFieldTrust({
        entityType: entityType as 'PROJECT' | 'UNIT',
        entityId,
        field,
        status: status as TrustStatus,
        source,
        note,
        actorId,
        actorName,
      })
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })
      return NextResponse.json({ success: true, trust: result.trust })
    }

    // 4. Backfill provenance for nawy-imported projects (PENDING_REVIEW only)
    if (action === 'backfill') {
      const result = await backfillImportedTrust(actorId, Math.min(500, Number(body.limit) || 200))
      return NextResponse.json(result)
    }

    return NextResponse.json({ error: `Unknown action: ${action}. Valid: normalize, correct, setTrust, backfill` }, { status: 400 })
  } catch (e) {
    console.error('Data quality action error:', e)
    return NextResponse.json({ error: 'Action failed' }, { status: 500 })
  }
}
