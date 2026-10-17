import { db } from '@/lib/db'
import { logAudit } from '@/lib/permissions'
import { readNumberSetting } from '@/lib/system-settings'
import { parseJsonSafe } from '@/lib/utils'

// ─── ESTATEAI DATA TRUST CENTER (Feature 10) ────────────────
// Field-level source/verification/freshness for important project and
// unit data. Hard rule: never falsely label anything as verified.
// Missing entry → UNVERIFIED. Old entry → derived STALE warning.

export const TRUST_STATUSES = [
  'VERIFIED', 'DEVELOPER_PROVIDED', 'ESTATEAI_REVIEWED',
  'PENDING_REVIEW', 'UNVERIFIED', 'STALE',
] as const
export type TrustStatus = (typeof TRUST_STATUSES)[number]

export const PROJECT_TRUST_FIELDS = ['price', 'paymentPlan', 'delivery', 'location', 'amenities'] as const
export const UNIT_TRUST_FIELDS = ['price', 'area', 'availability'] as const
export type TrustField = string

export interface TrustEntry {
  status: TrustStatus
  source?: string
  note?: string
  verifiedById?: string
  verifiedByName?: string
  updatedAt: string
  ageDays: number
  stale: boolean
}

export interface TrustMap {
  [field: string]: TrustEntry
}

export async function freshnessDays(): Promise<number> {
  const d = await readNumberSetting('dataFreshnessDays', 90)
  return Math.min(3650, Math.max(7, Math.round(d)))
}

function ageDays(iso: string): number {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return 0
  return Math.floor((Date.now() - t) / (24 * 60 * 60 * 1000))
}

/** Parse a dataTrust JSON blob and derive staleness against the freshness window. */
export function readTrust(raw: string | null | undefined, windowDays: number): TrustMap {
  const obj = parseJsonSafe<Record<string, Partial<TrustEntry>>>(raw, {})
  const out: TrustMap = {}
  for (const [field, entry] of Object.entries(obj)) {
    if (!entry || typeof entry !== 'object') continue
    const updatedAt = entry.updatedAt || new Date(0).toISOString()
    const age = ageDays(updatedAt)
    const stale = age > windowDays && entry.status !== 'PENDING_REVIEW'
    out[field] = {
      status: stale ? 'STALE' : (entry.status as TrustStatus) || 'UNVERIFIED',
      source: entry.source,
      note: entry.note,
      verifiedById: entry.verifiedById,
      verifiedByName: entry.verifiedByName,
      updatedAt,
      ageDays: age,
      stale,
    }
  }
  return out
}

/** Read trust for a project or unit (server side). */
export async function getEntityTrust(entityType: 'PROJECT' | 'UNIT', entityId: string): Promise<TrustMap> {
  const window = await freshnessDays()
  if (entityType === 'PROJECT') {
    const p = await db.project.findUnique({ where: { id: entityId }, select: { dataTrust: true } })
    return p ? readTrust(p.dataTrust, window) : {}
  }
  const u = await db.unit.findUnique({ where: { id: entityId }, select: { dataTrust: true } })
  return u ? readTrust(u.dataTrust, window) : {}
}

/** CEO/ADMIN sets the verification status of one field. Audited. */
export async function setFieldTrust(params: {
  entityType: 'PROJECT' | 'UNIT'
  entityId: string
  field: string
  status: TrustStatus
  source?: string
  note?: string
  actorId: string
  actorName?: string
}): Promise<{ ok: boolean; error?: string; trust?: TrustMap }> {
  if (!TRUST_STATUSES.includes(params.status)) return { ok: false, error: 'Invalid status' }
  let currentRaw: string | null = null
  if (params.entityType === 'PROJECT') {
    const p = await db.project.findUnique({ where: { id: params.entityId }, select: { dataTrust: true } })
    currentRaw = p?.dataTrust ?? null
  } else {
    const u = await db.unit.findUnique({ where: { id: params.entityId }, select: { dataTrust: true } })
    currentRaw = u?.dataTrust ?? null
  }
  if (currentRaw === null) return { ok: false, error: `${params.entityType.toLowerCase()} not found` }

  const trust = parseJsonSafe<Record<string, Partial<TrustEntry>>>(currentRaw, {})
  const now = new Date().toISOString()
  trust[params.field] = {
    status: params.status,
    source: params.source || trust[params.field]?.source,
    note: params.note || trust[params.field]?.note,
    verifiedById: params.actorId,
    verifiedByName: params.actorName,
    updatedAt: now,
  }
  const nextJson = JSON.stringify(trust)
  if (params.entityType === 'PROJECT') {
    await db.project.update({ where: { id: params.entityId }, data: { dataTrust: nextJson } })
  } else {
    await db.unit.update({ where: { id: params.entityId }, data: { dataTrust: nextJson } })
  }

  await logAudit({
    userId: params.actorId,
    action: 'TRUST_STATUS_CHANGED',
    entity: params.entityType,
    entityId: params.entityId,
    changes: { field: params.field, status: params.status, source: params.source, note: params.note },
  })

  return { ok: true, trust: readTrust(JSON.stringify(trust), await freshnessDays()) }
}

export interface TrustSummary {
  fields: number
  verified: number
  developerProvided: number
  reviewed: number
  pending: number
  stale: number
  unverified: number
}

export function summarizeTrust(trust: TrustMap): TrustSummary {
  const values = Object.values(trust)
  return {
    fields: values.length,
    verified: values.filter((v) => v.status === 'VERIFIED').length,
    developerProvided: values.filter((v) => v.status === 'DEVELOPER_PROVIDED').length,
    reviewed: values.filter((v) => v.status === 'ESTATEAI_REVIEWED').length,
    pending: values.filter((v) => v.status === 'PENDING_REVIEW').length,
    stale: values.filter((v) => v.status === 'STALE').length,
    unverified: values.filter((v) => v.status === 'UNVERIFIED').length,
  }
}

/** Human label + tone for the UI badges. */
export function trustLabel(status: TrustStatus): { label: string; tone: 'success' | 'info' | 'warning' | 'muted' | 'danger' } {
  switch (status) {
    case 'VERIFIED': return { label: 'Verified', tone: 'success' }
    case 'DEVELOPER_PROVIDED': return { label: 'Developer Provided', tone: 'info' }
    case 'ESTATEAI_REVIEWED': return { label: 'EstateAI Reviewed', tone: 'info' }
    case 'PENDING_REVIEW': return { label: 'Pending Review', tone: 'warning' }
    case 'STALE': return { label: 'May require verification', tone: 'warning' }
    case 'UNVERIFIED': default: return { label: 'Unverified', tone: 'muted' }
  }
}

/** Projects imported from nawy.com carry provenance in keywords — mark them PENDING_REVIEW (never "verified"). */
export async function backfillImportedTrust(actorId: string, limit = 200): Promise<{ scanned: number; set: number }> {
  const window = await freshnessDays()
  const projects = await db.project.findMany({
    where: { keywords: { contains: 'source:https://www.nawy.com/' } },
    select: { id: true, dataTrust: true, createdAt: true, updatedAt: true },
    take: limit,
  })
  let set = 0
  for (const p of projects) {
    const trust = parseJsonSafe<Record<string, Partial<TrustEntry>>>(p.dataTrust, {})
    if (trust.price || trust.paymentPlan || trust.delivery || trust.location) continue // already has entries
    const at = new Date(p.updatedAt || p.createdAt).toISOString()
    for (const field of ['price', 'paymentPlan', 'delivery', 'location']) {
      trust[field] = { status: 'PENDING_REVIEW', source: 'nawy.com catalog import', updatedAt: at }
    }
    await db.project.update({ where: { id: p.id }, data: { dataTrust: JSON.stringify(trust) } })
    set++
  }
  await logAudit({
    userId: actorId,
    action: 'TRUST_BACKFILL',
    entity: 'Project',
    changes: { scanned: projects.length, set, policy: 'nawy imports → PENDING_REVIEW (never VERIFIED)' },
  })
  void window
  return { scanned: projects.length, set }
}

/** Trust overview counts for the CEO dashboard. */
export async function trustOverview(limit = 400) {
  const window = await freshnessDays()
  const projects = await db.project.findMany({
    orderBy: { updatedAt: 'desc' },
    take: limit,
    select: { id: true, name: true, dataTrust: true, approvalStatus: true, updatedAt: true },
  })
  const rows = projects.map((p) => ({
    id: p.id,
    name: p.name,
    approvalStatus: p.approvalStatus,
    updatedAt: new Date(p.updatedAt).toISOString(),
    trust: readTrust(p.dataTrust, window),
    summary: summarizeTrust(readTrust(p.dataTrust, window)),
  }))
  const totals = rows.reduce(
    (acc, r) => {
      acc.fields += r.summary.fields
      acc.verified += r.summary.verified
      acc.pending += r.summary.pending
      acc.stale += r.summary.stale
      acc.unverified += r.summary.unverified
      return acc
    },
    { fields: 0, verified: 0, pending: 0, stale: 0, unverified: 0 },
  )
  return { freshnessWindowDays: window, totals, rows }
}
