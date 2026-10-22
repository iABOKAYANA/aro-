// ─── Public project visibility (developer self-publishing workflow) ───
// A root project is publicly visible ONLY when it is active AND its approval
// status is APPROVED or PUBLISHED. Projects assigned to a parent are never
// standalone public entries; they are rendered inside the parent's page.
//
// Every public listing/detail/search/compare/map query must include
// PUBLIC_PROJECT_WHERE (Prisma) or isPublicProject (in-memory). CEO and
// owner-preview surfaces intentionally do NOT use this.
//
// NOTE: `in` arrays are typed as mutable `string[]` (not `as const`)
// because Prisma's `StringFilter.in` requires a mutable array.

// ─── Public project visibility (developer self-publishing workflow) ───
// A root project is publicly visible ONLY when it is active, approved or
// published, and has a price on itself, its own inventory, or an eligible
// nested child project. Developer submissions land as PENDING and stay
// invisible until a CEO approves them (console/CEO surfaces intentionally
// still list them).
//
// Every public listing/detail/search/compare/map query must include
// PUBLIC_PROJECT_WHERE (Prisma) or isPublicProject (in-memory). CEO and
// owner-preview surfaces intentionally do NOT use this.
//
// "Has price" = Project.startPrice > 0, EXISTS a Unit with price > 0, OR an
// active/approved nested child has either. Unit.price is required, so any
// positive-priced unit row counts.
// Prisma form: OR: [{ startPrice: { gt: 0 } }, { units: { some: { price: { gt: 0 } } } }]
//
// NOTE: `in` arrays are typed as mutable `string[]` (not `as const`)
// because Prisma's `StringFilter.in` requires a mutable array.

export const PUBLIC_APPROVAL_STATUSES: string[] = ['APPROVED', 'PUBLISHED']

/** A nested child may be shown inside its public parent, never as a root listing. */
export const PUBLIC_CHILD_PROJECT_WHERE: {
  isActive: boolean
  approvalStatus: { in: string[] }
  OR: Record<string, unknown>[]
} = {
  isActive: true,
  approvalStatus: { in: PUBLIC_APPROVAL_STATUSES },
  OR: [
    { startPrice: { gt: 0 } },
    { units: { some: { price: { gt: 0 } } } },
  ],
}

export const PUBLIC_PRICE_OR: Record<string, unknown>[] = [
  { startPrice: { gt: 0 } },
  { units: { some: { price: { gt: 0 } } } },
  // A parent with no parent-level price can still be listed when one of its
  // active, approved child projects has a verified catalog price.
  { childProjects: { some: PUBLIC_CHILD_PROJECT_WHERE } },
]

export const PUBLIC_PROJECT_WHERE: {
  isActive: boolean
  approvalStatus: { in: string[] }
  parentProjectId: null
  OR: Record<string, unknown>[]
} = {
  isActive: true,
  approvalStatus: { in: PUBLIC_APPROVAL_STATUSES },
  parentProjectId: null,
  OR: PUBLIC_PRICE_OR,
}

export function isPublicProject(
  project: {
    isActive: boolean
    approvalStatus: string
    parentProjectId?: string | null
    startPrice?: number | null
    units?: Array<{ price?: number | null }> | null
    childProjects?: Array<{
      isActive: boolean
      approvalStatus: string
      startPrice?: number | null
      units?: Array<{ price?: number | null }> | null
    }> | null
  } | null | undefined,
): boolean {
  if (!project) return false
  // A child is only reachable as part of its parent page, not via a project
  // card, sitemap entry, or direct project URL.
  if (project.parentProjectId != null) return false
  if (!project.isActive) return false
  if (!PUBLIC_APPROVAL_STATUSES.includes(project.approvalStatus)) return false
  const sp = (project as { startPrice?: unknown }).startPrice
  if (typeof sp === 'number' && sp > 0) return true
  const units = (project as { units?: unknown }).units
  if (Array.isArray(units)) {
    if (units.some((u) => typeof (u as { price?: unknown })?.price === 'number' && ((u as { price: number }).price as number) > 0)) return true
  }
  const children = project.childProjects
  if (Array.isArray(children) && children.some((child) => {
    if (!child.isActive || !PUBLIC_APPROVAL_STATUSES.includes(child.approvalStatus)) return false
    if (typeof child.startPrice === 'number' && child.startPrice > 0) return true
    return Array.isArray(child.units) && child.units.some((u) => typeof u.price === 'number' && u.price > 0)
  })) return true
  // Price fields not loaded (e.g. units/[slug] project select): fall back
  // to startPrice-only so callers without unit data never leak priceless rows.
  return false
}

/** Gate for unit queries: the unit's project must be publicly visible (incl. price). */
export const PUBLIC_UNIT_PROJECT_WHERE: {
  isActive: boolean
  approvalStatus: { in: string[] }
  parentProjectId: null
  OR: Record<string, unknown>[]
} = {
  isActive: true,
  approvalStatus: { in: PUBLIC_APPROVAL_STATUSES },
  parentProjectId: null,
  OR: PUBLIC_PRICE_OR,
}
