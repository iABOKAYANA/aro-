// ─── Public project visibility (developer self-publishing workflow) ───
// A project is publicly visible ONLY when it is active AND its approval
// status is APPROVED or PUBLISHED. Developer submissions land as PENDING
// and stay invisible until a CEO approves them.
//
// Every public listing/detail/search/compare/map query must include
// PUBLIC_PROJECT_WHERE (Prisma) or isPublicProject (in-memory). CEO and
// owner-preview surfaces intentionally do NOT use this.
//
// NOTE: `in` arrays are typed as mutable `string[]` (not `as const`)
// because Prisma's `StringFilter.in` requires a mutable array.

// ─── Public project visibility (developer self-publishing workflow) ───
// A project is publicly visible ONLY when it is active AND its approval
// status is APPROVED or PUBLISHED AND it has a price. Developer
// submissions land as PENDING and stay invisible until a CEO approves them;
// approved projects with NO price stay hidden from PUBLIC surfaces until
// a price exists (console/CEO surfaces intentionally still list them).
//
// Every public listing/detail/search/compare/map query must include
// PUBLIC_PROJECT_WHERE (Prisma) or isPublicProject (in-memory). CEO and
// owner-preview surfaces intentionally do NOT use this.
//
// "Has price" = Project.startPrice NOT NULL AND > 0, OR EXISTS a Unit
// with price > 0 (Unit.price is required, so any unit row counts).
// Prisma form: OR: [{ startPrice: { gt: 0 } }, { units: { some: { price: { gt: 0 } } } }]
//
// NOTE: `in` arrays are typed as mutable `string[]` (not `as const`)
// because Prisma's `StringFilter.in` requires a mutable array.

export const PUBLIC_APPROVAL_STATUSES: string[] = ['APPROVED', 'PUBLISHED']

export const PUBLIC_PRICE_OR: Record<string, unknown>[] = [
  { startPrice: { gt: 0 } },
  { units: { some: { price: { gt: 0 } } } },
]

export const PUBLIC_PROJECT_WHERE: {
  isActive: boolean
  approvalStatus: { in: string[] }
  OR: Record<string, unknown>[]
} = {
  isActive: true,
  approvalStatus: { in: PUBLIC_APPROVAL_STATUSES },
  OR: PUBLIC_PRICE_OR,
}

export function isPublicProject(
  project: {
    isActive: boolean
    approvalStatus: string
    startPrice?: number | null
    units?: Array<{ price?: number | null }> | null
  } | null | undefined,
): boolean {
  if (!project) return false
  if (!project.isActive) return false
  if (!PUBLIC_APPROVAL_STATUSES.includes(project.approvalStatus)) return false
  const sp = (project as { startPrice?: unknown }).startPrice
  if (typeof sp === 'number' && sp > 0) return true
  const units = (project as { units?: unknown }).units
  if (Array.isArray(units)) {
    return units.some((u) => typeof (u as { price?: unknown })?.price === 'number' && ((u as { price: number }).price as number) > 0)
  }
  // Price fields not loaded (e.g. units/[slug] project select): fall back
  // to startPrice-only so callers without unit data never leak priceless rows.
  return false
}

/** Gate for unit queries: the unit's project must be publicly visible (incl. price). */
export const PUBLIC_UNIT_PROJECT_WHERE: {
  isActive: boolean
  approvalStatus: { in: string[] }
  OR: Record<string, unknown>[]
} = {
  isActive: true,
  approvalStatus: { in: PUBLIC_APPROVAL_STATUSES },
  OR: PUBLIC_PRICE_OR,
}
