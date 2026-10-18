import { db } from '@/lib/db'

export interface UnitsByTypeRow {
  type: string
  count: number
  startingPrice: number | null
  minArea: number | null
  maxArea: number | null
}

/** One row per OFFERED CATEGORY (bedroom count / unit kind) — not per unit. */
export interface UnitCategoryRow {
  key: string
  labelEn: string
  labelAr: string
  count: number
  /** المساحة الأولية — smallest buyable area inside the category. */
  minArea: number | null
  /** يبدأ من — cheapest buyable price inside the category. */
  startingPrice: number | null
}

/**
 * Buyable inventory grouped by raw `Unit.unitType`: count, MIN price,
 * MIN/MAX area. Buyable = non-sample rows with a reservable status
 * (`AVAILABLE` + legacy `Vacant` — the same rule the project page uses).
 * One `groupBy` query, no N+1. Empty array when the project has no units.
 */
export async function getUnitsByType(projectId: string): Promise<UnitsByTypeRow[]> {
  const groups = await db.unit.groupBy({
    by: ['unitType'],
    where: { projectId, isSample: false, status: { in: ['AVAILABLE', 'Vacant'] } },
    _count: { unitType: true },
    _min: { price: true, area: true },
    _max: { area: true },
    orderBy: { unitType: 'asc' },
  })
  return groups.map((g) => ({
    type: g.unitType,
    count: g._count.unitType,
    startingPrice: g._min.price ?? null,
    minArea: g._min.area ?? null,
    maxArea: g._max.area ?? null,
  }))
}

/**
 * Highest `cashDiscount` percent across a set of payment plans
 * (`cashDiscount` is a percent — see `toolCalculatePayment`).
 * Null when no plan carries a positive discount.
 */
export function maxDiscountOf(
  plans: Array<{ cashDiscount?: number | null }>
): number | null {
  let max: number | null = null
  for (const plan of plans) {
    const discount = Number(plan?.cashDiscount)
    if (Number.isFinite(discount) && discount > 0 && (max === null || discount > max)) {
      max = discount
    }
  }
  return max
}

/** Category display labels (AR colloquial, EN compact). */
const CATEGORY_LABELS: Record<string, [string, string]> = {
  BED_1: ['شقة غرفة واحدة', '1BR'],
  BED_2: ['شقة غرفتين', '2BR'],
  BED_3: ['شقة 3 غرف', '3BR'],
  BED_4: ['شقة 4 غرف', '4BR'],
  BED_5: ['شقة 5 غرف وأكثر', '5BR+'],
  BED_NULL: ['شقة', 'Apartment'],
  STUDIO: ['استوديو', 'Studio'],
  DUPLEX: ['دوبلكس', 'Duplex'],
  PENTHOUSE: ['بنتهاوس', 'Penthouse'],
  VILLA: ['بناني (فيلا مستقلة)', 'Standalone villa'],
  VILLA_TWIN: ['توين هاوس', 'Twin house'],
  TOWNHOUSE: ['تاون هاوس', 'Townhouse'],
  CHALET: ['شاليه', 'Chalet'],
  COMMERCIAL: ['محل تجاري', 'Retail'],
  ADMINISTRATIVE: ['إداري', 'Administrative'],
  MEDICAL: ['عيادة', 'Clinic'],
}

/**
 * Desired row order: شقق بالغرف، بعدين الاستوديو والدوبلكس والبنتهاوس،
 * بعدين الفيلات/الشاليهات، بعدين التجاري/الإداري/الطبي، وأي نوع تاني آخرًا.
 */
const CATEGORY_ORDER = [
  'BED_1', 'BED_2', 'BED_3', 'BED_4', 'BED_5', 'BED_NULL',
  'STUDIO', 'DUPLEX', 'PENTHOUSE', 'VILLA', 'VILLA_TWIN', 'TOWNHOUSE',
  'CHALET', 'COMMERCIAL', 'ADMINISTRATIVE', 'MEDICAL', 'OTHER',
]

/**
 * Group buyable units into ONE row per category (1BR / 2BR / 3BR / 4BR /
 * 5BR+ apartments, studio, duplex, penthouse, standalone villa, twin house,
 * townhouse, chalet, retail, administrative, clinic).
 *
 * Buyable = non-sample rows reservable (`AVAILABLE` + legacy `Vacant`) —
 * the same rule the project page and `getUnitsByType` use. Per row the
 * aggregates are independent and honestly labeled: `minArea` is the smallest
 * area in the category ("المساحة الأولية") and `startingPrice` is the
 * cheapest price ("يبدأ من") — they may come from different units.
 *
 * Twin villas are distinguished from standalone villas by the unit NAME only
 * (the source data marks "Twin Villa"/"توين" in the name) — no fabrication.
 */
export function unitCategoryRows(
  units: Array<{
    unitType?: string | null
    bedrooms?: number | null
    area?: number | null
    price?: number | null
    status?: string | null
    isSample?: boolean | null
    name?: string | null
    nameArabic?: string | null
  }>
): UnitCategoryRow[] {
  const rows = new Map<string, UnitCategoryRow>()
  for (const u of units) {
    if (u?.isSample === true) continue
    if (u?.status !== 'AVAILABLE' && u?.status !== 'Vacant') continue
    const type = String(u.unitType ?? '').trim()
    if (!type) continue
    const beds = typeof u.bedrooms === 'number' && Number.isFinite(u.bedrooms) ? u.bedrooms : null
    // Apartments split by bedroom count; every other kind stays one row.
    const key = type === 'APARTMENT'
      ? beds === null || beds === 0 ? 'BED_NULL' : beds >= 5 ? 'BED_5' : `BED_${beds}`
      : type === 'VILLA' && (String(u.name ?? '').toLowerCase().includes('twin') || String(u.nameArabic ?? '').includes('توين'))
        ? 'VILLA_TWIN'
        : CATEGORY_ORDER.includes(type) ? type : 'OTHER'
    const row = rows.get(key) ?? { key, labelEn: '', labelAr: '', count: 0, minArea: null, startingPrice: null }
    row.count += 1
    if (typeof u.area === 'number' && Number.isFinite(u.area) && u.area > 0) {
      row.minArea = row.minArea === null ? u.area : Math.min(row.minArea, u.area)
    }
    if (typeof u.price === 'number' && Number.isFinite(u.price) && u.price > 0) {
      row.startingPrice = row.startingPrice === null ? u.price : Math.min(row.startingPrice, u.price)
    }
    const label = CATEGORY_LABELS[key] ?? [type.replace(/_/g, ' '), type.replace(/_/g, ' ')]
    row.labelAr = label[0]
    row.labelEn = label[1]
    rows.set(key, row)
  }
  return [...rows.values()].sort(
    (a, b) => CATEGORY_ORDER.indexOf(a.key) - CATEGORY_ORDER.indexOf(b.key),
  )
}
