import { db } from '@/lib/db'
import { notifyRole } from '@/lib/notify'
import { logAudit } from '@/lib/permissions'
import { readBoolSetting, readNumberSetting } from '@/lib/system-settings'

// ─── PRICE ANOMALY DETECTOR (Feature 3) ─────────────────────
// Compares a unit against comparable units inside the same project.
// NEVER changes a price automatically. NEVER assumes an anomaly is an
// error — it flags it, shows comparable data, and lets CEO/ADMIN decide
// between "Confirmed error" and "Justified difference" (offer, corner
// unit, promotion, resale, other payment plan…).

export const ANOMALY_TYPE = 'PRICE_ANOMALY'

export interface AnomalyResult {
  unitId: string
  unitName: string
  unitType: string
  listingType: string
  price: number
  area: number
  ppsm: number
  bedrooms: number | null
  floor: number | null
  isCorner: boolean
  finishingType: string | null
  comparableCount: number
  comparableMin: number
  comparableMax: number
  comparableMedian: number
  medianPpsm: number
  ppsmDeviationPct: number      // signed % vs median price/m²
  verdict: 'ANOMALY' | 'OK' | 'INSUFFICIENT_DATA'
  possibleReasons: string[]
}

function median(nums: number[]): number {
  if (!nums.length) return 0
  const s = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

export async function getAnomalyThreshold(): Promise<number> {
  const pct = await readNumberSetting('anomalyThresholdPct', 15)
  return Math.min(90, Math.max(1, pct)) / 100
}

export async function anomalyDetectionEnabled(): Promise<boolean> {
  return readBoolSetting('anomalyDetectionEnabled', true)
}

function possibleReasons(u: {
  isCorner: boolean; floor: number | null; finishingType: string | null; listingType: string
  downPayment: number | null; monthlyInstallment: number | null
}, majorityFinish: string | null, isLow: boolean, floorMax: number | null): string[] {
  const reasons: string[] = []
  if (u.isCorner) reasons.push('Corner unit')
  if (u.floor !== null && u.floor === 0 && isLow) reasons.push('Ground floor')
  if (u.floor !== null && floorMax !== null && u.floor === floorMax) reasons.push('Top floor')
  if (u.finishingType && majorityFinish && u.finishingType !== majorityFinish) {
    reasons.push(`Different finishing (${u.finishingType.replace(/_/g, ' ').toLowerCase()} vs ${majorityFinish.replace(/_/g, ' ').toLowerCase()} majority)`)
  }
  if (u.listingType === 'RESALE') reasons.push('Resale listing')
  if (u.downPayment !== null && u.downPayment > 0) reasons.push('Custom down payment set')
  reasons.push('Special offer / developer promotion / different payment plan cannot be excluded')
  return reasons
}

/** Compare every unit of a project against its comparables. */
export async function detectProjectAnomalies(projectId: string, threshold?: number): Promise<AnomalyResult[]> {
  const t = threshold ?? (await getAnomalyThreshold())
  const units = await db.unit.findMany({
    where: { projectId, price: { gt: 0 }, area: { gt: 0 }, isSample: false },
    select: {
      id: true, name: true, unitType: true, listingType: true, price: true, area: true,
      bedrooms: true, floor: true, isCorner: true, finishingType: true, downPayment: true, monthlyInstallment: true,
    },
  })
  if (units.length < 4) return []

  const results: AnomalyResult[] = []
  for (const u of units) {
    const comparables = units.filter((c) =>
      c.id !== u.id &&
      c.unitType === u.unitType &&
      c.listingType === u.listingType &&
      c.area >= u.area * 0.7 && c.area <= u.area * 1.3,
    )
    const ppsm = u.price / u.area
    if (comparables.length < 3) {
      results.push({
        unitId: u.id, unitName: u.name, unitType: u.unitType, listingType: u.listingType,
        price: u.price, area: u.area, ppsm, bedrooms: u.bedrooms, floor: u.floor,
        isCorner: u.isCorner, finishingType: u.finishingType,
        comparableCount: comparables.length,
        comparableMin: 0, comparableMax: 0, comparableMedian: 0, medianPpsm: 0,
        ppsmDeviationPct: 0, verdict: 'INSUFFICIENT_DATA', possibleReasons: [],
      })
      continue
    }
    const compPrices = comparables.map((c) => c.price)
    const compPpsm = comparables.map((c) => c.price / c.area)
    const medPpsm = median(compPpsm)
    const deviation = medPpsm > 0 ? (ppsm - medPpsm) / medPpsm : 0

    const finishCounts: Record<string, number> = {}
    for (const c of comparables) if (c.finishingType) finishCounts[c.finishingType] = (finishCounts[c.finishingType] || 0) + 1
    const majorityFinish = Object.entries(finishCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
    const floorMax = Math.max(...comparables.map((c) => c.floor ?? -1), u.floor ?? -1)

    results.push({
      unitId: u.id, unitName: u.name, unitType: u.unitType, listingType: u.listingType,
      price: u.price, area: u.area, ppsm, bedrooms: u.bedrooms, floor: u.floor,
      isCorner: u.isCorner, finishingType: u.finishingType,
      comparableCount: comparables.length,
      comparableMin: Math.min(...compPrices),
      comparableMax: Math.max(...compPrices),
      comparableMedian: median(compPrices),
      medianPpsm: medPpsm,
      ppsmDeviationPct: Math.round(deviation * 1000) / 10,
      verdict: Math.abs(deviation) >= t ? 'ANOMALY' : 'OK',
      possibleReasons: possibleReasons(u, majorityFinish, deviation < 0, floorMax === -1 ? null : floorMax),
    })
  }
  return results.filter((r) => r.verdict !== 'INSUFFICIENT_DATA')
}

function anomalyDescription(r: AnomalyResult): string {
  return (
    `Unit price: ${Math.round(r.price).toLocaleString('en-US')} EGP (${Math.round(r.ppsm).toLocaleString('en-US')} EGP/m²). ` +
    `Comparable units (${r.comparableCount} similar): ${Math.round(r.comparableMin).toLocaleString('en-US')}–${Math.round(r.comparableMax).toLocaleString('en-US')} EGP ` +
    `(median ${Math.round(r.comparableMedian).toLocaleString('en-US')} EGP, median ${Math.round(r.medianPpsm).toLocaleString('en-US')} EGP/m²). ` +
    `Deviation: ${r.ppsmDeviationPct > 0 ? '+' : ''}${r.ppsmDeviationPct}% on price per m². ` +
    `Possible reasons: ${r.possibleReasons.join('; ')}.`
  )
}

/** Flag anomalies as ApprovalRequests (dedup per unit) and notify CEO/ADMIN once. */
export async function flagAnomalies(
  results: AnomalyResult[],
  actorId?: string,
): Promise<{ flagged: number; refreshed: number; skipped: number }> {
  let flagged = 0, refreshed = 0, skipped = 0
  for (const r of results.filter((x) => x.verdict === 'ANOMALY')) {
    try {
      const existing = await db.approvalRequest.findFirst({
        where: { type: ANOMALY_TYPE, entityType: 'UNIT', entityId: r.unitId, status: 'PENDING' },
      })
      const metadata = JSON.stringify({
        verdict: 'ANOMALY',
        reviewOutcome: existing ? safeParse(existing.metadata)?.reviewOutcome ?? null : null,
        price: r.price, ppsm: r.ppsm, area: r.area, unitType: r.unitType, bedrooms: r.bedrooms, floor: r.floor,
        comparableCount: r.comparableCount, comparableMin: r.comparableMin, comparableMax: r.comparableMax,
        comparableMedian: r.comparableMedian, medianPpsm: r.medianPpsm,
        ppsmDeviationPct: r.ppsmDeviationPct, possibleReasons: r.possibleReasons,
        detectedAt: new Date().toISOString(),
      })
      if (existing) {
        await db.approvalRequest.update({ where: { id: existing.id }, data: { metadata, description: anomalyDescription(r) } })
        refreshed++
        continue
      }
      await db.approvalRequest.create({
        data: {
          type: ANOMALY_TYPE,
          entityType: 'UNIT',
          entityId: r.unitId,
          title: `⚠ Price anomaly: ${r.unitName}`,
          description: anomalyDescription(r),
          status: 'PENDING',
          requestedBy: actorId || null,
          metadata,
        },
      })
      flagged++
      await notifyRole(['CEO', 'ADMIN'], {
        type: 'PRICE_ANOMALY',
        title: '⚠ Price anomaly detected',
        message: `${r.unitName} is ${r.ppsmDeviationPct > 0 ? '+' : ''}${r.ppsmDeviationPct}% vs comparable units in its project. Manual review required — no price was changed.`,
        link: '/ceo/pricing',
        metadata: { unitId: r.unitId },
      })
    } catch (e) {
      console.error('[anomaly] flag failed:', r.unitId, e)
      skipped++
    }
  }
  return { flagged, refreshed, skipped }
}

function safeParse(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null
  try { return JSON.parse(raw) } catch { return null }
}

/** Full scan across projects (skip detection toggle off). */
export async function scanAndFlag(actorId?: string): Promise<{ scanned: number; anomalies: number; flagged: number; refreshed: number; skipped: number; enabled: boolean }> {
  const enabled = await anomalyDetectionEnabled()
  if (!enabled) return { scanned: 0, anomalies: 0, flagged: 0, refreshed: 0, skipped: 0, enabled }
  const projects = await db.project.findMany({ where: {}, select: { id: true }, take: 400 })
  let scanned = 0, anomalies = 0
  let flagged = 0, refreshed = 0, skipped = 0
  for (const p of projects) {
    const results = await detectProjectAnomalies(p.id)
    scanned++
    anomalies += results.filter((r) => r.verdict === 'ANOMALY').length
    const res = await flagAnomalies(results, actorId)
    flagged += res.flagged; refreshed += res.refreshed; skipped += res.skipped
  }
  return { scanned, anomalies, flagged, refreshed, skipped, enabled }
}

export interface AnomalyRecord {
  id: string
  unitId: string
  unitName: string
  projectName: string
  projectId: string
  status: string
  reviewOutcome: string | null
  reviewNote: string | null
  description: string | null
  metadata: Record<string, unknown>
  requestedAt: string
  reviewedAt: string | null
  unitStillExists: boolean
}

/** List flagged anomalies with their current unit data. */
export async function listAnomalies(opts?: { status?: string }): Promise<AnomalyRecord[]> {
  const where: Record<string, unknown> = { type: ANOMALY_TYPE }
  if (opts?.status) where.status = opts.status
  const rows = await db.approvalRequest.findMany({ where, orderBy: { requestedAt: 'desc' }, take: 300 })
  const unitIds = rows.map((r) => r.entityId).filter((x): x is string => !!x)
  const units = unitIds.length
    ? await db.unit.findMany({
        // Management lookup by explicit ids — keeps ALL rows (samples are
        // never flagged, so this only ever resolves real inventory).
        where: { id: { in: unitIds } },
        select: { id: true, name: true, price: true, status: true, projectId: true, project: { select: { id: true, name: true } } },
      })
    : []
  return rows.map((r) => {
    const unit = units.find((u) => u.id === r.entityId)
    const meta = safeParse(r.metadata) || {}
    return {
      id: r.id,
      unitId: r.entityId || '',
      unitName: unit ? unit.name : (meta.unitName as string) || 'Deleted unit',
      projectName: unit?.project?.name || '—',
      projectId: unit?.projectId || '',
      status: r.status,
      reviewOutcome: (meta.reviewOutcome as string) || null,
      reviewNote: r.reviewNote,
      description: r.description,
      metadata: meta,
      requestedAt: new Date(r.requestedAt).toISOString(),
      reviewedAt: r.reviewedAt ? new Date(r.reviewedAt).toISOString() : null,
      unitStillExists: !!unit,
    }
  })
}

/** Manual review outcome. Only CEO/ADMIN reach this (enforced by the route). */
export async function resolveAnomaly(
  approvalId: string,
  outcome: 'CONFIRMED_ERROR' | 'JUSTIFIED',
  note: string | null,
  actorId: string,
): Promise<{ ok: boolean; error?: string }> {
  const row = await db.approvalRequest.findUnique({ where: { id: approvalId } })
  if (!row || row.type !== ANOMALY_TYPE) return { ok: false, error: 'Anomaly not found' }
  const meta = safeParse(row.metadata) || {}
  meta.reviewOutcome = outcome
  meta.reviewedAt = new Date().toISOString()
  await db.approvalRequest.update({
    where: { id: approvalId },
    data: {
      // APPROVED = confirmed as a real pricing error; REJECTED = justified difference
      status: outcome === 'CONFIRMED_ERROR' ? 'APPROVED' : 'REJECTED',
      reviewedBy: actorId,
      reviewedAt: new Date(),
      reviewNote: note,
      metadata: JSON.stringify(meta),
    },
  })
  await logAudit({
    userId: actorId,
    action: outcome === 'CONFIRMED_ERROR' ? 'ANOMALY_CONFIRMED_ERROR' : 'ANOMALY_JUSTIFIED',
    entity: 'ApprovalRequest',
    entityId: approvalId,
    changes: { unitId: row.entityId, outcome, note },
  })
  return { ok: true }
}
