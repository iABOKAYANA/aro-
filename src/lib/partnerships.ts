import { db } from '@/lib/db'

// ─── Developer Partnership & Broker Access ───────────────
// Deterministic access rules. Used before registering a lead or
// creating a deal on behalf of a developer partnership.

export type PartnershipStatus =
  | 'PENDING'
  | 'UNDER_REVIEW'
  | 'APPROVED'
  | 'ACTIVE'
  | 'SUSPENDED'
  | 'REJECTED'
  | 'EXPIRED'

export const PARTNERSHIP_LEAD_STATUSES: PartnershipStatus[] = ['APPROVED', 'ACTIVE']

export interface AccessDecision {
  allowed: boolean
  reason?: string
  partnershipStatus?: string
}

function parseIdList(value: string | null | undefined): string[] {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === 'string') : []
  } catch {
    return []
  }
}

export function isPartnershipValid(row: {
  status: string
  isActive: boolean
  startDate: Date | null
  endDate: Date | null
}): boolean {
  if (!row.isActive) return false
  if (!PARTNERSHIP_LEAD_STATUSES.includes(row.status as PartnershipStatus)) return false
  const now = Date.now()
  if (row.startDate && new Date(row.startDate).getTime() > now) return false
  if (row.endDate && new Date(row.endDate).getTime() < now) return false
  return true
}

/**
 * Can this broker register a lead / create a deal for this developer+project?
 * - explicit BrokerProjectAccess BLOCKED always wins
 * - explicit APPROVED grants access
 * - if a partnership row exists it must be valid (APPROVED/ACTIVE, dates OK)
 * - partnership allowlist/blocklist is enforced when non-empty
 * - no partnership row at all → allowed (nothing configured to violate)
 */
export async function canBrokerAccess(params: {
  brokerId: string
  developerId?: string | null
  projectId?: string | null
}): Promise<AccessDecision> {
  try {
    // 1. Explicit access rows (project-specific first, then developer-wide)
    const rows = await db.brokerProjectAccess.findMany({
      where: {
        brokerId: params.brokerId,
        ...(params.projectId
          ? { OR: [{ projectId: params.projectId }, { projectId: null, developerId: params.developerId ?? null }] }
          : params.developerId
            ? { developerId: params.developerId, projectId: null }
            : {}),
      },
      orderBy: { createdAt: 'desc' },
    })
    const projectRow = params.projectId ? rows.find((r) => r.projectId === params.projectId) : null
    const broadRow = rows.find((r) => r.projectId === null)
    const effective = projectRow || broadRow
    if (effective) {
      const expired = effective.expiresAt && new Date(effective.expiresAt).getTime() < Date.now()
      if (!expired) {
        if (effective.access === 'BLOCKED') return { allowed: false, reason: 'Broker access revoked for this project' }
        if (effective.access === 'APPROVED') return { allowed: true, partnershipStatus: 'APPROVED' }
      }
    }

    if (!params.developerId) return { allowed: true }

    // 2. Partnership rules
    const partnership = await db.developerPartnership.findUnique({
      where: { developerId: params.developerId },
    })
    if (!partnership) return { allowed: true }

    if (!isPartnershipValid(partnership)) {
      return {
        allowed: false,
        reason: `Developer partnership is ${partnership.status.toLowerCase().replace('_', ' ')}`,
        partnershipStatus: partnership.status,
      }
    }

    const blocked = parseIdList(partnership.blockedBrokerIds)
    if (blocked.includes(params.brokerId)) {
      return { allowed: false, reason: 'Broker is not approved for this developer', partnershipStatus: partnership.status }
    }

    const allowed = parseIdList(partnership.allowedBrokerIds)
    if (allowed.length > 0 && !allowed.includes(params.brokerId)) {
      return { allowed: false, reason: 'Broker is not on the approved list for this developer', partnershipStatus: partnership.status }
    }

    if (!partnership.allProjectsApproved && params.projectId) {
      const approved = parseIdList(partnership.approvedProjectIds)
      if (approved.length > 0 && !approved.includes(params.projectId)) {
        return { allowed: false, reason: 'Project is not covered by this partnership', partnershipStatus: partnership.status }
      }
    }

    return { allowed: true, partnershipStatus: partnership.status }
  } catch (e) {
    console.error('[partnership] access check failed:', e)
    // fail closed for broker-initiated writes
    return { allowed: false, reason: 'Access check failed, try again' }
  }
}
