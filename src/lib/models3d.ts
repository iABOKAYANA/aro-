import { db } from '@/lib/db'
import {
  PUBLIC_PROJECT_WHERE,
  PUBLIC_APPROVAL_STATUSES,
} from '@/lib/project-visibility'

/**
 * 3D property models — the PRIVATE-by-default gated engine.
 *
 * Nothing here is public unless EVERY one of these holds:
 *   1. The CEO master switch is ON (SystemSetting `model3d_publish`,
 *      default OFF — a missing row is OFF forever, restarts never flip it).
 *   2. The model row itself is PUBLISHED (not DRAFT).
 *   3. The linked Project is publicly visible (PUBLIC_PROJECT_WHERE) or the
 *      linked Unit belongs to a publicly visible root project.
 *
 * CEO surfaces (/ceo/3d, /api/ceo/models3d*) intentionally bypass the gate so
 * the owner can upload, configure and preview while everything stays hidden
 * from the public site.
 */

export const MODEL3D_SWITCH_KEY = 'model3d_publish'

export type Model3DSourceType = 'PROJECT' | 'UNIT'
export type Model3DKind = 'EXTERIOR' | 'INTERIOR' | 'BUILDING'
export type Model3DStatus = 'DRAFT' | 'PUBLISHED'

export const MODEL3D_SOURCE_TYPES: Model3DSourceType[] = ['PROJECT', 'UNIT']
export const MODEL3D_KINDS: Model3DKind[] = ['EXTERIOR', 'INTERIOR', 'BUILDING']
export const MODEL3D_STATUSES: Model3DStatus[] = ['DRAFT', 'PUBLISHED']

/* ─── Master switch (never default-on) ─── */

export interface Model3DGating {
  publishEnabled: boolean
}

let switchCache: { at: number; enabled: boolean } | null = null
const SWITCH_CACHE_MS = 15_000 // short cache — OFF state must win on restarts/toggles fast

export function invalidateModel3DGatingCache(): void {
  switchCache = null
}

/**
 * Read the CEO publishing switch. Any DB hiccup, missing row, or poisoned
 * value resolves to OFF — the safest possible failure mode.
 */
export async function getModel3DGating(): Promise<Model3DGating> {
  if (switchCache && Date.now() - switchCache.at < SWITCH_CACHE_MS) {
    return { publishEnabled: switchCache.enabled }
  }
  let enabled = false
  try {
    const row = await db.systemSetting.findUnique({ where: { key: MODEL3D_SWITCH_KEY } })
    if (row && row.value === 'true') enabled = true
  } catch {
    enabled = false
  }
  switchCache = { at: Date.now(), enabled }
  return { publishEnabled: enabled }
}

/**
 * Flip the master switch. Value stored as the plain string 'true'|'false'
 * (NOT JSON) so a poisoned/corrupt row can never parse as enabled.
 */
export async function setModel3DPublishEnabled(enabled: boolean): Promise<void> {
  await db.systemSetting.upsert({
    where: { key: MODEL3D_SWITCH_KEY },
    update: { value: enabled ? 'true' : 'false', category: 'MODEL3D' },
    create: {
      key: MODEL3D_SWITCH_KEY,
      value: enabled ? 'true' : 'false',
      category: 'MODEL3D',
    },
  })
  invalidateModel3DGatingCache()
}

/* ─── Row types + JSON payload validation ─── */

export interface Hotspot3D {
  id: string
  position: [number, number, number]
  labelAr: string
  labelEn: string
  noteAr?: string
  noteEn?: string
  /** Room area in m² (display-only). */
  area?: number
  dimsAr?: string
  dimsEn?: string
}

export interface FloorUnit3D {
  id: string
  label: string
  status: 'AVAILABLE' | 'RESERVED' | 'SOLD'
  /** Price (exact, EGP) — copy it from the catalog, never invent it here. */
  price?: number
  area?: number
  rooms?: number
  /** Optional real Unit id — links the panel CTA to /units/<slug>. */
  unitId?: string
}

export interface Floor3D {
  id: string
  nameAr: string
  nameEn: string
  /** World Y this floor band sits at (model units). */
  y?: number
  units: FloorUnit3D[]
}

export interface PropertyModel3DRow {
  id: string
  sourceType: string
  sourceId: string
  kind: string
  labelAr: string | null
  labelEn: string | null
  storageKey: string | null
  originalName: string | null
  sizeBytes: number | null
  hotspotData: string | null
  floorData: string | null
  fallbackImageUrl: string | null
  status: string
  uploadedByEmail: string | null
  createdAt: Date
  updatedAt: Date
}

function finiteNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

function shortText(v: unknown, max: number): string {
  return typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : ''
}

export function parseHotspots(raw: unknown): Hotspot3D[] {
  let list: unknown
  try {
    list = typeof raw === 'string' && raw ? JSON.parse(raw) : raw
  } catch {
    return []
  }
  if (!Array.isArray(list)) return []
  const out: Hotspot3D[] = []
  for (const item of list.slice(0, 40)) {
    if (!item || typeof item !== 'object') continue
    const h = item as Record<string, unknown>
    const pos = Array.isArray(h.position) ? h.position : []
    const x = pos[0]
    const y = pos[1]
    const z = pos[2]
    if (!finiteNum(x) || !finiteNum(y) || !finiteNum(z)) continue
    const labelAr = shortText(h.labelAr, 60)
    const labelEn = shortText(h.labelEn, 60)
    if (!labelAr && !labelEn) continue
    out.push({
      id: shortText(h.id, 40) || `hs-${out.length + 1}`,
      position: [x as number, y as number, z as number],
      labelAr: labelAr || labelEn,
      labelEn: labelEn || labelAr,
      noteAr: shortText(h.noteAr, 300) || undefined,
      noteEn: shortText(h.noteEn, 300) || undefined,
      area: finiteNum(h.area) ? (h.area as number) : undefined,
      dimsAr: shortText(h.dimsAr, 60) || undefined,
      dimsEn: shortText(h.dimsEn, 60) || undefined,
    })
  }
  return out
}

const FLOOR_UNIT_STATUSES = new Set(['AVAILABLE', 'RESERVED', 'SOLD'])

export function parseFloors(raw: unknown): Floor3D[] {
  let list: unknown
  try {
    list = typeof raw === 'string' && raw ? JSON.parse(raw) : raw
  } catch {
    return []
  }
  if (!Array.isArray(list)) return []
  const out: Floor3D[] = []
  for (const item of list.slice(0, 60)) {
    if (!item || typeof item !== 'object') continue
    const f = item as Record<string, unknown>
    const nameAr = shortText(f.nameAr, 60)
    const nameEn = shortText(f.nameEn, 60)
    if (!nameAr && !nameEn) continue
    const unitsRaw = Array.isArray(f.units) ? f.units : []
    const units: FloorUnit3D[] = []
    for (const u of unitsRaw.slice(0, 30)) {
      if (!u || typeof u !== 'object') continue
      const uu = u as Record<string, unknown>
      const label = shortText(uu.label, 60)
      const status = shortText(uu.status, 20).toUpperCase()
      if (!label || !FLOOR_UNIT_STATUSES.has(status)) continue
      units.push({
        id: shortText(uu.id, 40) || `u-${units.length + 1}`,
        label,
        status: status as FloorUnit3D['status'],
        price: finiteNum(uu.price) ? (uu.price as number) : undefined,
        area: finiteNum(uu.area) ? (uu.area as number) : undefined,
        rooms: finiteNum(uu.rooms) ? (uu.rooms as number) : undefined,
        unitId: typeof uu.unitId === 'string' && uu.unitId.length > 0 ? uu.unitId.slice(0, 60) : undefined,
      })
    }
    out.push({
      id: shortText(f.id, 40) || `fl-${out.length + 1}`,
      nameAr: nameAr || nameEn,
      nameEn: nameEn || nameAr,
      y: finiteNum(f.y) ? (f.y as number) : undefined,
      units,
    })
  }
  return out
}

/* ─── Public resolution — the gate in one place ─── */

function safeFallback(url: string | null): string | null {
  if (!url) return null
  return /^https:\/\//.test(url) || url.startsWith('/') ? url : null
}

export interface PublicModel3D {
  id: string
  sourceType: Model3DSourceType
  sourceId: string
  kind: Model3DKind
  labelAr: string | null
  labelEn: string | null
  hasRealModel: boolean
  originalName: string | null
  sizeBytes: number | null
  hotspots: Hotspot3D[]
  floors: Floor3D[]
  fallbackImageUrl: string | null
  updatedAt: string
}

/** Wrap a raw row into the safe public payload (no storage key ever leaves). */
function toPublic(row: PropertyModel3DRow): PublicModel3D {
  return {
    id: row.id,
    sourceType: (row.sourceType as Model3DSourceType) || 'PROJECT',
    sourceId: row.sourceId,
    kind: (row.kind as Model3DKind) || 'EXTERIOR',
    labelAr: row.labelAr,
    labelEn: row.labelEn,
    hasRealModel: !!row.storageKey,
    originalName: row.originalName,
    sizeBytes: row.sizeBytes,
    hotspots: parseHotspots(row.hotspotData),
    floors: parseFloors(row.floorData),
    fallbackImageUrl: safeFallback(row.fallbackImageUrl),
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt),
  }
}

/** A unit is publicly exposed only when its ROOT project passes the public filter. */
async function unitIsPublic(unitId: string): Promise<boolean> {
  const unit = await db.unit.findUnique({
    where: { id: unitId },
    select: { projectId: true, isSample: true },
  })
  if (!unit) return false
  const project = await db.project.findFirst({
    where: { id: unit.projectId, isActive: true, approvalStatus: { in: PUBLIC_APPROVAL_STATUSES }, parentProjectId: null },
    select: { id: true },
  })
  return !!project
}

/**
 * Resolve a model id for public viewing. Returns null when ANY gate fails:
 * master switch OFF, draft row, or source not publicly visible.
 */
export async function getPublicModel3D(id: string): Promise<PublicModel3D | null> {
  const { publishEnabled } = await getModel3DGating()
  if (!publishEnabled) return null
  const row = (await db.propertyModel3D.findUnique({
    where: { id },
    select: {
      id: true, sourceType: true, sourceId: true, kind: true,
      labelAr: true, labelEn: true, storageKey: true, originalName: true,
      sizeBytes: true, hotspotData: true, floorData: true,
      fallbackImageUrl: true, status: true, uploadedByEmail: true,
      createdAt: true, updatedAt: true,
    },
  })) as PropertyModel3DRow | null
  if (!row || row.status !== 'PUBLISHED') return null
  if (row.sourceType === 'PROJECT') {
    const project = (await db.project.findUnique({ where: { id: row.sourceId } })) as Record<string, unknown> | null
    // Mirror isPublicProject checks without importing the in-memory helper's
    // wider row type: id+is parent+approval+price signal all matter.
    const publicMatch = await db.project.findFirst({
      where: { ...PUBLIC_PROJECT_WHERE, id: row.sourceId },
      select: { id: true },
    })
    if (!project || !publicMatch) return null
  } else if (row.sourceType === 'UNIT') {
    if (!(await unitIsPublic(row.sourceId))) return null
  } else {
    return null
  }
  return toPublic(row)
}

/** All published models for one public source (used by the detail-page entry). */
export async function listPublicModels3DForSource(
  sourceType: Model3DSourceType,
  sourceId: string
): Promise<PublicModel3D[]> {
  const { publishEnabled } = await getModel3DGating()
  if (!publishEnabled) return []
  if (sourceType === 'PROJECT') {
    const publicMatch = await db.project.findFirst({
      where: { ...PUBLIC_PROJECT_WHERE, id: sourceId },
      select: { id: true },
    })
    if (!publicMatch) return []
  } else if (sourceType === 'UNIT') {
    if (!(await unitIsPublic(sourceId))) return []
  } else {
    return []
  }
  const rows = (await db.propertyModel3D.findMany({
    where: { sourceType, sourceId, status: 'PUBLISHED' },
    orderBy: { updatedAt: 'desc' },
  })) as PropertyModel3DRow[]
  return rows.map(toPublic)
}

/* ─── Admin listing/validation (no gating — CEO sits behind requireCEOApi) ─── */

export interface AdminModel3DListItem {
  id: string
  sourceType: string
  sourceId: string
  sourceLabel: string
  sourceSub: string
  sourcePublic: boolean
  kind: string
  labelAr: string | null
  labelEn: string | null
  hasFile: boolean
  originalName: string | null
  sizeBytes: number | null
  status: string
  hotspotCount: number
  floorCount: number
  fallbackImageUrl: string | null
  updatedAt: string
}

export async function listAdminModels3D(sourceType?: Model3DSourceType): Promise<AdminModel3DListItem[]> {
  const rows = (await db.propertyModel3D.findMany({
    where: sourceType ? { sourceType } : undefined,
    orderBy: { updatedAt: 'desc' },
    take: 200,
  })) as PropertyModel3DRow[]

  const projectIds = [...new Set(rows.filter((r) => r.sourceType === 'PROJECT').map((r) => r.sourceId))]
  const unitIds = [...new Set(rows.filter((r) => r.sourceType === 'UNIT').map((r) => r.sourceId))]
  const [projects, units] = await Promise.all([
    projectIds.length
      ? db.project.findMany({
          where: { id: { in: projectIds } },
          select: {
            id: true, name: true, nameArabic: true, slug: true,
            isActive: true, approvalStatus: true, parentProjectId: true, startPrice: true,
            units: { select: { price: true }, take: 1 },
            childProjects: {
              select: { isActive: true, approvalStatus: true, startPrice: true, units: { select: { price: true }, take: 1 } },
              take: 8,
            },
          },
        })
      : Promise.resolve([]),
    unitIds.length
      ? db.unit.findMany({
          where: { id: { in: unitIds } },
          select: {
            id: true, name: true, nameArabic: true, unitNumber: true, unitType: true, price: true, projectId: true,
            project: {
              select: {
                name: true, nameArabic: true, slug: true,
                isActive: true, approvalStatus: true, parentProjectId: true, startPrice: true,
                units: { select: { price: true }, take: 1 },
                childProjects: {
                  select: { isActive: true, approvalStatus: true, startPrice: true, units: { select: { price: true }, take: 1 } },
                  take: 8,
                },
              },
            },
          },
        })
      : Promise.resolve([]),
  ])

  const projectById = new Map(projects.map((p) => [p.id, p]))
  const unitById = new Map(units.map((u) => [u.id, u]))

  // Same "has price somewhere" test the public visibility filter uses.
  function projectHasPrice(p: {
    startPrice: { toNumber?(): number } | number | null
    units: { price: { toNumber?(): number } | number }[]
    childProjects: { startPrice: unknown; units: { price: unknown }[] }[]
  }): boolean {
    const val = (v: unknown): number => {
      if (typeof v === 'number') return v
      if (v && typeof v === 'object' && typeof (v as { toNumber?(): number }).toNumber === 'function') {
        try {
          return (v as { toNumber(): number }).toNumber()
        } catch {
          return 0
        }
      }
      return 0
    }
    const own = val(p.startPrice as unknown) > 0
    const unitPrice = (p.units || []).some((u) => val(u.price) > 0)
    const child = (p.childProjects || []).some(
      (c) =>
        (c as { isActive?: boolean }).isActive === true &&
        PUBLIC_APPROVAL_STATUSES.includes(String((c as { approvalStatus?: string }).approvalStatus)) &&
        (val((c as { startPrice?: unknown }).startPrice) > 0 ||
          ((c as { units?: { price: unknown }[] }).units || []).some((u) => val(u.price) > 0))
    )
    return own || unitPrice || child
  }

  return rows.map((row) => {
    let sourceLabel = ''
    let sourceSub = ''
    let sourcePublic = false
    if (row.sourceType === 'PROJECT') {
      const p = projectById.get(row.sourceId)
      sourceLabel = (p?.nameArabic || p?.name || '؟') as string
      sourceSub = p?.slug ? `/projects/${p.slug}` : 'مشروع محذوف؟'
      sourcePublic =
        !!p &&
        p.isActive === true &&
        PUBLIC_APPROVAL_STATUSES.includes(String(p.approvalStatus)) &&
        !p.parentProjectId &&
        projectHasPrice(p as never)
    } else if (row.sourceType === 'UNIT') {
      const u = unitById.get(row.sourceId)
      const root = u?.project
      sourceLabel = u?.name || u?.unitNumber || '؟'
      sourceSub = root?.nameArabic || root?.name || ''
      sourcePublic =
        !!u &&
        !!root &&
        root.isActive === true &&
        PUBLIC_APPROVAL_STATUSES.includes(String(root.approvalStatus)) &&
        !root.parentProjectId &&
        projectHasPrice(root as never)
    }
    return {
      id: row.id,
      sourceType: row.sourceType,
      sourceId: row.sourceId,
      sourceLabel,
      sourceSub,
      sourcePublic,
      kind: row.kind,
      labelAr: row.labelAr,
      labelEn: row.labelEn,
      hasFile: !!row.storageKey,
      originalName: row.originalName,
      sizeBytes: row.sizeBytes,
      status: row.status,
      hotspotCount: parseHotspots(row.hotspotData).length,
      floorCount: parseFloors(row.floorData).length,
      fallbackImageUrl: safeFallback(row.fallbackImageUrl),
      updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt),
    }
  })
}

export function validateModel3DInput(body: Record<string, unknown>): {
  sourceType?: Model3DSourceType
  sourceId?: string
  kind?: Model3DKind
  labelAr?: string | null
  labelEn?: string | null
  fallbackImageUrl?: string | null
  error?: string
} {
  const sourceType = shortText(body.sourceType, 20).toUpperCase()
  if (!MODEL3D_SOURCE_TYPES.includes(sourceType as Model3DSourceType)) {
    return { error: 'sourceType must be PROJECT or UNIT' }
  }
  const sourceId = shortText(body.sourceId, 60)
  if (!sourceId) return { error: 'sourceId is required' }
  const kindRaw = shortText(body.kind, 20).toUpperCase()
  if (kindRaw && !MODEL3D_KINDS.includes(kindRaw as Model3DKind)) {
    return { error: 'kind must be EXTERIOR, INTERIOR or BUILDING' }
  }
  const labelAr = shortText(body.labelAr, 80) || null
  const labelEn = shortText(body.labelEn, 80) || null
  let fallbackImageUrl: string | null = null
  if (typeof body.fallbackImageUrl === 'string' && body.fallbackImageUrl) {
    const v = body.fallbackImageUrl.trim()
    if (v.startsWith('/') || /^https:\/\//.test(v)) fallbackImageUrl = v.slice(0, 400)
  }
  return {
    sourceType: sourceType as Model3DSourceType,
    sourceId,
    kind: (kindRaw || 'EXTERIOR') as Model3DKind,
    labelAr,
    labelEn,
    fallbackImageUrl,
  }
}

/** Verify the link target exists (and is a real Project/Unit row). */
export async function sourceExists(sourceType: string, sourceId: string): Promise<boolean> {
  if (sourceType === 'PROJECT') {
    return !!(await db.project.findUnique({ where: { id: sourceId }, select: { id: true } }))
  }
  if (sourceType === 'UNIT') {
    return !!(await db.unit.findUnique({ where: { id: sourceId }, select: { id: true } }))
  }
  return false
}
