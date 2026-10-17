import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { isValidImageUrl } from '@/lib/image-url'

export const EDIT_ENTITIES = ['PROJECT', 'UNIT', 'PLAN'] as const
export type EditEntity = (typeof EDIT_ENTITIES)[number]

// ─── Per-entity field whitelists ───────────────────────────
// Writable scalar fields a developer may change via an EditRequest (or that
// a staging MERGE may apply). Privileged/structural fields are excluded:
//   PROJECT: slug, developerId, approvalStatus, rejectionReason, isFeatured,
//     isVerified, isActive, counters, featuredRank, publishedAt, dataTrust.
//   UNIT: status (visibility), isFeatured, isSample, phaseId, pricePerSqm
//     (derived), slug, dataTrust, counters.
//   PLAN: phaseId, milestones (rebuilt wholesale — too structural for one field).

export const EDIT_FIELD_WHITELISTS: Record<EditEntity, string[]> = {
  PROJECT: [
    'name', 'nameArabic', 'tagline', 'taglineArabic',
    'description', 'descriptionArabic',
    'coverImage', 'gallery', 'videoUrl', 'virtualTourUrl',
    'governorateId', 'cityId', 'districtId', 'address',
    'latitude', 'longitude', 'googleMapsUrl',
    'propertyTypes', 'listingTypes', 'status',
    'totalUnits', 'totalArea', 'startPrice', 'endPrice', 'pricePerSqm',
    'downPaymentMin', 'installmentYears', 'compoundArea',
    'deliveryDate', 'deliveryTerms', 'completionPercent',
    'metaTitle', 'metaDescription', 'keywords',
  ],
  UNIT: [
    'name', 'nameArabic', 'unitNumber', 'floor',
    'unitType', 'listingType',
    'bedrooms', 'bathrooms', 'area', 'netArea', 'roofArea', 'gardenArea',
    'price', 'currency', 'downPayment', 'monthlyInstallment', 'installmentYears',
    'deliveryTerms', 'finishingType', 'view',
    'isCorner', 'hasBalcony', 'hasParking', 'parkingNumber',
    'floorPlan', 'brochureUrl', 'metaTitle', 'metaDescription', 'gallery',
  ],
  PLAN: [
    'name', 'nameArabic', 'description',
    'downPaymentPct', 'installmentYears',
    'maintenanceFeePct', 'semiAnnualPct', 'deliveryPaymentPct', 'cashDiscount',
    'isDefault', 'isActive', 'sortOrder',
  ],
}

const INT_FIELDS: Record<EditEntity, Set<string>> = {
  PROJECT: new Set(['totalUnits', 'installmentYears', 'completionPercent']),
  UNIT: new Set(['floor', 'bedrooms', 'bathrooms', 'installmentYears']),
  PLAN: new Set(['installmentYears', 'sortOrder']),
}

const FLOAT_FIELDS: Record<EditEntity, Set<string>> = {
  PROJECT: new Set(['totalArea', 'startPrice', 'endPrice', 'pricePerSqm', 'downPaymentMin', 'compoundArea', 'latitude', 'longitude']),
  UNIT: new Set(['area', 'netArea', 'roofArea', 'gardenArea', 'price', 'downPayment', 'monthlyInstallment']),
  PLAN: new Set(['downPaymentPct', 'maintenanceFeePct', 'semiAnnualPct', 'deliveryPaymentPct', 'cashDiscount']),
}

const BOOL_FIELDS: Record<EditEntity, Set<string>> = {
  PROJECT: new Set([]),
  UNIT: new Set(['isCorner', 'hasBalcony', 'hasParking']),
  PLAN: new Set(['isDefault', 'isActive']),
}

// Array columns stored as JSON strings.
const JSON_ARRAY_FIELDS: Record<EditEntity, Set<string>> = {
  PROJECT: new Set(['propertyTypes', 'listingTypes', 'gallery', 'keywords']),
  UNIT: new Set(['gallery']),
  PLAN: new Set([]),
}

// Nullable string columns: empty-string newValue means "clear to null".
const NULLABLE_STRING_FIELDS: Record<EditEntity, Set<string>> = {
  PROJECT: new Set([
    'nameArabic', 'tagline', 'taglineArabic', 'description', 'descriptionArabic',
    'coverImage', 'videoUrl', 'virtualTourUrl', 'governorateId', 'cityId',
    'districtId', 'address', 'googleMapsUrl', 'deliveryDate', 'deliveryTerms',
    'metaTitle', 'metaDescription',
  ]),
  UNIT: new Set([
    'nameArabic', 'unitNumber', 'unitType', 'listingType', 'currency',
    'deliveryTerms', 'finishingType', 'view', 'parkingNumber',
    'floorPlan', 'brochureUrl', 'metaTitle', 'metaDescription',
  ]),
  PLAN: new Set(['nameArabic', 'description']),
}

const REQUIRED_STRING_FIELDS: Record<EditEntity, Set<string>> = {
  PROJECT: new Set(['name']),
  UNIT: new Set(['name']),
  PLAN: new Set(['name']),
}

export function isWhitelistedField(entity: string, field: string): entity is EditEntity {
  return (
    (EDIT_ENTITIES as readonly string[]).includes(entity) &&
    EDIT_FIELD_WHITELISTS[entity as EditEntity].includes(field)
  )
}

/**
 * Coerce the string `newValue` of an EditRequest into the real column type.
 * Mirrors the validation in the developer PATCH routes (numeric ranges,
 * image-URL guards, JSON-array shape) so an approval can never write a
 * value the direct route would have rejected.
 */
export function coerceEditValue(
  entity: EditEntity,
  field: string,
  raw: unknown
): { ok: true; value: unknown } | { ok: false; error: string } {
  const s = typeof raw === 'string' ? raw : String(raw ?? '')

  if (BOOL_FIELDS[entity].has(field)) {
    const v = s.trim().toLowerCase()
    if (v === 'true') return { ok: true, value: true }
    if (v === 'false') return { ok: true, value: false }
    return { ok: false, error: `${field} must be true or false` }
  }

  if (INT_FIELDS[entity].has(field) || FLOAT_FIELDS[entity].has(field)) {
    const isInt = INT_FIELDS[entity].has(field)
    if (s.trim() === '') {
      return { ok: false, error: `${field} must be a number` }
    }
    const n = Number(s)
    if (!Number.isFinite(n) || (isInt && !Number.isInteger(n))) {
      return { ok: false, error: `${field} must be ${isInt ? 'a whole number' : 'a number'}` }
    }
    if (n < 0 || n > 1_000_000_000_000) {
      return { ok: false, error: `${field} is out of range` }
    }
    if (field === 'installmentYears' && (n < 0 || n > 30)) {
      return { ok: false, error: 'installmentYears must be 0–30' }
    }
    if ((field === 'downPaymentMin' || field === 'downPaymentPct') && (n < 0 || n > 100)) {
      return { ok: false, error: `${field} must be 0–100` }
    }
    if (field === 'completionPercent' && (n < 0 || n > 100)) {
      return { ok: false, error: 'completionPercent must be 0–100' }
    }
    return { ok: true, value: n }
  }

  if (JSON_ARRAY_FIELDS[entity].has(field)) {
    let parsed: unknown = s
    if (typeof parsed === 'string') {
      try {
        parsed = JSON.parse(parsed)
      } catch {
        return { ok: false, error: `${field} must be a JSON array` }
      }
    }
    if (!Array.isArray(parsed)) {
      return { ok: false, error: `${field} must be a JSON array` }
    }
    if (field === 'gallery') {
      const bad = (parsed as unknown[]).filter(
        (u) => typeof u !== 'string' || !isValidImageUrl((u as string).trim())
      )
      if (bad.length > 0) {
        return { ok: false, error: 'gallery entries must be valid image URLs starting with http(s):// or /' }
      }
      return { ok: true, value: JSON.stringify((parsed as string[]).map((u) => u.trim()).filter(Boolean)) }
    }
    return { ok: true, value: JSON.stringify(parsed) }
  }

  if (field === 'coverImage') {
    if (s.trim() === '') return { ok: true, value: null }
    if (!isValidImageUrl(s.trim())) {
      return { ok: false, error: 'coverImage must be a valid image URL starting with http(s):// or /' }
    }
    return { ok: true, value: s.trim() }
  }

  if (field === 'deliveryDate' && entity === 'PROJECT') {
    if (s.trim() === '') return { ok: true, value: null }
    const d = new Date(s)
    if (Number.isNaN(d.getTime())) {
      return { ok: false, error: 'deliveryDate must be a valid date' }
    }
    return { ok: true, value: d }
  }

  if (REQUIRED_STRING_FIELDS[entity].has(field)) {
    if (!s.trim()) return { ok: false, error: `${field} must not be empty` }
    if (field === 'name' && s.trim().length > 200) {
      return { ok: false, error: 'name must be 1–200 characters' }
    }
    return { ok: true, value: s.trim() }
  }

  if (NULLABLE_STRING_FIELDS[entity].has(field)) {
    return { ok: true, value: s.trim() === '' ? null : s.trim() }
  }

  // Non-nullable plain strings (status, unitType, currency, view, ...).
  if (!s.trim()) return { ok: false, error: `${field} must not be empty` }
  return { ok: true, value: s.trim() }
}

/** Snapshot a live column value into the string `oldValue` slot. */
export function snapshotValue(v: unknown): string | null {
  if (v === null || v === undefined) return null
  if (v instanceof Date) return v.toISOString()
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

/**
 * Permission-mode gate for developer PATCH/DELETE routes. Call AFTER the
 * ownership check (`requireOwnProject`): when the caller's DeveloperProfile
 * is in REQUEST mode, direct writes are blocked and the client must use
 * POST /api/developer/edit-requests instead. Returns an error response, or
 * null when direct edits are allowed. Reads, submit/new endpoints and the
 * visibility toggle are NOT gated — only PATCH/DELETE.
 */
export async function blockWhenRequestOnly(
  developerProfileId: string | null | undefined
): Promise<NextResponse | null> {
  if (!developerProfileId) return null
  const profile = await db.developerProfile.findUnique({
    where: { id: developerProfileId },
    select: { editMode: true },
  })
  if (profile?.editMode === 'REQUEST') {
    return NextResponse.json(
      {
        error:
          'التعديل المباشر معطّل لحسابك — أرسل طلب تعديل وسيُراجعه فريق الإدارة (Direct edits are disabled for this account — please submit an edit request instead)',
        requestOnly: true,
      },
      { status: 403 }
    )
  }
  return null
}
