import { db } from '@/lib/db'

export interface UnitsByTypeRow {
  type: string
  count: number
  startingPrice: number | null
  minArea: number | null
  maxArea: number | null
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
